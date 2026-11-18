let db;
export const storageLabel = () => 'Guardado en este navegador';
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
  return requestResult(db.transaction('projects').objectStore('projects').getAll());
}
export async function saveProject(project, expectedUpdatedAt) {
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
        } else {
          const previous = Date.parse(read.result.updatedAt);
          const proposed = Date.parse(project.updatedAt);
          if (Number.isFinite(previous) && (!Number.isFinite(proposed) || proposed <= previous)) {
            if (previous >= 8640000000000000) {
              conflict = new Error('La fecha de revisión del proyecto no permite guardar. Descarga un respaldo antes de continuar.');
              tx.abort();
              return;
            }
            project.updatedAt = new Date(previous + 1).toISOString();
          } else if (project.updatedAt === read.result.updatedAt) {
            project.updatedAt = new Date().toISOString();
          }
          store.put(project);
        }
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
  if (!project) return;
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
  if (!navigator.locks) return;
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
