import { uid, validateProject } from './domain.js';

let db;
export const cloudMode = window.__TRAMA_CLOUD__ === true;
export const storageLabel = () => cloudMode ? 'Guardado en Drive privado' : 'Guardado en este navegador';
const rpcMethods = new Set(['getCloudInfo', 'listCloudProjects', 'saveCloudProject', 'uploadCloudOriginal', 'rebuildCloudIndexes', 'listCloudVersions', 'getCloudVersion']);
export function cloudCall(method, ...args) {
  if (!cloudMode || !window.google?.script?.run || !rpcMethods.has(method)) return Promise.reject(new Error('La conexión privada con Apps Script no está disponible. Abre la URL de tu instalación Google.'));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Google no confirmó la operación a tiempo. Puede haberse completado; revisa Recuperación local antes de repetirla.')), 90000);
    window.google.script.run
      .withSuccessHandler(result => { clearTimeout(timer); resolve(result); })
      .withFailureHandler(error => { clearTimeout(timer); reject(new Error(error?.message || 'Google rechazó la operación. Revisa permisos y conexión.')); })[method](...args);
  });
}
function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function openDB() {
  const request = indexedDB.open('trama-cualitativa', 3);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains('projects')) request.result.createObjectStore('projects', { keyPath: 'id' });
    if (!request.result.objectStoreNames.contains('pending')) request.result.createObjectStore('pending', { keyPath: 'id' });
    if (!request.result.objectStoreNames.contains('projectFiles')) request.result.createObjectStore('projectFiles', { keyPath: 'id' });
  };
  db = await requestResult(request);
  db.onversionchange = () => db.close();
}
export async function listProjects() {
  if (cloudMode) return (await cloudCall('listCloudProjects')).map(validateProject);
  return requestResult(db.transaction('projects').objectStore('projects').getAll());
}
export async function saveProject(project, expectedUpdatedAt) {
  if (cloudMode) {
    const pending = { id: uid(), project: structuredClone(project), expectedUpdatedAt: expectedUpdatedAt ?? null, createdAt: new Date().toISOString() };
    await localWrite('pending', pending);
    return sendPending(pending);
  }
  await new Promise((resolve, reject) => {
    const tx = db.transaction('projects', 'readwrite');
    const store = tx.objectStore('projects');
    let conflict;
    if (expectedUpdatedAt !== undefined) {
      const read = store.get(project.id);
      read.onsuccess = () => {
        if (read.result?.updatedAt !== expectedUpdatedAt) {
          conflict = new Error('El proyecto cambió en otra pestaña. Recarga la página antes de continuar para no sobrescribirlo.');
          tx.abort();
        } else store.put(project);
      };
    } else store.put(project);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(conflict || tx.error || new Error('Guardado interrumpido.'));
  });
  await syncProjectFile(project.id);
  return project;
}
function localWrite(storeName, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('No se pudo guardar la copia de recuperación local.'));
  });
}
const fileStates = new Map();
export function projectFileState(id) {
  return fileStates.get(id) || { status: 'none' };
}
function setFileState(id, status, message = '') {
  fileStates.set(id, { status, message });
  window.dispatchEvent(new CustomEvent('trama-file-state', { detail: { id, status, message } }));
}
const fileRecord = id => requestResult(db.transaction('projectFiles').objectStore('projectFiles').get(id));
async function fileDigest(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function refreshProjectFileState(project) {
  if (cloudMode || !project) return;
  if (!navigator.locks) return setFileState(project.id, 'none');
  let needsSync = false;
  await navigator.locks.request('trama-project-files', async () => {
    try {
      const record = await fileRecord(project.id);
      if (!record) return setFileState(project.id, 'none');
      const permission = await record.handle.queryPermission({ mode: 'readwrite' });
      if (permission !== 'granted') return setFileState(project.id, 'permission');
      const file = await record.handle.getFile();
      if (await fileDigest(await file.text()) !== record.fingerprint) return setFileState(project.id, 'conflict', 'El archivo cambió fuera de TRAMA-QDA. No se sobrescribió; descarga un respaldo o elige otro archivo.');
      needsSync = record.updatedAt !== project.updatedAt;
      setFileState(project.id, needsSync ? 'pending' : 'saved');
    } catch (error) {
      console.error('No se pudo comprobar el archivo de proyecto:', error);
      setFileState(project.id, 'error', `No se pudo comprobar el archivo. Los cambios están en el navegador; descarga un respaldo. ${error.message}`);
    }
  });
  if (needsSync) await syncProjectFile(project.id);
}
export async function connectProjectFile(project, suggestedName) {
  if (!window.showSaveFilePicker || !navigator.locks) throw new Error('Este navegador no permite guardar el archivo automáticamente. Descarga un respaldo .trama.');
  const handle = await window.showSaveFilePicker({
    suggestedName,
    types: [{ description: 'Proyecto TRAMA-QDA', accept: { 'application/json': ['.trama'] } }],
  });
  await navigator.locks.request('trama-project-files', async () => {
    const selected = await handle.getFile();
    if (selected.size) throw new Error('El archivo elegido ya contiene datos. Elige un archivo nuevo para evitar sobrescribirlo.');
    const fingerprint = await fileDigest(await selected.text());
    await localWrite('projectFiles', { id: project.id, handle, fingerprint, updatedAt: null });
  });
  await syncProjectFile(project.id);
}
export async function reconnectProjectFile(project) {
  const record = await fileRecord(project.id);
  if (!record) throw new Error('No hay un archivo conectado. Elige un archivo nuevo.');
  const permission = await record.handle.requestPermission({ mode: 'readwrite' });
  if (permission !== 'granted') {
    setFileState(project.id, 'permission');
    throw new Error('No se autorizó el archivo. El proyecto sigue guardado en el navegador; descarga un respaldo.');
  }
  await syncProjectFile(project.id);
}
export async function syncProjectFile(id) {
  if (cloudMode || !navigator.locks) return;
  try {
    await navigator.locks.request('trama-project-files', async () => {
      const record = await fileRecord(id);
      if (!record) return setFileState(id, 'none');
      if (await record.handle.queryPermission({ mode: 'readwrite' }) !== 'granted') return setFileState(id, 'permission');
      const project = await requestResult(db.transaction('projects').objectStore('projects').get(id));
      if (!project) throw new Error('El proyecto ya no está disponible en este navegador.');
      setFileState(id, 'writing');
      const file = await record.handle.getFile();
      if (await fileDigest(await file.text()) !== record.fingerprint) {
        return setFileState(id, 'conflict', 'El archivo cambió fuera de TRAMA-QDA. No se sobrescribió; descarga un respaldo o elige otro archivo.');
      }
      const content = JSON.stringify(project, null, 2);
      const writable = await record.handle.createWritable();
      try {
        await writable.write(content);
        await writable.close();
      } catch (error) {
        await writable.abort().catch(abortError => console.error('No se pudo cancelar la escritura del archivo:', abortError));
        throw error;
      }
      await localWrite('projectFiles', { ...record, fingerprint: await fileDigest(content), updatedAt: project.updatedAt });
      setFileState(id, 'saved');
    });
  } catch (error) {
    console.error('No se pudo actualizar el archivo de proyecto:', error);
    setFileState(id, 'error', `No se pudo actualizar el archivo. Los cambios están en el navegador; descarga un respaldo. ${error.message}`);
  }
}
async function sendPending(pending) {
  const result = await cloudCall('saveCloudProject', pending.project, pending.expectedUpdatedAt, pending.id);
  const saved = validateProject(result.project);
  if (saved.id !== pending.project.id || result.revision !== pending.id) throw new Error('Respuesta inesperada de Google. Conservamos el intento en Recuperación local.');
  await new Promise((resolve, reject) => {
    const tx = db.transaction(['projects', 'pending'], 'readwrite');
    tx.objectStore('projects').put(saved);
    tx.objectStore('pending').delete(pending.id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('El guardado remoto terminó, pero no se pudo actualizar su copia local. Revisa Recuperación local.'));
  });
  return saved;
}
export async function listPending() {
  if (!cloudMode) return [];
  return requestResult(db.transaction('pending').objectStore('pending').getAll());
}
export async function retryPending(id) {
  const pending = await requestResult(db.transaction('pending').objectStore('pending').get(id));
  if (!pending) throw new Error('Este intento ya fue resuelto.');
  return sendPending(pending);
}
export async function discardPending(id) {
  await new Promise((resolve, reject) => {
    const tx = db.transaction('pending', 'readwrite');
    tx.objectStore('pending').delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('No se pudo descartar el intento local.'));
  });
}
export async function uploadOriginal(file) {
  if (!cloudMode) return null;
  if (file.size > 8 * 1024 * 1024) throw new Error('El original supera 8 MB, límite de esta instalación Google.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const blocks = [];
  for (let i = 0; i < bytes.length; i += 32768) blocks.push(String.fromCharCode(...bytes.subarray(i, i + 32768)));
  return cloudCall('uploadCloudOriginal', btoa(blocks.join('')), file.name, file.type);
}
