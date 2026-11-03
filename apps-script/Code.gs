const TRAMA_HEADERS = {
  Proyectos: ['ID', 'Nombre', 'Revisión', 'Archivo de versión', 'Actualizado', 'Carpeta', 'Índices actualizados'],
  Documentos: ['Proyecto', 'ID', 'Nombre', 'Caracteres', 'Archivo original'],
  Preguntas: ['Proyecto', 'ID', 'Tipo', 'Texto', 'Archivado'],
  Categorias: ['Proyecto', 'ID', 'Nombre', 'Definición'],
  Codigos: ['Proyecto', 'ID', 'Nombre', 'Ruta', 'Definición', 'Incluir', 'Excluir'],
  Citas: ['Proyecto', 'ID', 'Documento', 'Inicio', 'Fin', 'Códigos', 'Memo', 'Archivo de versión', 'Preguntas y objetivos'],
  Relaciones: ['Proyecto', 'ID', 'Origen', 'Destino', 'Tipo', 'Citas', 'Memo'],
  Bitacora: ['Proyecto', 'ID', 'Fecha', 'Acción', 'Detalle']
};
const TRAMA_MAX_BYTES = 8 * 1024 * 1024;

function setupTrama() {
  const active = Session.getActiveUser().getEmail().toLowerCase();
  const effective = Session.getEffectiveUser().getEmail().toLowerCase();
  if (!active || active !== effective) throw new Error('Ejecuta setupTrama desde el editor con la cuenta propietaria.');
  const props = PropertiesService.getScriptProperties();
  const owner = props.getProperty('TRAMA_OWNER');
  if (owner && owner !== active) throw new Error('Esta instalación pertenece a otra cuenta.');
  return withLock_(function () {
    let folderId = props.getProperty('TRAMA_FOLDER');
    let spreadsheetId = props.getProperty('TRAMA_SHEET');
    if (!folderId) {
      const folder = DriveApp.createFolder('Trama cualitativa · privado');
      folder.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
      folderId = folder.getId();
      props.setProperty('TRAMA_FOLDER', folderId);
    }
    if (!spreadsheetId) {
      const book = SpreadsheetApp.create('Trama cualitativa · índices');
      const file = DriveApp.getFileById(book.getId());
      file.moveTo(DriveApp.getFolderById(folderId));
      file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
      spreadsheetId = book.getId();
      props.setProperty('TRAMA_SHEET', spreadsheetId);
    }
    const book = SpreadsheetApp.openById(spreadsheetId);
    Object.keys(TRAMA_HEADERS).forEach(function (name) {
      const sheet = book.getSheetByName(name) || book.insertSheet(name);
      sheet.getRange(1, 1, 1, TRAMA_HEADERS[name].length).setValues([TRAMA_HEADERS[name]]);
      sheet.setFrozenRows(1);
    });
    props.setProperty('TRAMA_OWNER', active);
    const result = { spreadsheetUrl: book.getUrl(), folderUrl: DriveApp.getFolderById(folderId).getUrl() };
    console.log(JSON.stringify(result));
    return result;
  });
}

function authorize_() {
  const props = PropertiesService.getScriptProperties();
  const owner = props.getProperty('TRAMA_OWNER');
  const active = Session.getActiveUser().getEmail().toLowerCase();
  const effective = Session.getEffectiveUser().getEmail().toLowerCase();
  if (!owner || !active || active !== owner || effective !== owner) {
    throw new Error('Acceso denegado. Abre la instalación privada con la cuenta que ejecutó setupTrama.');
  }
  if (!props.getProperty('TRAMA_FOLDER') || !props.getProperty('TRAMA_SHEET')) throw new Error('Instalación incompleta. Ejecuta setupTrama desde el editor.');
  return props;
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) throw new Error('Otro guardado está en curso. Espera unos segundos y vuelve a intentar.');
  try { return fn(); } finally { lock.releaseLock(); }
}

function doGet() {
  authorize_();
  return HtmlService.createHtmlOutputFromFile('Index').setTitle('Trama cualitativa · privado');
}

function book_() {
  return SpreadsheetApp.openById(authorize_().getProperty('TRAMA_SHEET'));
}

function rows_(sheet) {
  return sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, TRAMA_HEADERS.Proyectos.length).getValues() : [];
}

