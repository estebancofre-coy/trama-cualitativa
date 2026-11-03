let db;
function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function openDB() {
  const request = indexedDB.open('trama-cualitativa', 1);
  request.onupgradeneeded = () => request.result.createObjectStore('projects', { keyPath: 'id' });
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
        } else store.put(project);
      };
    } else store.put(project);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(conflict || tx.error || new Error('Guardado interrumpido.'));
  });
}
