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
  const request = indexedDB.open('trama-cualitativa', 2);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains('projects')) request.result.createObjectStore('projects', { keyPath: 'id' });
    if (!request.result.objectStoreNames.contains('pending')) request.result.createObjectStore('pending', { keyPath: 'id' });
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