function entry_(book, id) {
  const rows = rows_(book.getSheetByName('Proyectos'));
  const index = rows.findIndex(function (row) { return row[0] === id; });
  return index < 0 ? null : { row: index + 2, values: rows[index] };
}

function checkId_(id) {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error('Identificador inválido.');
}

function readSnapshot_(fileId) {
  const p = validateProject(JSON.parse(DriveApp.getFileById(fileId).getBlob().getDataAsString('UTF-8')));
  return p;
}

function listCloudProjects() {
  authorize_();
  return withLock_(function () {
    return rows_(book_().getSheetByName('Proyectos')).map(function (row) {
      const p = readSnapshot_(row[3]);
      if (p.id !== row[0] || p.updatedAt !== row[4]) throw new Error('El índice y su versión no coinciden. No edites la hoja Proyectos manualmente.');
      return p;
    });
  });
}

function getCloudInfo() {
  const props = authorize_();
  return {
    spreadsheetUrl: SpreadsheetApp.openById(props.getProperty('TRAMA_SHEET')).getUrl(),
    folderUrl: DriveApp.getFolderById(props.getProperty('TRAMA_FOLDER')).getUrl(),
    maxProjectBytes: TRAMA_MAX_BYTES
  };
}

function saveCloudProject(payload, expectedUpdatedAt, operationId) {
  const props = authorize_();
  checkId_(operationId);
  validateProject(payload);
  const json = JSON.stringify(payload);
  if (Utilities.newBlob(json).getBytes().length > TRAMA_MAX_BYTES) throw new Error('El proyecto supera 8 MB de JSON. Divide el corpus y conserva respaldos.');
  return withLock_(function () {
    const book = book_();
    const sheet = book.getSheetByName('Proyectos');
    const current = entry_(book, payload.id);
    if (current && current.values[2] === operationId) {
      const saved = readSnapshot_(current.values[3]);
      return { project: saved, revision: operationId, indexesStale: current.values[6] !== saved.updatedAt };
    }
    if ((current && current.values[4] !== expectedUpdatedAt) || (!current && expectedUpdatedAt !== null)) {
      throw new Error('CONFLICTO: el proyecto cambió en otra pestaña o equipo. Recarga antes de continuar. Tu intento queda en Recuperación local.');
    }
    const root = DriveApp.getFolderById(props.getProperty('TRAMA_FOLDER'));
    const folder = current ? DriveApp.getFolderById(current.values[5]) : root.createFolder('Proyecto ' + payload.id);
    const copy = JSON.parse(json);
    const timestamp = new Date(Math.max(Date.now(), current ? Date.parse(current.values[4]) + 1 : 0)).toISOString();
    copy.updatedAt = timestamp;
    copy.cloudRevision = operationId;
    const file = folder.createFile(Utilities.newBlob(JSON.stringify(copy), 'application/json', 'version-' + operationId + '.json'));
    const values = [copy.id, cell_(copy.name), operationId, file.getId(), timestamp, folder.getId(), current ? current.values[6] : ''];
    // The single pointer row commits an immutable, complete project version.
    sheet.getRange(current ? current.row : sheet.getLastRow() + 1, 1, 1, values.length).setValues([values]);
    SpreadsheetApp.flush();
    return { project: copy, revision: operationId, indexesStale: true };
  });
}

function uploadCloudOriginal(bytes, name, mimeType) {
  const props = authorize_();
  if (typeof name !== 'string' || !/\.(txt|docx)$/i.test(name) || name.length > 500) throw new Error('Solo se admiten originales TXT y DOCX.');
  if (typeof bytes !== 'string' || bytes.length > 12 * 1024 * 1024) throw new Error('El original supera el límite de 8 MB. Divídelo antes de importarlo.');
  const decoded = Utilities.base64Decode(bytes);
  if (decoded.length > TRAMA_MAX_BYTES) throw new Error('El original supera 8 MB.');
  const type = /\.docx$/i.test(name) ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'text/plain';
  if (mimeType && mimeType !== type && mimeType !== 'application/octet-stream') throw new Error('El tipo del archivo no corresponde a su extensión.');
  return withLock_(function () {
    const root = DriveApp.getFolderById(props.getProperty('TRAMA_FOLDER'));
    const folders = root.getFoldersByName('Originales');
    const folder = folders.hasNext() ? folders.next() : root.createFolder('Originales');
    return folder.createFile(Utilities.newBlob(decoded, type, name)).getId();
  });
}

