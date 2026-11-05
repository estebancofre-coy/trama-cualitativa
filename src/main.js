import './style.css';
import '@fontsource/libre-franklin/latin-400.css';
import '@fontsource/libre-franklin/latin-500.css';
import '@fontsource/libre-franklin/latin-600.css';
import '@fontsource/libre-franklin/latin-700.css';
import '@fontsource/libre-baskerville/latin-400.css';
import '@fontsource/libre-baskerville/latin-400-italic.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import { createElement, FileText, Tags, Quote, GitBranch, SquarePen, ClipboardCheck, History, Plus, Download, Upload, Undo2, Settings2, Pencil, Trash2, X, Check, Copy, FolderOpen, HelpCircle, Maximize2, Network, Link2, Clock, CircleAlert } from 'lucide';
import brandMark from './assets/trama-qda-mark.svg?inline';
import { uid, now, colors, relationTypes, escapeHTML as e, project, log, paragraphs, location, addQuote, validateProject, codePath, promptText, promptManifest, exportPrompt, stageExternalResults, verifyExternalProposal, decideExternalResult, csv, demoProject, updateResearchBank } from './domain.js';
import { openDB, listProjects, saveProject, cloudMode, storageLabel, cloudCall, listPending, retryPending, discardPending, uploadOriginal } from './storage.js';
import { autoLayout, mapLayouts, mapEdges, mapSignature, edgeGeometry } from './map-layout.js';