function cell_(value) {
  const text = String(value == null ? '' : value);
  if (text.length > 45000) return cell_(text.slice(0, 44900) + ' [abre el JSON de Drive para el contenido completo]');
  return /^[\s]*[=+\-@]/.test(text) ? "'" + text : text;
}

function rebuildCloudIndexes() {
  authorize_();
  return withLock_(function () {
    const book = book_();
    const entries = rows_(book.getSheetByName('Proyectos'));
    const output = {};
    Object.keys(TRAMA_HEADERS).filter(function (name) { return name !== 'Proyectos'; }).forEach(function (name) { output[name] = []; });
    entries.forEach(function (row) {
      const p = readSnapshot_(row[3]);
      p.documents.forEach(function (d) { output.Documentos.push([p.id, d.id, d.name, d.text.length, d.originalFileId || '']); });
      (p.researchQuestions || []).forEach(function (q) { output.Preguntas.push([p.id, q.id, q.kind, q.text, q.archived ? 'Sí' : 'No']); });
      p.categories.forEach(function (c) { output.Categorias.push([p.id, c.id, c.name, c.description]); });
      p.codes.forEach(function (c) { output.Codigos.push([p.id, c.id, c.name, codePath(p, c.id), c.description, c.inclusion, c.exclusion]); });
      p.quotes.forEach(function (q) { output.Citas.push([p.id, q.id, q.documentId, q.start, q.end, q.codeIds.join(', '), q.memo, row[3], (q.researchQuestionIds || []).join(', ')]); });
      p.relations.forEach(function (r) { output.Relaciones.push([p.id, r.id, r.source, r.target, r.type, r.quoteIds.join(', '), r.memo]); });
      p.history.forEach(function (h) { output.Bitacora.push([p.id, h.id, h.at, h.action, h.detail]); });
    });
    // Index tabs are disposable projections; mark them stale before replacing them.
    if (entries.length) book.getSheetByName('Proyectos').getRange(2, 7, entries.length, 1).clearContent();
    Object.keys(output).forEach(function (name) {
      const sheet = book.getSheetByName(name);
      const columns = TRAMA_HEADERS[name].length;
      const data = output[name].map(function (row) { return row.map(cell_); });
      if (sheet.getLastRow() > 1) sheet.getRange(2, 1, sheet.getLastRow() - 1, columns).clearContent();
      if (data.length + 1 > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), data.length + 1 - sheet.getMaxRows());
      for (let i = 0; i < data.length; i += 500) {
        const batch = data.slice(i, i + 500);
        sheet.getRange(i + 2, 1, batch.length, columns).setValues(batch);
      }
    });
    if (entries.length) book.getSheetByName('Proyectos').getRange(2, 7, entries.length, 1).setValues(entries.map(function (row) { return [row[4]]; }));
    SpreadsheetApp.flush();
    return { projects: entries.length, spreadsheetUrl: book.getUrl() };
  });
}

function listCloudVersions(projectId) {
  authorize_();
  checkId_(projectId);
  return withLock_(function () {
    const entry = entry_(book_(), projectId);
    if (!entry) throw new Error('Proyecto no encontrado.');
    const files = DriveApp.getFolderById(entry.values[5]).getFiles();
    const versions = [];
    while (files.hasNext()) {
      const file = files.next();
      if (/^version-[a-zA-Z0-9_-]+\.json$/.test(file.getName())) {
        versions.push({ id: file.getId(), name: file.getName(), createdAt: file.getDateCreated().toISOString(), current: file.getId() === entry.values[3] });
      }
    }
    return versions.sort(function (a, b) { return b.createdAt.localeCompare(a.createdAt); });
  });
}

function getCloudVersion(projectId, fileId) {
  authorize_();
  checkId_(projectId);
  const entries = listCloudVersions(projectId);
  if (!entries.some(function (v) { return v.id === fileId; })) throw new Error('La versión no pertenece a este proyecto.');
  const p = readSnapshot_(fileId);
  if (p.id !== projectId) throw new Error('La versión contiene otro proyecto.');
  return p;
}