const app = document.querySelector('#app');
const dialog = document.querySelector('#dialog');
let projects = [];
let current;
let tab = 'documents';
let docId;
let selection = null;
let quoteFilter = '';
let categoryFilter = '';
let documentSearch = '';
let quoteSearch = '';
let researchFilter = '';
let lastPrompt = '';
let lastPromptId;
let saving = false;
let undoSnapshot;
let undoProjectId;
let undoAction = '';
let noticeTimer;
let captureSelection;
let pendingCount = 0;
let mapOrganizing = false;
let mapConnecting = false;
let mapSource;
let mapQuickOpen = true;
let mapClassicOpen = false;
const privacySummary = cloudMode ? 'Instalación privada · Drive y Sheets · Sin IA integrada.' : 'Sin IA integrada. Sin envío de entrevistas.';
const tabs = [['documents', 'Documentos'], ['book', 'Libro de códigos'], ['quotes', 'Citas e insertos'], ['map', 'Mapa de relaciones'], ['prompts', 'Prompts sin API'], ['review', 'Revisión externa'], ['history', 'Bitácora']];
const findCode = id => current.codes.find(c => c.id === id);
const findNode = id => [...current.categories, ...current.codes].find(c => c.id === id);
const activeResearch = () => (current.researchQuestions || []).filter(q => !q.archived);
const researchItems = () => activeResearch().map(q => ({id:q.id,name:`${q.kind}: ${q.text}`}));
const researchText = quote => (current.researchQuestions || []).filter(q => (quote.researchQuestionIds || []).includes(q.id)).map(q => `${q.kind}: ${q.text}${q.archived?' (archivado)':''}`).join(' · ');
const icon = shape => createElement(shape,{width:'16',height:'16',class:'ui-icon','aria-hidden':'true',focusable:'false'}).outerHTML;
const actionIcons = {'new-project':Plus,'new-code':Plus,'new-category':Plus,'new-relation':Plus,'backup':Download,'restore':Upload,'import-document':Upload,'paste-document':FileText,'edit-project':Settings2,'undo':Undo2,'help':HelpCircle,'close-dialog':X,'edit-code':Pencil,'edit-category':Pencil,'edit-quote':Pencil,'edit-relation':Pencil,'delete-quote':Trash2,'delete-relation':Trash2,'export-book':Download,'export-quotes':Download,'export-report':Download,'export-map':Download,'export-map-png':Download,'download-prompt':Download,'copy-prompt':Copy,'organize-map':Network,'connect-map':Link2,'fit-map':Maximize2,'import-results':Upload,'choose-results':FolderOpen,'accept-result':Check,'reject-result':X,'result-source':FileText,'source':FileText,'cloud-panel':FolderOpen,'recovery':History,'load-prompt':FolderOpen};
const button = (action, text, cls = '', attrs = '') => {
  const prefix = actionIcons[action] ? text.match(/^[+↑↓↶✓]\s*/)?.[0] || '' : '';
  return `<button type="button" class="${cls}" data-action="${action}" ${attrs} ${attrs.includes('title=')?'':`title="${e(text)}"`}>${actionIcons[action]?icon(actionIcons[action]):''}<span>${prefix?`<span class="sr-only">${prefix}</span>`:''}${text.slice(prefix.length)}</span></button>`;
};
const brand = `<img class="brand-mark" src="${brandMark}" alt="" width="40" height="40"><div><span class="brand-name">TRAMA<span class="brand-suffix">-QDA</span></span><small>análisis cualitativo</small></div>`;
const empty = (title, text, action = '') => `<div class="empty"><span class="empty-symbol" aria-hidden="true">◇</span><h2>${title}</h2><p>${text}</p>${action}</div>`;
const options = (items, selected = '', blank = '') => (blank ? `<option value="">${blank}</option>` : '') + items.map(item => `<option value="${e(item.id)}" ${item.id === selected ? 'selected' : ''}>${e(item.name)}</option>`).join('');
const input = (label, name, value = '', required = false, type = 'text') => `<label>${label}<input name="${name}" type="${type}" value="${e(value)}" ${required ? 'required' : ''} maxlength="500"></label>`;
const textarea = (label, name, value = '', rows = 3) => `<label>${label}<textarea name="${name}" rows="${rows}">${e(value)}</textarea></label>`;
function notify(text, error = false) {
  clearTimeout(noticeTimer);
  const notice = document.querySelector('#notice');
  notice.textContent = text;
  notice.className = `visible ${error ? 'error' : ''}`;
  if (!error) noticeTimer = setTimeout(() => { notice.className = ''; }, 6000);
}
function report(error) {
  console.error(error);
  notify(error.message || 'No se pudo completar la operación. Inténtalo otra vez y conserva un respaldo.', true);
}
async function mutate(action, { recordUndo = true } = {}) {
  if (saving) throw new Error('Espera a que termine el guardado anterior.');
  saving = true;
  updateSaveState();
  const before = structuredClone(current);
  const next = structuredClone(current);
  try {
    action(next);
    if (next.mapLayout && mapSignature(before) !== mapSignature(next)) next.mapLayout.routes = {};
    validateProject(next);
    const saved = await saveProject(next, current.updatedAt);
    current = saved;
    projects = projects.map(p => p.id === saved.id ? saved : p);
    if (recordUndo) {
      undoSnapshot = before;
      undoProjectId = saved.id;
      undoAction = saved.history.at(-1)?.action || 'Último cambio';
    } else {
      undoSnapshot = undefined;
      undoProjectId = undefined;
      undoAction = '';
    }
    pendingCount = (await listPending()).length;
    render();
  } catch (error) {
    if (cloudMode) {
      pendingCount = (await listPending()).length;
      render();
      throw new Error(`No se confirmó el guardado en Drive. El intento se conserva en Recuperación local. ${error.message}`, { cause: error });
    }
    throw new Error(`No se guardaron los cambios: ${error.message}`, { cause: error });
  } finally { saving = false; updateSaveState(); }
}
function updateSaveState() {
  const status=document.querySelector('#save-state');
  if(status) status.innerHTML=`<span class="local-dot"></span> ${saving ? 'Guardando cambios…' : cloudMode && pendingCount ? 'Hay intentos pendientes · Recuperación local' : storageLabel()}`;
}
function download(name, content, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function fileName(s) { return s.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').slice(0, 100) || 'proyecto'; }
function modal(title, content, onSubmit, submitLabel = 'Guardar') {
  dialog.innerHTML = `<form><header><h2>${title}</h2>${button('close-dialog', 'Cerrar', 'quiet')}</header><div class="dialog-body">${content}</div><footer><button type="button" data-action="close-dialog">Cancelar</button><button type="submit" class="primary">${submitLabel}</button></footer><p class="form-error" role="alert"></p></form>`;
  dialog.querySelector('form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('[type=submit]');
    submit.disabled = true;
    try { await onSubmit(new FormData(form)); dialog.close(); }
    catch (error) { form.querySelector('.form-error').textContent = error.message; }
    finally { submit.disabled = false; }
  });
  dialog.showModal();
}
function checklist(name, items, selected = []) {
  return items.length ? `<div class="checklist">${items.map(item => `<label><input type="checkbox" name="${name}" value="${e(item.id)}" ${selected.includes(item.id) ? 'checked' : ''}><span>${e(item.name)}</span></label>`).join('')}</div>` : '<p class="muted">No hay elementos disponibles.</p>';
}
function render() {
  if (!current) { welcome(); return; }
  const canUndo = Boolean(undoSnapshot && current.id === undoProjectId);
  const undoControl = button('undo', '↶ Deshacer', 'quiet light', canUndo
    ? `aria-label="Deshacer: ${e(undoAction)}" title="Deshacer: ${e(undoAction)}"`
    : 'disabled aria-label="Deshacer última acción" title="No hay cambios para deshacer en este proyecto"');
  app.innerHTML = `<div class="shell">
    <aside class="rail">
      <a class="brand" href="#" data-action="home" aria-label="TRAMA-QDA, inicio">${brand}</a>
      <label class="project-switch">Proyecto<select id="project-select">${options(projects, current.id)}</select></label>
      ${button('new-project', '+ Nuevo proyecto', 'new-project')}
      <nav aria-label="Espacios del proyecto">${tabs.map(([id, name]) => `<button type="button" data-tab="${id}" class="${tab === id ? 'active' : ''}" ${tab === id ? 'aria-current="page"' : ''}><span aria-hidden="true">${icon(({documents:FileText,book:Tags,quotes:Quote,map:GitBranch,prompts:SquarePen,review:ClipboardCheck,history:History})[id])}</span>${name}${id === 'documents' ? `<small>${current.documents.length}</small>` : id === 'quotes' ? `<small>${current.quotes.length}</small>` : ''}</button>`).join('')}</nav>
      <div class="rail-bottom"><p id="save-state" role="status"><span class="local-dot"></span> ${saving ? 'Guardando cambios…' : storageLabel()}</p><p class="rail-note">${privacySummary}</p>${undoControl}${cloudMode ? button('cloud-panel','Drive, índices y versiones','rail-backup') + button('recovery',`Recuperación local (${pendingCount})`,'quiet light') : ''}${button('backup', '↓ Descargar respaldo', 'rail-backup')}${button('restore', 'Restaurar respaldo', 'quiet light')}${button('help', 'Guía y privacidad', 'quiet light')}</div>
    </aside>
    <main>
      <header class="topbar"><div><h1>${e(current.name)}</h1><p>${e(current.question || 'Define tu pregunta de investigación en los ajustes del proyecto.')}</p></div>${button('edit-project', 'Ajustes', 'quiet')}</header>
      <div class="page-heading"><div><h2>${tabs.find(t => t[0] === tab)[1]}</h2><p>${({documents:'De la voz a la evidencia. Selecciona un fragmento y asígnale códigos.',book:'Define, organiza y afina tu interpretación sin perder el origen.',quotes:'Sigue el recorrido categoría → código → cita → documento.',map:'Conecta conceptos. Abre sus citas para volver a la evidencia.',prompts:'Preguntas elegidas, corpus acotado. Tú decides el alcance de cada solicitud.',review:'Propuestas externas y decisiones de revisión.',history:'Registro de cambios y solicitudes de este proyecto.'})[tab]}</p></div><div class="actions">${tabActions()}</div></div>
      <section id="workspace">${({documents:documentsView, book:bookView, quotes:quotesView, map:mapView, prompts:promptsView, review:reviewView, history:historyView})[tab]()}</section>
      <footer class="workspace-footer">TRAMA-QDA · ${cloudMode ? 'Drive privado' : 'Trabajo local'}, interpretación humana.<span>${current.codes.length} códigos · ${current.categories.length} categorías · ${current.quotes.length} citas</span></footer>
    </main></div>`;
  if (tab === 'documents') setupSelection();
  if (tab === 'prompts') setupPrompt();
  if (tab === 'map') setupMap();
}
function tabActions() {
  if (tab === 'documents') return button('paste-document', 'Pegar entrevista') + button('import-document', '↑ Importar TXT / DOCX', 'primary');
  if (tab === 'book') return button('export-book', '↓ Libro CSV') + button('new-category', '+ Categoría') + button('new-code', '+ Código', 'primary');
  if (tab === 'quotes') return button('export-quotes', '↓ Matriz CSV') + button('export-report', '↓ Insertos HTML', 'primary');
  if (tab === 'map') return button('export-map', '↓ Mapa SVG') + button('export-map-png', '↓ Mapa PNG');
  if (tab === 'review' || tab === 'prompts') return button('import-results', '↑ Importar resultados JSON', 'primary');
  return '';
}
function welcome() {
  app.innerHTML = `<main class="welcome"><div class="brand dark">${brand}</div><div class="welcome-grid"><div><h1>Tu interpretación.<br>Su evidencia.</h1><p class="lead">Un espacio de análisis cualitativo para leer, codificar y conectar entrevistas. ${cloudMode ? 'Instalación privada con Drive y Sheets, sin IA integrada.' : 'Sin IA integrada y sin subir tu corpus.'}</p><div class="actions">${button('new-project', 'Crear mi proyecto', 'primary')}${button('demo', 'Explorar un ejemplo')}</div><p class="muted">El ejemplo contiene solo datos ficticios.</p></div><div class="trace-preview"><h2>Cada idea conserva su origen</h2><ol><li><small>Categoría</small>Articulación institucional</li><li><small>Código</small>Coordinación informal</li><li><small>Cita · ejemplo ficticio</small>“Cuando conocemos a alguien del otro equipo, llamamos directamente.”</li><li><small>Origen</small>Entrevista de ejemplo · párrafo 2</li></ol></div></div><div class="privacy-strip"><strong>${cloudMode ? 'Los proyectos se guardan en tu Drive privado.' : 'Tus datos se quedan en este navegador.'}</strong><p>${cloudMode ? 'Cada guardado confirmado crea una versión completa en Drive. Sheets contiene índices regenerables. Los intentos sin confirmación se conservan en este navegador para recuperarlos. Mantén también respaldos JSON.' : 'No hay cuentas ni sincronización. Descarga respaldos: borrar los datos del navegador elimina los proyectos locales.'} Los prompts se preparan aquí; tú decides si copiarlos en un chat externo.</p>${button('restore', 'Restaurar un respaldo')}${cloudMode ? button('recovery',`Recuperación local (${pendingCount})`) : ''}${projects.length ? button('resume', 'Volver a mis proyectos') : ''}</div></main>`;
}
function documentsView() {
  if (!current.documents.length) return empty('Empieza por una entrevista', 'Importa un DOCX o TXT, o pega la transcripción. Se conserva el texto importado para anclar las citas; el archivo binario original no se almacena.', button('import-document', 'Importar entrevista', 'primary') + button('paste-document', 'Pegar texto'));
  let doc = current.documents.find(d => d.id === docId) || current.documents[0];
  docId = doc.id;
  const parts = paragraphs(doc);
  const matching = documentSearch.trim().toLocaleLowerCase();
  return `<div class="reading-layout">
    <aside class="document-list"><h3>Corpus <span>${current.documents.length}</span></h3>${current.documents.map(d => `<button type="button" data-action="select-document" data-id="${d.id}" class="document-item ${d.id === docId ? 'selected' : ''}"><strong>${e(d.name)}</strong><small>${paragraphs(d).length} párrafos · ${current.quotes.filter(q => q.documentId === d.id).length} citas</small></button>`).join('')}</aside>
    <div class="source-panel"><div class="source-toolbar"><strong>${e(doc.name)}</strong><label class="search"><span class="sr-only">Buscar en documento</span><input id="document-search" type="search" placeholder="Buscar en el texto…" value="${e(documentSearch)}"></label></div><div class="transcript" id="transcript" data-document="${doc.id}">${parts.filter(part => !matching || part.text.toLocaleLowerCase().includes(matching)).map(part => {
      const quotes = current.quotes.filter(q => q.documentId === docId && q.end > part.start && q.start < part.end);
      return `<div class="paragraph-row"><span class="paragraph-number" title="Párrafo ${part.number}">${part.number}</span><p data-start="${part.start}" data-end="${part.end}">${highlightText(doc.text, part, quotes)}</p><span class="paragraph-codes">${[...new Set(quotes.flatMap(q => q.codeIds))].map(id => { const c = findCode(id); return c ? `<button type="button" class="tiny-tag" style="--code-color:${c.color}" data-action="code-quotes" data-id="${c.id}">${e(c.name)}</button>` : ''; }).join('')}</span></div>`;
    }).join('') || '<p class="muted">No hay párrafos que coincidan.</p>'}</div></div>
    <aside class="inspector"><h3>Codificar selección</h3><div id="selection-preview">${selection?.documentId === docId ? `<blockquote>${e(doc.text.slice(selection.start, selection.end))}</blockquote><small>${selection.end-selection.start} caracteres · ${e(location(current,{documentId:docId,start:selection.start,end:selection.end}))}</small>` : '<p class="muted">Selecciona texto con el ratón o el teclado en la entrevista.</p>'}</div><p class="muted">Al crear un código desde una selección, se crea una cita vinculada automáticamente. También puedes asignar códigos existentes desde aquí.</p><form id="coding-form"><fieldset><legend>Códigos</legend>${checklist('codeIds', current.codes)}</fieldset>${button('new-code', selection?.documentId === docId ? '+ Crear código y citar selección' : '+ Crear código', 'quiet')}<fieldset><legend>Preguntas / objetivos vinculados (opcional)</legend>${checklist('researchQuestionIds',researchItems())}</fieldset>${textarea('Memo de la cita (opcional)', 'memo', '', 3)}<button class="primary full" type="submit">Guardar cita y codificación</button></form><hr><h3>Conserva el contexto</h3><p class="muted">Una cita puede tener varios códigos. Las ubicaciones se refieren al texto importado, no a las páginas de Word.</p></aside>
    </div>`;
}
function highlightText(text, part, quotes) {
  const points = [...new Set([part.start, part.end, ...quotes.flatMap(q => [Math.max(part.start, q.start), Math.min(part.end, q.end)])])].sort((a,b) => a-b);
  return points.slice(0,-1).map((start,i) => {
    const end = points[i+1];
    return quotes.some(q => q.start < end && q.end > start) ? `<mark>${e(text.slice(start,end))}</mark>` : e(text.slice(start,end));
  }).join('');
}
function setupSelection() {
  const transcript = document.querySelector('#transcript');
  if (!transcript) return;
  const capture = () => {
    const selected = window.getSelection();
    if (!selected || selected.isCollapsed || !selected.rangeCount) return;
    const range = selected.getRangeAt(0);
    if (!transcript.contains(range.startContainer) || !transcript.contains(range.endContainer)) return;
    const point = (node, offset) => {
      const el = (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement).closest('p[data-start]');
      if (!el) throw new Error('Selecciona solo el texto de la entrevista, no las etiquetas.');
      const prefix = document.createRange();
      prefix.setStart(el,0);
      prefix.setEnd(node, offset);
      return Number(el.dataset.start) + prefix.toString().length;
    };
    captureSelection = capture;
    try {
      const start = point(range.startContainer, range.startOffset);
      const end = point(range.endContainer, range.endOffset);
      if (end <= start) return;
      if (documentSearch && paragraphs(current.documents.find(d => d.id === docId)).filter(part => part.start < end && part.end > start).some(part => !part.text.toLocaleLowerCase().includes(documentSearch.toLocaleLowerCase()))) throw new Error('Quita el filtro de búsqueda para seleccionar entre párrafos no consecutivos.');
      selection = { documentId: docId, start, end };
      document.querySelector('#selection-preview').innerHTML = `<blockquote>${e(current.documents.find(d => d.id === docId).text.slice(start,end))}</blockquote><small>${end-start} caracteres seleccionados</small>`;
      const createCodeButton = document.querySelector('#coding-form [data-action="new-code"]');
      if (createCodeButton) createCodeButton.textContent = '+ Crear código y citar selección';
    } catch (error) { report(error); }
  };
  transcript.addEventListener('mouseup', capture);
  transcript.addEventListener('keyup', capture);
  document.querySelector('#coding-form').addEventListener('submit', async event => {
    event.preventDefault();
    try {
      if (!selection || selection.documentId !== docId) throw new Error('Selecciona primero un fragmento de esta entrevista.');
      const form = new FormData(event.currentTarget);
      await mutate(p => addQuote(p, selection.documentId, selection.start, selection.end, form.getAll('codeIds'), form.get('memo').trim(),form.getAll('researchQuestionIds')));
      selection = null;
      render();
      notify(cloudMode ? 'Cita y códigos confirmados en Drive.' : 'Cita y códigos guardados en este navegador.');
    } catch (error) { report(error); }
  });
}
function bookView() {
  if (!current.codes.length && !current.categories.length) return empty('Un libro que crece con tu análisis', 'Crea códigos inductivos o registra tu libro deductivo con definiciones y criterios de inclusión y exclusión.', button('new-code', 'Crear primer código', 'primary'));
  return `<div class="book-layout"><aside class="category-list"><h3>Categorías mayores</h3>${current.categories.map(c => `<div class="category-entry"><span class="code-dot" style="background:${c.color}"></span><div><strong>${e(c.name)}</strong><p>${e(c.description)}</p><small>${current.codes.filter(code => code.categoryId === c.id).length} códigos</small></div>${button('edit-category', 'Editar', 'quiet', `data-id="${c.id}"`)}</div>`).join('') || '<p class="muted">Todavía no hay categorías. Puedes codificar primero y agrupar después.</p>'}</aside>
  <div class="code-table"><table><thead><tr><th>Código / jerarquía</th><th>Definición y criterios</th><th>Citas</th><th><span class="sr-only">Acciones</span></th></tr></thead><tbody>${current.codes.map(c => `<tr><td><span class="tag" style="--code-color:${c.color}">${e(c.name)}</span><small class="path">${e(codePath(current, c.id))}</small></td><td><p>${e(c.description || 'Sin definición')}</p><small><strong>Incluir:</strong> ${e(c.inclusion || 'Sin definir')}<br><strong>Excluir:</strong> ${e(c.exclusion || 'Sin definir')}</small></td><td>${button('code-quotes', String(current.quotes.filter(q => q.codeIds.includes(c.id)).length), 'count-button', `data-id="${c.id}" aria-label="Ver citas de ${e(c.name)}"`)}</td><td>${button('edit-code', 'Editar', 'quiet', `data-id="${c.id}"`)}</td></tr>`).join('')}</tbody></table></div></div>`;
}
function filteredQuotes() {
  return current.quotes.filter(q => (!quoteFilter || q.codeIds.includes(quoteFilter)) && (!categoryFilter || q.codeIds.some(id => findCode(id)?.categoryId === categoryFilter)) && (!researchFilter || (q.researchQuestionIds || []).includes(researchFilter)) && (!quoteSearch || `${q.text} ${q.memo} ${location(current,q)}`.toLocaleLowerCase().includes(quoteSearch.toLocaleLowerCase())));
}
function quotesView() {
  if (!current.quotes.length) return empty('Aquí empieza la trazabilidad', 'Guarda una cita desde Documentos. Después podrás volver al origen, reorganizar códigos y exportar insertos para tu informe.', button('go-documents', 'Ir a Documentos', 'primary'));
  const quotes = filteredQuotes();
  return `<div class="filterbar"><label>Filtrar por grupo / categoría<select id="category-filter">${options(current.categories, categoryFilter, 'Todos los grupos')}</select></label><label>Filtrar por código<select id="quote-filter">${options(current.codes, quoteFilter, 'Todos los códigos')}</select></label><label>Pregunta / objetivo<select id="research-filter">${options((current.researchQuestions||[]).map(q=>({id:q.id,name:`${q.text}${q.archived?' (archivado)':''}`})),researchFilter,'Todos')}</select></label><label>Buscar citas o memos<input type="search" id="quote-search" value="${e(quoteSearch)}" placeholder="Texto, entrevista o memo…"></label><span>${quotes.length} de ${current.quotes.length} citas</span></div><div class="quote-list">${quotes.map(q => `<article class="quote-card" id="quote-${q.id}"><header><span>${e(location(current,q))}</span>${button('source', 'Ver en contexto ↗', 'quiet', `data-id="${q.id}"`)}</header><blockquote>${e(q.text)}</blockquote><div class="quote-paths">${q.codeIds.map(id => `<span class="tag" style="--code-color:${findCode(id).color}">${e(codePath(current,id))}</span>`).join('')}</div>${researchText(q)?`<p class="memo"><strong>Preguntas / objetivos:</strong> ${e(researchText(q))}</p>`:''}${q.memo ? `<p class="memo"><strong>Memo:</strong> ${e(q.memo)}</p>` : ''}<footer><small>ID de cita: ${q.id}</small><div>${button('edit-quote', 'Editar códigos / memo', 'quiet', `data-id="${q.id}"`)}${button('delete-quote', 'Eliminar cita', 'quiet danger', `data-id="${q.id}"`)}</div></footer></article>`).join('') || empty('Sin coincidencias', 'Cambia los filtros para ver otras citas.')}</div>`;
}
function codeDialog(id) {
  const selectionToCode = !id && tab === 'documents' && selection?.documentId === docId ? {...selection} : null;
  const c = id ? findCode(id) : { name:'', description:'', inclusion:'', exclusion:'', color:colors[current.codes.length % colors.length], categoryId:null, parentId:null };
  const descendants = new Set(id ? [id] : []);
  let changed = true;
  while (changed) {
    changed = false;
    current.codes.forEach(code => { if (descendants.has(code.parentId) && !descendants.has(code.id)) { descendants.add(code.id); changed = true; } });
  }
  const quoteFields = selectionToCode ? `${textarea('Memo de la cita (opcional)','quoteMemo','')}<fieldset><legend>Preguntas / objetivos vinculados (opcional)</legend>${checklist('researchQuestionIds',researchItems())}</fieldset>` : '';
  modal(id ? 'Editar código' : 'Nuevo código', `${input('Nombre del código', 'name', c.name, true)}${textarea('Definición', 'description', c.description)}<div class="form-grid">${textarea('Criterios de inclusión','inclusion',c.inclusion)}${textarea('Criterios de exclusión','exclusion',c.exclusion)}</div><div class="form-grid"><label>Categoría mayor<select name="categoryId">${options(current.categories,c.categoryId,'Sin categoría')}</select></label><label>Código padre (subcódigo)<select name="parentId">${options(current.codes.filter(code => !descendants.has(code.id)),c.parentId,'Sin código padre')}</select></label></div>${input('Color', 'color', c.color, true, 'color')}${quoteFields}<p class="muted">Cambiar una agrupación conserva las citas y registra el cambio. La categoría se asigna explícitamente a cada código, también a los subcódigos.</p>`, async form => {
    const name = form.get('name').trim();
    if (!name) throw new Error('Escribe un nombre.');
    if (current.codes.some(code => code.id !== id && code.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error('Ya existe un código con ese nombre. Reutilízalo o distingue su significado.');
    await mutate(p => {
      const value = { id: id || uid(), name, description:form.get('description').trim(), inclusion:form.get('inclusion').trim(), exclusion:form.get('exclusion').trim(), categoryId:form.get('categoryId') || null, parentId:form.get('parentId') || null, color:form.get('color') };
      if (id) p.codes[p.codes.findIndex(code => code.id === id)] = value;
      else p.codes.push(value);
      if (selectionToCode) {
        const quote = addQuote(p, selectionToCode.documentId, selectionToCode.start, selectionToCode.end, [value.id], form.get('quoteMemo').trim(), form.getAll('researchQuestionIds'));
        log(p, 'Código creado y cita codificada', JSON.stringify({codeId:value.id,quoteId:quote.id}));
      } else log(p, id ? 'Código actualizado' : 'Código creado', JSON.stringify(value));
    });
    if (selectionToCode) { selection = null; render(); notify('Código creado y cita vinculada al fragmento seleccionado.'); }
  });
}
function categoryDialog(id) {
  const cat = current.categories.find(c => c.id === id) || { name:'', description:'', color:colors[current.categories.length % colors.length] };
  modal(id ? 'Editar categoría' : 'Nueva categoría mayor', `${input('Nombre','name',cat.name,true)}${textarea('Definición / principio de agrupación','description',cat.description)}${input('Color','color',cat.color,true,'color')}`, async form => {
    const name = form.get('name').trim();
    if (!name) throw new Error('Escribe un nombre.');
    if (current.categories.some(c => c.id !== id && c.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error('Ya existe una categoría con ese nombre.');
    await mutate(p => {
      const value = {id:id || uid(), name, description:form.get('description').trim(), color:form.get('color')};
      if (id) p.categories[p.categories.findIndex(c => c.id === id)] = value;
      else p.categories.push(value);
      log(p, id ? 'Categoría actualizada' : 'Categoría creada', JSON.stringify(value));
    });
  });
}
function projectDialog(edit = false) {
  const bank=edit?activeResearch():[];
  modal(edit ? 'Ajustes del proyecto' : 'Crear proyecto', `${input('Nombre del proyecto','name',edit ? current.name : '',true)}${textarea('Pregunta u objetivo de investigación','question',edit ? current.question : '')}${textarea('Banco de preguntas (una por línea)','researchQuestions',bank.filter(q=>q.kind==='Pregunta').map(q=>q.text).join('\n'),4)}${textarea('Banco de objetivos (uno por línea)','researchObjectives',bank.filter(q=>q.kind==='Objetivo').map(q=>q.text).join('\n'),4)}<p class="muted">Registrar el banco completo no lo envía a la IA. Selecciona después los elementos pertinentes en cada prompt y cita. Quitar o reformular un elemento archiva su versión anterior para conservar referencias.</p><p class="muted">${cloudMode ? 'Los proyectos se guardan en tu Drive privado. Los intentos pendientes quedan en este navegador. Conserva también respaldos JSON.' : 'Los datos se guardan en este navegador. No uses modo incógnito y conserva respaldos fuera del equipo.'}</p>`, async form => {
    const name = form.get('name').trim();
    if (!name) throw new Error('Escribe un nombre para el proyecto.');
    if (edit) await mutate(p => { p.name = name; p.question = form.get('question').trim(); updateResearchBank(p,form.get('researchQuestions'),form.get('researchObjectives')); log(p,'Proyecto y banco de investigación actualizados',JSON.stringify({name,researchQuestions:p.researchQuestions})); });
    else {
      const p = project(name,form.get('question').trim());
      updateResearchBank(p,form.get('researchQuestions'),form.get('researchObjectives'));
      log(p,'Proyecto creado',name);
      const saved = await saveProject(p);
      projects.push(saved); current = saved; resetView(); render();
    }
  }, edit ? 'Guardar ajustes' : 'Crear proyecto');
}
function resetView() { docId = undefined; selection = null; quoteFilter = ''; categoryFilter = ''; quoteSearch = ''; researchFilter = ''; documentSearch = ''; lastPrompt = ''; lastPromptId = undefined; mapConnecting = false; mapSource = undefined; tab = 'documents'; }
async function importDocument() {
  const files = await chooseFiles('.txt,.docx',true);
  if (!files.length) return;
  notify('Leyendo documentos en tu equipo…');
  const docs = [];
  for (const file of files) {
    if (file.size > 20 * 1024 * 1024) throw new Error(`${file.name}: el tamaño máximo es 20 MB. Divide el documento.`);
    let text;
    if (/\.docx$/i.test(file.name)) {
      const mammoth = await import('mammoth/mammoth.browser');
      const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
      if (result.messages.length) notify(`Aviso al leer ${file.name}: ${result.messages.map(m => m.message).join(' ')}`, true);
      text = result.value;
    } else if (/\.txt$/i.test(file.name)) text = await file.text();
    else throw new Error('Formato no admitido. Importa TXT UTF-8 o DOCX.');
    text = text.replace(/\r\n?/g,'\n').replace(/\u0000/g,'');
    if (!text.trim()) throw new Error(`${file.name} no contiene texto legible. Si es un escaneo, necesita OCR antes de importarlo.`);
    const originalFileId = await uploadOriginal(file);
    docs.push({ id:uid(), name:file.name, text, createdAt:now(), ...(originalFileId ? { originalFileId } : {}) });
  }
  await mutate(p => { p.documents.push(...docs); docs.forEach(d => log(p,'Documento importado',d.name)); });
  docId = docs[0].id; selection = null; render();
  notify(cloudMode ? `${docs.length} documento(s) confirmados en Drive, con su archivo original.` : `${docs.length} documento(s) importado(s). El texto se guarda localmente.`);
}
function chooseFiles(accept, multiple = false) {
  return new Promise(resolve => {
    const picker = document.createElement('input');
    picker.type = 'file'; picker.accept = accept; picker.multiple = multiple;
    picker.addEventListener('change', () => resolve([...picker.files]), {once:true});
    picker.addEventListener('cancel', () => resolve([]), {once:true});
    picker.click();
  });
}
function pasteDocument() {
  modal('Pegar entrevista', `${input('Nombre de la entrevista','name','',true)}${textarea('Transcripción','text','',12)}<p class="muted">El texto fuente no se edita después de importarlo para no desplazar las citas. Conserva también tu archivo original.</p>`, async form => {
    const text = form.get('text').replace(/\r\n?/g,'\n');
    if (!text.trim() || !form.get('name').trim()) throw new Error('Completa el nombre y la transcripción.');
    const d = {id:uid(), name:form.get('name').trim(), text, createdAt:now()};
    await mutate(p => { p.documents.push(d); log(p,'Documento pegado',d.name); });
    docId = d.id; selection = null; render();
  }, 'Importar texto');
}
function editQuote(id) {
  const q = current.quotes.find(q => q.id === id);
  modal('Revisar cita', `<blockquote>${e(q.text)}</blockquote><p class="muted">${e(location(current,q))}</p><fieldset><legend>Códigos asignados</legend>${checklist('codeIds',current.codes,q.codeIds)}</fieldset><fieldset><legend>Preguntas / objetivos vinculados</legend>${checklist('researchQuestionIds',(current.researchQuestions||[]).filter(r=>!r.archived||(q.researchQuestionIds||[]).includes(r.id)).map(r=>({id:r.id,name:`${r.kind}: ${r.text}${r.archived?' (archivado)':''}`})),q.researchQuestionIds||[])}</fieldset>${textarea('Memo analítico','memo',q.memo,4)}`, async form => {
    if (!form.getAll('codeIds').length) throw new Error('Asigna al menos un código, o elimina la cita desde el listado.');
    await mutate(p => { const quote = p.quotes.find(q => q.id === id); quote.codeIds = form.getAll('codeIds'); quote.researchQuestionIds=form.getAll('researchQuestionIds'); quote.memo = form.get('memo').trim(); log(p,'Cita revisada',JSON.stringify(quote)); });
  });
}
function exportRows() {
  return filteredQuotes().flatMap(q => q.codeIds.map(id => [current.name, codePath(current,id), id, q.id, q.text, location(current,q), q.memo,researchText(q)]));
}
function exportReport() {
  const quotes = filteredQuotes();
  if (!quotes.length) throw new Error('No hay citas en este filtro para exportar.');
  const researchFilterLabel = (current.researchQuestions || []).find(q=>q.id===researchFilter)?.text;
  const html = `<!doctype html><html lang="es"><meta charset="utf-8"><title>${e(current.name)}</title><style>body{font-family:Calibri,Arial,sans-serif;max-width:850px;margin:40px auto;line-height:1.6;color:#172d3a}article{margin:28px 0;page-break-inside:avoid}blockquote{font-size:18px}small{overflow-wrap:anywhere}h2{font-size:16px}</style><h1>${e(current.name)}</h1><p>${e(current.question)}</p><p>Exportado: ${e(new Date().toLocaleString('es-CL'))}. ${quotes.length} citas. ${e(quoteFilter ? `Filtro: ${findCode(quoteFilter).name}.` : '')} ${e(researchFilterLabel ? `Pregunta / objetivo: ${researchFilterLabel}.` : '')} ${e(quoteSearch ? `Búsqueda: ${quoteSearch}.` : '')}</p>${quotes.map(q => `<article><h2>${q.codeIds.map(id => e(codePath(current,id))).join('<br>')}</h2><blockquote>“${e(q.text)}”</blockquote><p>${e(location(current,q))}</p>${researchText(q)?`<p>Preguntas / objetivos: ${e(researchText(q))}</p>`:''}${q.memo ? `<p>Memo: ${e(q.memo)}</p>` : ''}<small>ID cita: ${q.id}</small></article>`).join('')}</html>`;
  download(`${fileName(current.name)}-insertos.html`,html,'text/html;charset=utf-8');
  notify('Insertos descargados. Ábrelos en Word o en el navegador; puedes imprimir a PDF.');
}
function quickRelationsView() {
  const nodes=[...current.categories.map(node=>({...node,kind:'Categoría'})),...current.codes.map(node=>({...node,kind:'Código'}))];
  const picker=name=>`<label class="quick-search"><span class="sr-only">${name==='source'?'Buscar origen':'Buscar destino'}</span><input type="search" data-node-search="${name}" placeholder="Buscar código o categoría"></label><div class="quick-node-options">${nodes.map(node=>`<label class="quick-node"><input type="radio" name="${name}" value="${node.id}" required><span><small>${node.kind}</small><strong>${e(node.name)}</strong></span><i class="code-dot" style="background:${node.color}" aria-hidden="true"></i></label>`).join('')}</div>`;
  return `<aside class="map-builder"><details class="map-quick" open><summary>Relación rápida</summary><form id="quick-relation-form"><fieldset><legend>Origen</legend>${picker('source')}</fieldset><fieldset><legend>Destino</legend>${picker('target')}</fieldset><fieldset><legend>Vínculo</legend><div class="quick-relation-types">${relationTypes.map((type,index)=>`<label><input type="radio" name="type" value="${e(type)}" ${index===0?'checked':''}><span>${e(type)}</span></label>`).join('')}<label><input type="radio" name="type" value="custom"><span>Texto personalizado</span></label></div></fieldset><label>Nombre personalizado de la relación<input name="customType" maxlength="120" disabled></label>${textarea('Fundamento de la relación','memo','',3)}<details class="quick-evidence"><summary>Citas de respaldo</summary>${checklist('quoteIds',current.quotes.map(quote=>({id:quote.id,name:`${location(current,quote)}: ${quote.text.slice(0,100)}`})))}</details><button type="submit" class="primary full">${icon(Plus)}Crear relación</button><p class="form-error" role="alert"></p></form></details><details class="map-classic"><summary>Construcción con desplegables</summary>${button('new-relation','+ Relación','full')}</details></aside>`;
}
function mapView() {
  const nodes = [...current.categories.map(c => ({...c,kind:'category'})), ...current.codes.map(c => ({...c,kind:'code'}))];
  if (!nodes.length) return empty('Conecta tu interpretación', 'Crea códigos y categorías en el libro. Aquí aparecerán como nodos vinculados a la evidencia.',button('go-book','Ir al libro de códigos','primary'));
  const edges = mapEdges(current);
  const categoryRows = Math.ceil(current.categories.length / 3);
  const positions = Object.fromEntries(nodes.map(n => {
    const index = n.kind === 'category' ? current.categories.findIndex(c => c.id === n.id) : current.codes.findIndex(c => c.id === n.id);
    const initial = { x: n.kind === 'category' && current.categories.length === 1 ? 440 : 70 + (index % 3) * 370, y: 65 + Math.floor(index / 3) * 190 + (n.kind === 'code' ? Math.max(1, categoryRows) * 230 : 0) };
    return [n.id, current.positions[n.id] || initial];
  }));
  const svgNodes = nodes.map(n => {
    const pos = positions[n.id]; const count = current.quotes.filter(q => q.codeIds.includes(n.id) || q.codeIds.some(id => findCode(id)?.categoryId === n.id)).length;
    const lines = wrap(n.name,27).slice(0,3);
    return `<g class="map-node" data-node="${n.id}" data-kind="${n.kind}" transform="translate(${pos.x} ${pos.y})" tabindex="0" role="button" aria-label="${e(n.name)}, ${count} citas. Enter para abrir citas." style="--code-color:${n.color}"><title>${e(n.name)}</title><rect width="280" height="100" rx="${n.kind==='category'?2:6}" fill="${n.kind === 'category' ? '#16302b' : '#ffffff'}" stroke="${n.color}" stroke-width="${n.kind === 'category' ? 2 : 1}"/><text x="16" y="21" class="node-kind">${n.kind === 'category' ? 'CATEGORÍA' : 'CÓDIGO'} · ${count} citas</text>${lines.map((line,i) => `<text x="16" y="${43+i*18}" class="node-name" ${line.length>30?'textLength="248" lengthAdjust="spacingAndGlyphs"':''}>${e(line)}</text>`).join('')}</g>`;
  }).join('');
  const routePoints = Object.values(current.mapLayout?.routes || {}).flatMap(route => [...route.points,...(route.label ? [route.label] : [])]);
  const maxX = Math.max(600,...Object.values(positions).map(pos=>pos.x+340),...routePoints.map(point=>point.x+100));
  const maxY = Math.max(450,...Object.values(positions).map(pos=>pos.y+160),...routePoints.map(point=>point.y+60));
  const preset = current.mapLayout?.mode || 'manual';
  const controls = `<div class="map-controls"><label>Organización<select id="map-layout">${mapLayouts.map(layout=>`<option value="${layout.id}" ${preset===layout.id?'selected':''}>${layout.name}</option>`).join('')}</select></label>${button('organize-map',mapOrganizing?'Organizando…':'Organizar mapa','',mapOrganizing?'disabled':'')}${button('connect-map','Conectar nodos','quiet',`aria-pressed="${mapConnecting}"`)}<label>Conexiones<select id="map-routing"><option value="straight" ${current.mapLayout?.routing!=='orthogonal'?'selected':''}>Rectas</option><option value="orthogonal" ${current.mapLayout?.routing==='orthogonal'?'selected':''}>Ortogonales</option></select></label>${button('fit-map','Ajustar a pantalla','quiet')}<label>Zoom<select id="map-zoom"><option value="1" selected>100%</option><option value="0.75">75%</option><option value="0.5">50%</option><option value="1.25">125%</option></select></label></div>`;
  const svgEdges = edges.map((relation,index) => `<g class="map-edge ${relation.structural?'structural':'editable'}" data-source="${relation.source}" data-target="${relation.target}" data-edge="${relation.id}" ${relation.structural?'':`data-action="edit-relation" data-id="${relation.id}" tabindex="0" role="button" aria-label="Editar relación: ${e(relation.type)}"`}><title>${e(relation.type)}</title><path class="edge-hit" fill="none" stroke="transparent" stroke-width="16"/><path id="edge-${index}" class="edge-path" fill="none" stroke="${relation.structural?'#98adb5':'#486572'}" ${relation.structural?'stroke-dasharray="6 5"':''} stroke-width="1.5" marker-end="url(#arrow)"/><text class="edge-label" text-anchor="middle">${e(relation.type)}</text></g>`).join('');
  return `<div class="map-toolbar">${controls}<span><span class="line-key"></span> Jerarquía del libro <span class="line-key solid"></span> Relación interpretativa</span></div><div class="map-workbench">${quickRelationsView()}<div class="map-scroll"><svg id="relation-map" xmlns="http://www.w3.org/2000/svg" width="${maxX}" height="${maxY}" viewBox="0 0 ${maxX} ${maxY}" role="img" aria-label="Mapa de categorías y códigos"><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#607985"/></marker></defs>${svgEdges}${svgNodes}</svg></div></div><div class="relationship-list"><h3>Relaciones interpretativas <span>${current.relations.length}</span></h3>${current.relations.map(relation => `<article><div><strong>${e(findNode(relation.source).name)}</strong> <span>${e(relation.type)} →</span> <strong>${e(findNode(relation.target).name)}</strong><p>${e(relation.memo || 'Sin memo interpretativo')} · ${relation.quoteIds.length} citas de respaldo</p></div>${button('edit-relation','Revisar','quiet',`data-id="${relation.id}"`)}${button('delete-relation','Eliminar','quiet danger',`data-id="${relation.id}"`)}</article>`).join('') || '<p class="muted">Sin relaciones interpretativas.</p>'}</div>`;
}
function wrap(text, length) {
  const words = text.split(/\s+/); const lines = [''];
  for (const word of words) {
    const i = lines.length-1;
    if ((lines[i]+' '+word).trim().length > length && lines[i]) lines.push(word);
    else lines[i] = (lines[i]+' '+word).trim();
  }
  return lines;
}
function mapBounds(svg) {
  const boxes = [...svg.querySelectorAll('.map-node,.map-edge')].map(element=>{
    const box=element.getBBox();
    const transform=element.transform.baseVal.consolidate()?.matrix;
    return {x:box.x+(transform?.e || 0),y:box.y+(transform?.f || 0),width:box.width,height:box.height};
  });
  const x=Math.min(0,...boxes.map(box=>box.x))-30, y=Math.min(0,...boxes.map(box=>box.y))-30;
  return {x,y,width:Math.max(500,Math.max(...boxes.map(box=>box.x+box.width))+30-x),height:Math.max(400,Math.max(...boxes.map(box=>box.y+box.height))+30-y)};
}
function mapExportImage() {
  const svg=document.querySelector('#relation-map');
  if(!svg)throw new Error('Primero crea códigos para generar el mapa.');
  const bounds=mapBounds(svg), clone=svg.cloneNode(true);
  clone.setAttribute('viewBox',`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`);clone.setAttribute('width',String(bounds.width));clone.setAttribute('height',String(bounds.height));
  clone.querySelectorAll('.edge-hit').forEach(path=>path.remove());
  clone.querySelectorAll('[tabindex]').forEach(element=>{element.removeAttribute('tabindex');element.removeAttribute('data-action');});
  clone.querySelectorAll('text').forEach(text=>{text.setAttribute('font-family','Libre Franklin, Segoe UI, sans-serif');text.setAttribute('font-size',text.classList.contains('node-kind')?'10':text.classList.contains('edge-label')?'11':'14');const category=text.closest('[data-kind=category]');text.setAttribute('fill',category?'#f4f8f5':text.classList.contains('node-kind')?'#5d665f':'#16302b');if(text.classList.contains('node-name'))text.setAttribute('font-weight','600');});
  return {bounds,source:new XMLSerializer().serializeToString(clone)};
}
function exportMap() {
  const {source}=mapExportImage();
  download(`${fileName(current.name)}-mapa.svg`,source,'image/svg+xml');
}
async function exportMapPNG() {
  await document.fonts.ready;
  const {bounds,source}=mapExportImage();
  const scale=Math.min(2,8192/bounds.width,8192/bounds.height,Math.sqrt(24000000/(bounds.width*bounds.height)));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.floor(bounds.width*scale));canvas.height=Math.max(1,Math.floor(bounds.height*scale));
  const context=canvas.getContext('2d');
  if(!context)throw new Error('El navegador no pudo preparar el PNG. Usa la exportación SVG.');
  const url=URL.createObjectURL(new Blob([source],{type:'image/svg+xml;charset=utf-8'}));
  try {
    const image=new Image();
    image.src=url;
    await image.decode();
    context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height);
    context.drawImage(image,0,0,canvas.width,canvas.height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    if(!blob)throw new Error('No se pudo generar el PNG. Usa la exportación SVG.');
    const downloadURL=URL.createObjectURL(blob);
    const link=document.createElement('a');link.href=downloadURL;link.download=`${fileName(current.name)}-mapa.png`;link.click();
    setTimeout(()=>URL.revokeObjectURL(downloadURL),1000);
    notify(`Mapa PNG exportado: ${canvas.width} × ${canvas.height} píxeles.`);
  } finally {URL.revokeObjectURL(url);}
}
function setupMap() {
  const svg = document.querySelector('#relation-map');
  if (!svg) return;
  setupQuickRelations(svg);
  const positions = {};
  svg.querySelectorAll('[data-node]').forEach(node => {
    const transform = node.transform.baseVal.getItem(0).matrix;
    positions[node.dataset.node] = {x:transform.e,y:transform.f};
  });
  let useSavedRoutes = true;
  const updateEdges = () => svg.querySelectorAll('.map-edge').forEach(edge => {
    const a=positions[edge.dataset.source], b=positions[edge.dataset.target];
    const route = useSavedRoutes ? current.mapLayout?.routes?.[edge.dataset.edge] : undefined;
    const geometry = edgeGeometry(a,b,current.mapLayout?.routing || 'straight',route);
    edge.querySelectorAll('path').forEach(path=>path.setAttribute('d',geometry.path));
    edge.querySelector('text').setAttribute('transform',`translate(${geometry.label.x} ${geometry.label.y})`);
    const label = edge.querySelector('text').getBBox();
    const rectangle = edge.querySelector('.edge-label-bg') || document.createElementNS('http://www.w3.org/2000/svg','rect');
    rectangle.setAttribute('class','edge-label-bg');rectangle.setAttribute('x',String(geometry.label.x+label.x-5));rectangle.setAttribute('y',String(geometry.label.y+label.y-3));rectangle.setAttribute('width',String(label.width+10));rectangle.setAttribute('height',String(label.height+6));rectangle.setAttribute('fill','#f9fbfc');rectangle.setAttribute('rx','3');
    edge.insertBefore(rectangle,edge.querySelector('text'));
  });
  updateEdges();
  svg.querySelectorAll('.map-edge.editable').forEach(edge=>edge.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();relationDialog(edge.dataset.id);}}));
  document.querySelector('#map-routing').addEventListener('change',async event=>{
    try {await mutate(p=>{p.mapLayout={mode:p.mapLayout?.mode || 'manual',routing:event.target.value,routes:{}};log(p,'Conexiones del mapa actualizadas',event.target.value);});}
    catch(error){report(error);render();}
  });
  document.querySelector('#map-zoom').addEventListener('change',event=>{
    if(event.target.value==='fit') { actions['fit-map'](); return; }
    const scale=Number(event.target.value);
    svg.setAttribute('width',String(svg.viewBox.baseVal.width*scale));
    svg.setAttribute('height',String(svg.viewBox.baseVal.height*scale));
  });
  svg.querySelectorAll('[data-node]').forEach(node => {
    let drag;
    node.addEventListener('pointerdown',event => {
      if (mapConnecting || mapOrganizing || saving) return;
      if (event.button !== 0) return;
      drag={x:event.clientX,y:event.clientY,start:{...positions[node.dataset.node]},moved:false};
      node.setPointerCapture(event.pointerId);
    });
    node.addEventListener('pointermove',event => {
      if (!drag) return;
      const scale=svg.viewBox.baseVal.width/svg.getBoundingClientRect().width;
      const x=Math.max(0,Math.min(100000,drag.start.x+(event.clientX-drag.x)*scale));
      const y=Math.max(0,Math.min(100000,drag.start.y+(event.clientY-drag.y)*scale));
      if (Math.abs(event.clientX-drag.x)+Math.abs(event.clientY-drag.y)>4) drag.moved=true;
      positions[node.dataset.node]={x,y};
      useSavedRoutes = false;
      node.setAttribute('transform',`translate(${x} ${y})`); updateEdges();
    });
    const finish = async () => {
      if (!drag) return;
      const moved=drag.moved; drag=null;
      if (!moved) return;
      try { await mutate(p => { p.positions[node.dataset.node]=positions[node.dataset.node]; if(p.mapLayout)p.mapLayout.routes={}; log(p,'Nodo reubicado',node.dataset.node); }); }
      catch(error) { report(error); render(); }
    };
    node.addEventListener('pointerup',finish);
    node.addEventListener('pointercancel',() => { drag=null; render(); });
    const inspect = () => {
      if (mapConnecting) return;
      const id=node.dataset.node;
      if (findCode(id)) { quoteFilter=id; tab='quotes'; render(); }
      else {
        const codes=current.codes.filter(c=>c.categoryId===id).map(c=>c.id);
        const quotes=current.quotes.filter(q=>q.codeIds.some(id=>codes.includes(id)));
        modal('Evidencia de la categoría',quotes.map(q=>`<blockquote>${e(q.text)}</blockquote><p class="muted">${e(location(current,q))}</p>`).join('') || '<p>Todavía no hay citas vinculadas a esta categoría.</p>',async()=>{},'Cerrar');
      }
    };
    node.addEventListener('dblclick',inspect);
    const connect = () => {
      if (!mapConnecting || saving || mapOrganizing) return;
      const id = node.dataset.node;
      if (!mapSource) {mapSource=id;node.classList.add('connection-source');notify(`Origen: ${findNode(id).name}. Selecciona el destino.`);return;}
      if (mapSource===id) {notify('Elige un nodo de destino diferente.',true);return;}
      const source=mapSource;mapSource=undefined;mapConnecting=false;
      document.querySelector('[data-action=connect-map]').setAttribute('aria-pressed','false');
      svg.querySelectorAll('.connection-source').forEach(selected=>selected.classList.remove('connection-source'));
      relationDialog(undefined,{source,target:id});
    };
    node.addEventListener('click',connect);
    node.addEventListener('keydown',event => { if(event.key==='Enter') {event.preventDefault();if(mapConnecting)connect();else inspect();} });
  });
}
async function organizeMap() {
  if (saving || mapOrganizing) throw new Error('Espera a que termine la operación anterior.');
  const projectId=current.id, updatedAt=current.updatedAt;
  const mode=document.querySelector('#map-layout').value;
  mapOrganizing=true;mapConnecting=false;mapSource=undefined;
  const control=document.querySelector('[data-action=organize-map]');control.disabled=true;control.textContent='Organizando…';
  try {
    const result=await autoLayout(structuredClone(current),mode);
    if(current?.id!==projectId || current.updatedAt!==updatedAt)throw new Error('El proyecto cambió durante la organización. Vuelve a intentarlo.');
    await mutate(p=>{p.positions=result.positions;p.mapLayout=result.mapLayout;log(p,'Mapa organizado',mapLayouts.find(layout=>layout.id===mode).name);});
    if(tab==='map')actions['fit-map']();
    notify('Organización guardada. Códigos, relaciones y citas conservados.');
  } finally {mapOrganizing=false;if(current && tab==='map'){const next=document.querySelector('[data-action=organize-map]');if(next){next.disabled=false;next.textContent='Organizar mapa';}}}
}
async function saveRelation(form, id) {
  if(form.get('source')===form.get('target')) throw new Error('Elige dos nodos diferentes.');
  const type=form.get('type')==='custom' ? form.get('customType')?.trim() : form.get('type');
  if(!type || type.length>120) throw new Error('Escribe un vínculo de hasta 120 caracteres.');
  if(!form.get('memo').trim() && !form.getAll('quoteIds').length) throw new Error('Añade al menos una cita de respaldo o un memo interpretativo.');
  if(type==='es causa de' && !form.get('memo').trim()) throw new Error('Explicita en el memo el fundamento de la relación causal.');
  await mutate(p=>{
    const value={id:id||uid(),source:form.get('source'),target:form.get('target'),type,memo:form.get('memo').trim(),quoteIds:form.getAll('quoteIds')};
    if(id) p.relations[p.relations.findIndex(relation=>relation.id===id)]=value; else p.relations.push(value);
    log(p,id?'Relación revisada':'Relación creada',JSON.stringify(value));
  });
}
function setupQuickRelations(svg) {
  const form=document.querySelector('#quick-relation-form');
  if(!form)return;
  const quick=form.closest('details'), classic=document.querySelector('.map-classic');
  quick.open=mapQuickOpen;classic.open=mapClassicOpen;
  quick.addEventListener('toggle',()=>{mapQuickOpen=quick.open;});
  classic.addEventListener('toggle',()=>{mapClassicOpen=classic.open;});
  form.querySelectorAll('[data-node-search]').forEach(search=>search.addEventListener('input',()=>{
    const text=search.value.trim().toLocaleLowerCase();
    form.querySelectorAll(`input[name="${search.dataset.nodeSearch}"]`).forEach(input=>{
      const label=input.closest('.quick-node');
      label.hidden=!input.checked && !label.textContent.toLocaleLowerCase().includes(text);
    });
  }));
  form.addEventListener('change',()=>{
    const selected=new FormData(form);
    const custom=form.querySelector('[name=customType]');
    custom.disabled=selected.get('type')!=='custom';custom.required=!custom.disabled;
    svg.querySelectorAll('.map-node').forEach(node=>{
      node.classList.toggle('quick-source',node.dataset.node===selected.get('source'));
      node.classList.toggle('quick-target',node.dataset.node===selected.get('target'));
    });
  });
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    const submit=form.querySelector('[type=submit]');submit.disabled=true;
    try {await saveRelation(new FormData(form));notify('Relación creada y guardada desde el panel rápido.');}
    catch(error){form.querySelector('.form-error').textContent=error.message;}
    finally{submit.disabled=false;}
  });
}
function relationDialog(id, endpoints = {}) {
  const r=current.relations.find(r=>r.id===id) || {source:'',target:'',type:relationTypes[0],memo:'',quoteIds:[],...endpoints};
  const nodes=[...current.categories.map(c=>({...c,name:`Categoría: ${c.name}`})),...current.codes.map(c=>({...c,name:`Código: ${c.name}`}))];
  if(nodes.length<2) throw new Error('Crea al menos dos códigos o categorías antes de relacionarlos.');
  const customType = !relationTypes.includes(r.type);
  modal(id ? 'Revisar relación' : 'Nueva relación',`<div class="form-grid"><label>Desde<select name="source" required>${options(nodes,r.source,'Seleccionar origen')}</select></label><label>Hacia<select name="target" required>${options(nodes,r.target,'Seleccionar destino')}</select></label></div><div class="form-grid"><label>Vinculación<select name="type">${relationTypes.map(type=>`<option value="${e(type)}" ${r.type===type?'selected':''}>${e(type)}</option>`).join('')}<option value="custom" ${customType?'selected':''}>Texto personalizado</option></select></label><label data-custom-type-field ${customType?'':'hidden'}>Texto del vínculo<input name="customType" value="${customType?e(r.type):''}" maxlength="120" ${customType?'required':''} placeholder="p. ej., facilita en ciertos contextos"></label></div>${textarea('Memo / fundamento interpretativo','memo',r.memo)}<fieldset><legend>Citas de respaldo</legend>${checklist('quoteIds',current.quotes.map(q=>({id:q.id,name:`${location(current,q)}: ${q.text.slice(0,130)}`})),r.quoteIds)}</fieldset><p class="muted">La dirección es origen → destino. También puedes relacionar grupos y códigos. Las vinculaciones causales requieren fundamento interpretativo.</p>`,async form=>{
    await saveRelation(form,id);
  });
  const typeSelect=dialog.querySelector('[name=type]');
  const customField=dialog.querySelector('[data-custom-type-field]');
  const customInput=dialog.querySelector('[name=customType]');
  const updateCustomType=()=>{const enabled=typeSelect.value==='custom';customField.hidden=!enabled;customInput.disabled=!enabled;customInput.required=enabled;};
  typeSelect.addEventListener('change',updateCustomType);
  updateCustomType();
}
function promptsView() {
  return `<div class="prompt-layout"><form id="prompt-form" class="prompt-config"><fieldset><legend>Preguntas / objetivos autorizados para esta solicitud</legend>${checklist('researchQuestionIds',researchItems())}</fieldset><p class="muted">El banco completo permanece fuera del prompt. Selecciona uno o varios elementos; si eliges varios, los resultados se pedirán separados. Administra el banco en Ajustes.</p>${textarea('Consulta focalizada (opcional si seleccionas preguntas)','question',activeResearch().length?'':current.question,3)}<div class="form-grid"><label>Modalidad<select name="mode"><option>Inductiva</option><option>Deductiva</option><option>Mixta</option></select></label><label>Operación<select name="operation" id="prompt-operation"><option>Codificar</option><option>Proponer subcódigos</option><option>Proponer categorías mayores</option><option>Comparar o fusionar códigos</option></select></label></div>
    <label><input type="checkbox" name="externalMaterial" checked> Usar originales en IA externa: excluir texto del corpus</label>
    <label>Material autorizado<select name="scope" id="prompt-scope"><option value="selection" ${selection?'selected':''}>Fragmento seleccionado en Documentos</option><option value="documents" ${!selection?'selected':''}>Documentos elegidos explícitamente</option><option value="quotes">Citas previamente codificadas</option></select></label>
    <div id="scope-selection" class="scope-panel"><p>${selection ? `${e(current.documents.find(d=>d.id===selection.documentId)?.name)} · ${selection.end-selection.start} caracteres` : 'Sin selección. Ve a Documentos y selecciona el fragmento antes de volver aquí.'}</p></div>
    <div id="scope-documents" class="scope-panel"><p class="muted">Ningún documento se incluye por defecto. Elegir un documento incluye todos sus párrafos.</p>${checklist('documentIds',current.documents)}</div>
    <div id="scope-quotes" class="scope-panel"><label>Mostrar citas de un código<select id="prompt-code-filter">${options(current.codes,'','Todos')}</select></label>${checklist('quoteIds',current.quotes.map(q=>({id:q.id,name:`${location(current,q)}: ${q.text.slice(0,150)}`})))}</div>
    <details><summary>Libro de códigos incluido en el prompt</summary><p class="muted">Incluye solo lo pertinente. En deductiva debes seleccionar al menos un código.</p>${checklist('codeIds',current.codes)}</details>
    <label>Máximo de códigos nuevos propuestos<input type="number" name="budget" value="5" min="0" max="50" required></label><p class="muted">Límite de revisión, no cuota metodológica. Se permiten cero propuestas. En deductiva no se autoriza crear códigos.</p><button class="primary full" type="submit">Preparar prompt y guardar solicitud</button>
    </form><div class="prompt-output"><div class="output-heading"><h3>Paquete para un chat externo</h3>${button('copy-prompt','Copiar', '',lastPrompt?'':'disabled')}<label>Formato de exportación<select id="prompt-format"><option value="json">JSON</option><option value="txt">TXT</option><option value="md">Markdown (.md)</option></select></label>${button('download-prompt','↓ Exportar prompt','quiet',lastPrompt?'':'disabled')}</div><p class="privacy-note">${cloudMode ? 'El paquete se archiva en tu Drive, pero no se envía a ninguna IA.' : 'Preparar no envía nada.'} Revisa y anonimiza antes de copiar. Una suscripción de chat no equivale a una API privada.</p><label><span class="sr-only">Prompt generado</span><textarea id="prompt-output" readonly placeholder="Tu solicitud aparecerá aquí, con instrucciones y referencias de origen.">${e(lastPrompt)}</textarea></label><p id="prompt-size" class="muted">${lastPrompt ? `${lastPrompt.length.toLocaleString('es-CL')} caracteres · no es un conteo de tokens` : 'No se ha preparado ninguna solicitud en esta sesión.'}</p><details><summary>Solicitudes guardadas (${current.prompts.length})</summary>${current.prompts.slice().reverse().map(r=>`<div class="prompt-record"><strong>${e(r.question)}</strong><small>${new Date(r.createdAt).toLocaleString('es-CL')} · ${e(r.operation)} · ${e(r.mode)} · ${r.externalMaterial ? 'Sin texto del corpus' : 'Contiene texto del corpus'}</small>${button('load-prompt','Abrir paquete','quiet',`data-id="${r.id}"`)}</div>`).join('') || '<p class="muted">Sin solicitudes guardadas.</p>'}</details></div></div>`;
}
function setupPrompt() {
  const scope=document.querySelector('#prompt-scope');
  const update=()=>document.querySelectorAll('.scope-panel').forEach(panel=>{panel.hidden=panel.id!==`scope-${scope.value}`;});
  scope.addEventListener('change',update); update();
  document.querySelector('#prompt-operation').addEventListener('change',event=>{
    if(event.target.value!=='Codificar') {scope.value='quotes';update();}
  });
  document.querySelector('#prompt-code-filter').addEventListener('change',event=>{
    const id=event.target.value;
    document.querySelectorAll('#scope-quotes input[name=quoteIds]').forEach(input=>{
      const q=current.quotes.find(q=>q.id===input.value);
      const visible=!id||q.codeIds.includes(id);
      input.closest('label').hidden=!visible;
      if(!visible) input.checked=false;
    });
  });
  document.querySelector('#prompt-form').addEventListener('submit',async event=>{
    event.preventDefault();
    try {
      const f=new FormData(event.currentTarget);
      const config={requestId:uid(),externalMaterial:f.has('externalMaterial'),question:f.get('question').trim(),researchQuestionIds:f.getAll('researchQuestionIds'),mode:f.get('mode'),operation:f.get('operation'),scope:f.get('scope'),budget:Number(f.get('budget')),codeIds:f.getAll('codeIds'),documentIds:f.getAll('documentIds'),quoteIds:f.getAll('quoteIds'),selection};
      const text=promptText(current,config);
      const record={id:config.requestId,manifest:promptManifest(current,config),externalMaterial:config.externalMaterial,createdAt:now(),question:config.question||activeResearch().filter(q=>config.researchQuestionIds.includes(q.id)).map(q=>q.text).join(' / '),researchQuestionIds:config.researchQuestionIds,mode:config.mode,operation:config.operation,scope:config.scope,text};
      await mutate(p=>{p.prompts.push(record);log(p,'Prompt preparado',JSON.stringify({id:record.id,question:record.question,scope:record.scope}));});
      lastPrompt=text; lastPromptId=record.id; render(); notify('Prompt preparado y guardado. No se envió nada a una IA.');
    } catch(error) {report(error);}
  });
}
function reviewView() {
  const batches = current.externalReviews || [];
  const labels = {pending:'Pendiente',invalid:'Bloqueada',accepted:'Aceptada',rejected:'Rechazada'};
  return `<div class="external-review"><p class="privacy-note">Verificación literal local; la pertinencia metodológica requiere revisión humana.</p>${batches.slice().reverse().map(batch => `<section class="review-batch"><h3>Solicitud ${e(batch.promptId)}</h3><p class="muted">${e(new Date(batch.createdAt).toLocaleString('es-CL'))} · ${batch.items.length} propuestas</p>${batch.items.map(item => {
    const proposal = item.proposal;
    let reason = item.reason, valid = false;
    if (['pending','invalid'].includes(item.status)) {
      try { verifyExternalProposal(current,current.prompts.find(r => r.id === batch.promptId),proposal); valid = true; }
      catch(error) { reason = error.message; }
    }
    const doc = current.documents.find(d => d.id === proposal.documentId);
    const codeName = proposal.code?.name || findCode(proposal.code?.existingId)?.name || 'Código no reconocido';
    const attrs = `data-id="${batch.id}:${item.id}"`;
    const unresolved = ['pending','invalid'].includes(item.status);
    return `<article class="quote-card" data-review-item="${item.id}" data-state="${unresolved ? valid?'pending':'invalid':item.status}"><header><strong>${e(codeName)}</strong><span class="review-status">${icon(unresolved ? valid?Clock:CircleAlert:item.status==='accepted'?Check:X)}${unresolved ? valid ? 'Pendiente' : 'Bloqueada' : labels[item.status]}</span></header><blockquote>${e(proposal.text)}</blockquote><p>${e(doc?.name || 'Documento desconocido')} · ${e(proposal.documentId)}</p>${proposal.code?.description ? `<p><strong>Definición:</strong> ${e(proposal.code.description)}</p><p><strong>Incluir:</strong> ${e(proposal.code.inclusion)}</p><p><strong>Excluir:</strong> ${e(proposal.code.exclusion)}</p>` : ''}<p><strong>Fundamento:</strong> ${e(proposal.memo)}</p><p class="memo">${e(reason)}</p><footer><small>ID propuesta: ${e(proposal.id)}</small><div>${unresolved ? button('accept-result','✓ Aceptar','',`${attrs} ${valid?'':'disabled'}`) + button('reject-result','Rechazar','quiet danger',attrs) : ''}${doc ? button('result-source','Ver documento ↗','quiet',attrs) : ''}</div></footer></article>`;
  }).join('')}</section>`).join('') || empty('Sin propuestas externas','') }</div>`;
}
function importResults() {
  modal('Importar resultados externos JSON', `${textarea('Resultados JSON','results','',12)}${button('choose-results','↑ Seleccionar archivo JSON','quiet')}<label class="auto-validation"><input type="checkbox" name="autoValidate"> Autovalidar y aceptar propuestas verificables</label><p class="privacy-note">Desactivado por defecto. La autovalidación no evalúa calidad metodológica ni acepta citas ambiguas, inventadas o fuera del alcance. Máximo 2 MB y 500 propuestas.</p>`, async form => {
    const batch = stageExternalResults(current,form.get('results'));
    await mutate(p => {
      p.externalReviews ||= [];
      p.externalReviews.push(batch);
      log(p,'Resultados externos importados',JSON.stringify({batchId:batch.id,promptId:batch.promptId,autoValidate:form.has('autoValidate')}));
      if (form.has('autoValidate')) for (const item of batch.items) {
        if (item.status !== 'pending') continue;
        try { decideExternalResult(p,batch.id,item.id,true); }
        catch(error) { item.status = 'invalid'; item.reason = error.message; }
      }
    });
    tab = 'review'; render();
    notify('Resultados importados. Las propuestas bloqueadas no modifican códigos ni citas.');
  },'Importar JSON');
}
function reviewItem(id) {
  const [batchId,itemId] = id.split(':');
  const batch = (current.externalReviews || []).find(b => b.id === batchId);
  const item = batch?.items.find(item => item.id === itemId);
  if (!item) throw new Error('Propuesta no disponible.');
  return {batchId,itemId,item,batch};
}
function historyView() {
  return `<div class="history-list"><p class="muted">Las acciones se registran con la hora del equipo. Deshacer revierte el último cambio solo durante esta sesión; la bitácora conserva la acción y su reversión. Los respaldos JSON incluyen la bitácora completa.</p>${current.history.slice().reverse().map(h=>`<article><time datetime="${e(h.at)}">${e(new Date(h.at).toLocaleString('es-CL'))}</time><div><strong>${e(h.action)}</strong><p>${e(h.detail)}</p></div></article>`).join('') || empty('Sin cambios todavía','Las acciones del proyecto aparecerán aquí.')}</div>`;
}
function help() {
  if(cloudMode) {
    modal('Guía de la instalación privada', `<div class="help"><h3>Drive es el almacenamiento principal</h3><p>Cada guardado confirmado crea un archivo JSON completo e inmutable. La hoja Proyectos apunta a la versión vigente. Los documentos importados también conservan su original en Drive. No compartas la carpeta, la hoja ni los archivos.</p><h3>Sheets es un índice, no el editor</h3><p>En «Drive, índices y versiones», actualiza los índices después de trabajar. Las pestañas Documentos, Categorias, Codigos, Citas, Relaciones y Bitacora son proyecciones regenerables. No edites Proyectos ni uses las hojas para cambiar la codificación.</p><h3>Recuperación y conflictos</h3><p>Si falla una conexión, el intento completo queda en este navegador. En Recuperación local puedes descargarlo, reintentarlo con el mismo identificador o guardarlo como proyecto nuevo. Un conflicto nunca sobrescribe silenciosamente otro equipo. Antes de cerrar, espera la confirmación de Drive.</p><h3>Versiones</h3><p>Descarga versiones anteriores desde «Drive, índices y versiones». Para revisarlas sin reemplazar el proyecto actual, restáuralas como copias independientes. También puedes conservar respaldos JSON fuera de Google.</p><h3>Análisis y prompts</h3><p>El flujo de códigos, categorías, citas, memos, mapas e insertos funciona como en la versión local. Los prompts se archivan en Drive, sin enviarse a una IA. Revisa anonimización y consentimientos antes de copiarlos a un chat.</p><h3>Límites</h3><p>Solo PC. Máximo 8 MB de JSON por proyecto y 8 MB por archivo original. Las cuotas de Google pueden interrumpir operaciones. Las versiones consumen espacio y no se purgan automáticamente. Es una instalación personal, no un sistema colaborativo. Las copias pendientes del navegador y los JSON descargados no están cifrados por TRAMA-QDA.</p></div>`,async()=>{},'Entendido');
    return;
  }
  modal('Guía de uso y privacidad',`<div class="help"><h3>Corpus y codificación</h3><p>Importa TXT UTF-8, DOCX o pega texto. Se conserva el texto extraído, no páginas ni formato del Word. Selecciona fragmentos en Documentos y asigna códigos desde el inspector lateral. Usa definiciones, criterios y memos para registrar decisiones.</p><h3>Evidencia y relaciones</h3><p>Las citas conservan su documento, párrafos y posiciones. Puedes consultarlas por código, categoría o pregunta, volver al origen y exportar CSV, HTML o mapas SVG. Las relaciones dirigidas requieren citas o fundamento interpretativo.</p><h3>Prompts y revisión externa</h3><p>Los nuevos prompts excluyen por defecto el texto del corpus y se exportan en JSON, TXT o Markdown. Adjunta los originales directamente en el chat externo y conserva los IDs del contrato. Importa únicamente respuestas JSON vinculadas a una solicitud de este proyecto. En Revisión externa puedes aceptar, rechazar o consultar el origen. Las citas deben coincidir literalmente y estar dentro del alcance autorizado; las citas repetidas requieren offsets exactos.</p><p>La autovalidación está desactivada por defecto en cada importación. Al activarla, se aceptan solo propuestas verificables; no se evalúa la pertinencia metodológica. Los bloqueos nunca se omiten. Categorías, jerarquías y fusiones sugeridas en memos se deciden manualmente en el libro.</p><h3>Privacidad y respaldos</h3><p>No hay llamadas a IA ni envío automático de entrevistas. Los originales que adjuntes al chat quedan sujetos a sus condiciones: anonimiza y revisa consentimientos. Los proyectos locales usan IndexedDB; borrar datos del sitio o cambiar de dispositivo puede hacerlos inaccesibles. Descarga respaldos JSON sin cifrar y consérvalos de forma segura. Restaurar crea una copia independiente y requiere nuevos prompts para nuevas importaciones externas. No hay edición colaborativa, OCR ni importación propietaria de ATLAS.ti; no estamos afiliados a ATLAS.ti.</p></div>`,async()=>{},'Entendido');
}
async function restore() {
  const [file]=await chooseFiles('.json');
  if(!file) return;
  if(file.size>100*1024*1024) throw new Error('El respaldo supera 100 MB. Divide el proyecto antes de importarlo.');
  let restored;
  try {restored=validateProject(JSON.parse(await file.text()));}
  catch {throw new Error('El archivo no es un respaldo válido de TRAMA-QDA versión 1. No se modificaron los proyectos.');}
  restored.id=uid(); restored.name=`${restored.name} (restaurado)`;
  log(restored,'Respaldo restaurado',`Archivo: ${file.name}`);
  const saved = await saveProject(restored); projects.push(saved); current=saved; resetView(); render();
  notify('Respaldo restaurado como proyecto independiente.');
}
async function recoveryPanel() {
  const pending = await listPending();
  pendingCount = pending.length;
  modal('Recuperación local', `<p>Estos intentos todavía no tienen confirmación local. Google podría haberlos recibido. Reintentar usa el mismo ID para evitar duplicados. Si otra versión ya avanzó, descarga el intento o guárdalo como copia.</p>${pending.map(item=>`<article><h3>${e(item.project.name)}</h3><p class="muted">${e(new Date(item.createdAt).toLocaleString('es-CL'))} · intento ${e(item.id)}</p><div class="actions">${button('download-pending','↓ JSON','',`data-id="${item.id}"`)}${button('retry-pending','Reintentar confirmación','',`data-id="${item.id}"`)}${button('copy-pending','Guardar como proyecto nuevo','',`data-id="${item.id}"`)}${button('discard-pending','Descartar intento','quiet danger',`data-id="${item.id}"`)}</div></article>`).join('') || '<p>No hay intentos pendientes en este navegador.</p>'}`,async()=>{},'Cerrar');
}
async function cloudPanel() {
  const info = await cloudCall('getCloudInfo');
  const versions = current ? await cloudCall('listCloudVersions',current.id) : [];
  const safeGoogleLink = (url, label) => {
    const parsed = new URL(url);
    if(parsed.protocol!=='https:' || !['drive.google.com','docs.google.com'].includes(parsed.hostname)) throw new Error('Google devolvió un enlace inesperado.');
    return `<a href="${e(url)}" target="_blank" rel="noopener noreferrer">${label} ↗</a>`;
  };
  modal('Drive, índices y versiones', `<p>${safeGoogleLink(info.folderUrl,'Abrir carpeta privada de Drive')} · ${safeGoogleLink(info.spreadsheetUrl,'Abrir índices de Sheets')}</p><h3>Índices consultables</h3><p>Drive conserva siempre la versión completa. Las pestañas de Sheets se regeneran a petición, para no bloquear cada codificación con múltiples escrituras. No edites la hoja Proyectos.</p>${button('rebuild-indexes','Actualizar índices de Sheets','primary')}<h3>Versiones de este proyecto (${versions.length})</h3><p class="muted">Cada guardado genera una versión. Descarga una anterior y restáurala como copia si necesitas recuperarla.</p>${versions.map(v=>`<div class="prompt-record"><strong>${e(new Date(v.createdAt).toLocaleString('es-CL'))} ${v.current?'· vigente':''}</strong>${button('download-version','↓ Descargar JSON','quiet',`data-id="${e(v.id)}"`)}</div>`).join('')}`,async()=>{},'Cerrar');
}
async function getPending(id) {
  const pending = (await listPending()).find(p=>p.id===id);
  if(!pending) throw new Error('Este intento ya fue resuelto.');
  return pending;
}
async function refreshCloud(saved) {
  projects = await listProjects();
  current = projects.find(p=>p.id===saved.id);
  pendingCount = (await listPending()).length;
  dialog.close(); resetView(); render();
}
function showSource(id) {
  const q=current.quotes.find(q=>q.id===id);
  docId=q.documentId; documentSearch=''; selection={documentId:q.documentId,start:q.start,end:q.end};tab='documents';render();
  const para=[...document.querySelectorAll('p[data-start]')].find(el=>Number(el.dataset.end)>q.start);
  para?.scrollIntoView({block:'center',behavior:'smooth'});
}
async function undoLastAction() {
  if (!undoSnapshot || current.id !== undoProjectId) throw new Error('No hay cambios para deshacer en este proyecto.');
  const snapshot = structuredClone(undoSnapshot);
  const history = structuredClone(current.history);
  const action = undoAction;
  const previousUndo = { snapshot: undoSnapshot, projectId: undoProjectId, action: undoAction };
  undoSnapshot = undefined;
  undoProjectId = undefined;
  undoAction = '';
  try {
    await mutate(project => {
      Object.assign(project, snapshot);
      project.history = history;
      log(project, 'Cambio deshecho', `Se revirtió: ${action}`);
    }, { recordUndo: false });
  } catch (error) {
    if (!cloudMode) {
      undoSnapshot = previousUndo.snapshot;
      undoProjectId = previousUndo.projectId;
      undoAction = previousUndo.action;
      render();
    }
    throw error;
  }
  notify(cloudMode
    ? 'Cambio revertido en una nueva versión de Drive; los originales y versiones previas se conservan.'
    : 'Último cambio del proyecto deshecho.');
}
const actions = {
  'home':()=>{current=undefined;welcome();},
  'resume':()=>{current=projects[0];resetView();render();},
  'new-project':()=>projectDialog(), 'edit-project':()=>projectDialog(true),
  'demo':async()=>{const p=demoProject();const saved=await saveProject(p);projects.push(saved);current=saved;resetView();render();},
  'close-dialog':()=>dialog.close(),
  'undo':undoLastAction,
  'import-document':importDocument, 'paste-document':pasteDocument,
  'select-document':id=>{docId=id;selection=null;documentSearch='';render();},
  'new-code':()=>codeDialog(), 'edit-code':codeDialog,
  'new-category':()=>categoryDialog(), 'edit-category':categoryDialog,
  'go-documents':()=>{tab='documents';render();},'go-book':()=>{tab='book';render();},
  'code-quotes':id=>{quoteFilter=id;categoryFilter='';quoteSearch='';tab='quotes';render();},
  'source':showSource,'edit-quote':editQuote,
  'delete-quote':id=>modal('Eliminar cita', '<p>Se eliminará esta cita y sus vínculos de respaldo en relaciones. El texto fuente y los códigos permanecerán. Esta acción no tiene deshacer.</p>',async()=>{await mutate(p=>{p.quotes=p.quotes.filter(q=>q.id!==id);p.relations.forEach(r=>{r.quoteIds=r.quoteIds.filter(q=>q!==id);});log(p,'Cita eliminada',id);});},'Eliminar cita'),
  'backup':()=>{download(`${fileName(current.name)}-${now().slice(0,10)}.json`,JSON.stringify(current,null,2),'application/json');notify('Respaldo descargado. Contiene entrevistas y citas: guárdalo de forma segura.');},
  'restore':restore,'help':help,
  'recovery':recoveryPanel, 'cloud-panel':cloudPanel,
  'download-pending':async id=>{const item=await getPending(id);download(`${fileName(item.project.name)}-pendiente.json`,JSON.stringify(item.project,null,2),'application/json');},
  'retry-pending':async id=>{const saved=await retryPending(id);await refreshCloud(saved);notify('Google confirmó la versión. El intento local quedó resuelto.');},
  'copy-pending':async id=>{const item=await getPending(id);const copy=structuredClone(item.project);copy.id=uid();copy.name+=' (recuperado)';log(copy,'Intento recuperado como copia',id);const saved=await saveProject(copy);await discardPending(id);await refreshCloud(saved);notify('La copia quedó guardada en Drive sin reemplazar el proyecto original.');},
  'discard-pending':async id=>{
    const item=await getPending(id);
    dialog.close();
    modal('Descartar intento local',`<p>Se eliminará únicamente el intento pendiente de ${e(item.project.name)}. No modifica Drive. Descarga su JSON antes si necesitas conservarlo.</p>`,async()=>{await discardPending(id);pendingCount=(await listPending()).length;render();},'Descartar intento');
  },
  'rebuild-indexes':async()=>{
    const control=dialog.querySelector('[data-action=rebuild-indexes]');control.disabled=true;
    try {const result=await cloudCall('rebuildCloudIndexes');notify(`Índices de ${result.projects} proyecto(s) actualizados en Sheets.`);}
    finally {control.disabled=false;}
  },
  'download-version':async id=>{const p=await cloudCall('getCloudVersion',current.id,id);validateProject(p);download(`${fileName(p.name)}-version-${p.updatedAt.slice(0,10)}.json`,JSON.stringify(p,null,2),'application/json');},
  'export-book':()=>download(`${fileName(current.name)}-libro.csv`,csv([['ID','Ruta','Definición','Incluir','Excluir'],...current.codes.map(c=>[c.id,codePath(current,c.id),c.description,c.inclusion,c.exclusion])]),'text/csv;charset=utf-8'),
  'export-quotes':()=>download(`${fileName(current.name)}-matriz.csv`,csv([['Proyecto','Categoría → código','ID código','ID cita','Cita literal','Origen','Memo','Preguntas / objetivos'],...exportRows()]),'text/csv;charset=utf-8'),
  'export-report':exportReport,
  'new-relation':()=>relationDialog(), 'edit-relation':relationDialog,
  'organize-map':organizeMap,
  'connect-map':()=>{mapConnecting=!mapConnecting;mapSource=undefined;document.querySelector('[data-action=connect-map]').setAttribute('aria-pressed',String(mapConnecting));document.querySelectorAll('.connection-source').forEach(node=>node.classList.remove('connection-source'));if(mapConnecting)notify('Selecciona el nodo de origen y luego el de destino.');},
  'delete-relation':id=>modal('Eliminar relación','<p>Se eliminará solo esta relación interpretativa. Sus códigos y citas permanecerán.</p>',async()=>{await mutate(p=>{p.relations=p.relations.filter(r=>r.id!==id);log(p,'Relación eliminada',id);});},'Eliminar relación'),
  'export-map':exportMap,
  'export-map-png':exportMapPNG,
  'fit-map':()=>{const svg=document.querySelector('#relation-map');if(!svg)return;const bounds=mapBounds(svg);svg.setAttribute('viewBox',`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`);svg.setAttribute('width',String(document.querySelector('.map-scroll').clientWidth));svg.setAttribute('height',String(document.querySelector('.map-scroll').clientWidth*bounds.height/bounds.width));const zoom=document.querySelector('#map-zoom');if(!zoom.querySelector('[value=fit]'))zoom.add(new Option('Ajustado','fit',false,true));zoom.value='fit';},
  'copy-prompt':async()=>{try{await navigator.clipboard.writeText(lastPrompt);notify('Prompt copiado. Revisa los datos antes de enviarlos a un chat.');}catch{throw new Error('El navegador no permitió copiar. Selecciona el texto del paquete y cópialo manualmente, o descarga TXT.');}},
  'download-prompt':()=>{const format=document.querySelector('#prompt-format').value;const record=current.prompts.find(p=>p.id===lastPromptId);if(!record)throw new Error('Abre o prepara una solicitud antes de exportar.');download(`${fileName(current.name)}-prompt.${format}`,exportPrompt(record,format),format==='json'?'application/json':'text/plain;charset=utf-8');},
  'load-prompt':id=>{lastPrompt=current.prompts.find(p=>p.id===id).text;lastPromptId=id;render();},
  'import-results':importResults,
  'choose-results':async()=>{const [file]=await chooseFiles('.json,application/json');if(!file)return;if(!/\.json$/i.test(file.name)||file.size>2*1024*1024)throw new Error('Selecciona un archivo .json de hasta 2 MB.');dialog.querySelector('[name=results]').value=await file.text();},
  'accept-result':async id=>{const {batchId,itemId}=reviewItem(id);await mutate(p=>decideExternalResult(p,batchId,itemId,true));},
  'reject-result':async id=>{const {batchId,itemId}=reviewItem(id);await mutate(p=>decideExternalResult(p,batchId,itemId,false));},
  'result-source':id=>{const {item,batch}=reviewItem(id);docId=item.proposal.documentId;documentSearch='';selection=null;try{const result=verifyExternalProposal(current,current.prompts.find(r=>r.id===batch.promptId),item.proposal);selection={documentId:docId,start:result.start,end:result.end};}catch{}tab='documents';render();const para=[...document.querySelectorAll('p[data-start]')].find(el=>selection&&Number(el.dataset.end)>selection.start);para?.scrollIntoView({block:'center'});},
};
document.addEventListener('click',async event=>{
  const target=event.target.closest('[data-action], [data-tab]');
  if(!target) return;
  event.preventDefault();
  try {
    if(saving || mapOrganizing) throw new Error('Espera a que termine el guardado o la organización antes de cambiar de tarea.');
    if(target.dataset.tab) {tab=target.dataset.tab;render();window.scrollTo(0,0);return;}
    await actions[target.dataset.action]?.(target.dataset.id);
  } catch(error) {report(error);}
});
document.addEventListener('change',event=>{
  if(event.target.id==='project-select') {current=projects.find(p=>p.id===event.target.value);resetView();render();}
  if(event.target.id==='quote-filter') {quoteFilter=event.target.value;render();}
  if(event.target.id==='category-filter') {categoryFilter=event.target.value;render();}
  if(event.target.id==='research-filter') {researchFilter=event.target.value;render();}
});
document.addEventListener('input',event=>{
  if(event.target.id==='document-search') {documentSearch=event.target.value;refreshSearch('document-search');}
  if(event.target.id==='quote-search') {quoteSearch=event.target.value;refreshSearch('quote-search');}
});
document.addEventListener('selectionchange',()=>{
  if(tab==='documents' && !dialog.open) captureSelection?.();
});
function refreshSearch(id) {
  const el=document.getElementById(id);
  const position=el.selectionStart;
  render();
  const next=document.getElementById(id);next.focus();
  if(next.type!=='search') next.setSelectionRange(position,position);
}
window.addEventListener('error',event=>report(event.error || new Error(event.message)));
window.addEventListener('unhandledrejection',event=>{event.preventDefault();report(event.reason);});
window.addEventListener('beforeunload',event=>{
  if(saving) {event.preventDefault();event.returnValue='';}
});
async function start() {
  try {
    await openDB();
    pendingCount = (await listPending()).length;
    projects=(await listProjects()).map(validateProject);
    projects.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
    current=projects[0];render();
  } catch(error) {
    app.innerHTML='<main class="welcome"><h1>No se pudo abrir el almacenamiento local</h1><p>No borres los datos del sitio. Prueba abrirlo en el navegador habitual, con almacenamiento permitido y fuera del modo incógnito.</p><button type="button" onclick="location.reload()">Reintentar</button></main>';
    if(cloudMode) {
      app.innerHTML='<main class="welcome"><h1>No se pudo abrir Drive privado</h1><p>Comprueba la conexión y la cuenta Google propietaria. No borres los datos locales: pueden contener cambios pendientes.</p><div class="actions"><button type="button" onclick="location.reload()">Reintentar conexión</button><button type="button" data-action="recovery">Recuperación local</button></div></main>';
    }
    report(error);
  }
}
start();
