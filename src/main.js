import './style.css';
import { uid, now, colors, relationTypes, thematicPhases, codeDocumentMatrix, escapeHTML as e, project, log, paragraphs, location, addQuote, validateProject, codePath, promptText, csv, demoProject, updateResearchBank } from './domain.js';
import { openDB, listProjects, saveProject, cloudMode, storageLabel, cloudCall, listPending, retryPending, discardPending, uploadOriginal } from './storage.js';

const app = document.querySelector('#app');
const dialog = document.querySelector('#dialog');
let projects = [];
let current;
let tab = 'documents';
let docId;
let selection = null;
let quoteFilter = '';
let quoteDocumentFilter = '';
let documentSearch = '';
let quoteSearch = '';
let researchFilter = '';
let lastPrompt = '';
let saving = false;
let noticeTimer;
let captureSelection;
let pendingCount = 0;
const privacySummary = cloudMode ? 'Instalación privada · Drive y Sheets · Sin IA integrada.' : 'Sin IA integrada. Sin envío de entrevistas.';
const tabs = [['documents', 'Documentos'], ['book', 'Libro de códigos'], ['matrix', 'Matriz código × documento'], ['quotes', 'Citas e insertos'], ['thematic', 'Análisis temático'], ['map', 'Mapa de relaciones'], ['prompts', 'Prompts sin API'], ['history', 'Bitácora']];
const findCode = id => current.codes.find(c => c.id === id);
const findNode = id => [...current.categories, ...current.codes].find(c => c.id === id);
const activeResearch = () => (current.researchQuestions || []).filter(q => !q.archived);
const researchItems = () => activeResearch().map(q => ({id:q.id,name:`${q.kind}: ${q.text}`}));
const researchText = quote => (current.researchQuestions || []).filter(q => (quote.researchQuestionIds || []).includes(q.id)).map(q => `${q.kind}: ${q.text}${q.archived?' (archivado)':''}`).join(' · ');
const button = (action, text, cls = '', attrs = '') => `<button type="button" class="${cls}" data-action="${action}" ${attrs}>${text}</button>`;
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
async function mutate(action) {
  if (saving) throw new Error('Espera a que termine el guardado anterior.');
  saving = true;
  updateSaveState();
  const next = structuredClone(current);
  try {
    action(next);
    validateProject(next);
    const saved = await saveProject(next, current.updatedAt);
    current = saved;
    projects = projects.map(p => p.id === saved.id ? saved : p);
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
  a.href = url; a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function fileName(s) { return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').slice(0, 100) || 'proyecto'; }
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
  app.innerHTML = `<div class="shell">
    <aside class="rail">
      <a class="brand" href="#" data-action="home" aria-label="Trama, inicio"><span aria-hidden="true">⌘</span><div>trama<small>cualitativa</small></div></a>
      <label class="project-switch">Proyecto<select id="project-select">${options(projects, current.id)}</select></label>
      ${button('new-project', '+ Nuevo proyecto', 'new-project')}
      <nav aria-label="Espacios del proyecto">${tabs.map(([id, name]) => `<button type="button" data-tab="${id}" class="${tab === id ? 'active' : ''}" ${tab === id ? 'aria-current="page"' : ''}><span aria-hidden="true">${({documents:'▤', book:'⊞', matrix:'▦', quotes:'❞', thematic:'◇', map:'⌘', prompts:'↗', history:'◷'})[id]}</span>${name}${id === 'documents' ? `<small>${current.documents.length}</small>` : id === 'quotes' ? `<small>${current.quotes.length}</small>` : ''}</button>`).join('')}</nav>
      <div class="rail-bottom"><p id="save-state" role="status"><span class="local-dot"></span> ${saving ? 'Guardando cambios…' : storageLabel()}</p><p class="rail-note">${privacySummary}</p>${cloudMode ? button('cloud-panel','Drive, índices y versiones','rail-backup') + button('recovery',`Recuperación local (${pendingCount})`,'quiet light') : ''}${button('backup', '↓ Descargar respaldo', 'rail-backup')}${button('restore', 'Restaurar respaldo', 'quiet light')}${button('help', 'Guía y privacidad', 'quiet light')}</div>
    </aside>
    <main>
      <header class="topbar"><div><h1>${e(current.name)}</h1><p>${e(current.question || 'Define tu pregunta de investigación en los ajustes del proyecto.')}</p></div>${button('edit-project', 'Ajustes', 'quiet')}</header>
      <div class="page-heading"><div><h2>${tabs.find(t => t[0] === tab)[1]}</h2><p>${({documents:'De la voz a la evidencia. Selecciona un fragmento y asígnale códigos.',book:'Define, organiza y afina tu interpretación sin perder el origen.',matrix:'Explora cuántas citas de cada código hay por documento y vuelve a la evidencia.',quotes:'Sigue el recorrido categoría → código → cita → documento.',thematic:'Registra decisiones de análisis y vincúlalas con citas. Las fases son una guía flexible, no una evaluación automática.',map:'Conecta conceptos. Abre sus citas para volver a la evidencia.',prompts:'Preguntas elegidas, corpus acotado. Tú decides el alcance de cada solicitud.',history:'Registro de cambios y solicitudes de este proyecto.'})[tab]}</p></div><div class="actions">${tabActions()}</div></div>
      <section id="workspace">${({documents:documentsView, book:bookView, matrix:matrixView, quotes:quotesView, thematic:thematicView, map:mapView, prompts:promptsView, history:historyView})[tab]()}</section>
      <footer class="workspace-footer">Trama cualitativa · ${cloudMode ? 'Drive privado' : 'Trabajo local'}, interpretación humana.<span>${current.codes.length} códigos · ${current.categories.length} categorías · ${current.quotes.length} citas</span></footer>
    </main></div>`;
  if (tab === 'documents') setupSelection();
  if (tab === 'prompts') setupPrompt();
  if (tab === 'map') setupMap();
}
function tabActions() {
  if (tab === 'documents') return button('paste-document', 'Pegar entrevista') + button('import-document', '↑ Importar TXT / DOCX', 'primary');
  if (tab === 'book') return button('export-book', '↓ Libro CSV') + button('new-category', '+ Categoría') + button('new-code', '+ Código', 'primary');
  if (tab === 'matrix') return button('export-matrix', '↓ Exportar matriz CSV');
  if (tab === 'quotes') return button('export-quotes', '↓ Matriz CSV') + button('export-report', '↓ Insertos HTML', 'primary');
  if (tab === 'map') return button('export-map', '↓ Mapa SVG') + button('new-relation', '+ Relación', 'primary');
  return '';
}
function welcome() {
  app.innerHTML = `<main class="welcome"><div class="brand dark"><span aria-hidden="true">⌘</span><div>trama<small>cualitativa</small></div></div><div class="welcome-grid"><div><h1>Tu interpretación.<br>Su evidencia.</h1><p class="lead">Un espacio de análisis cualitativo para leer, codificar y conectar entrevistas. ${cloudMode ? 'Instalación privada con Drive y Sheets, sin IA integrada.' : 'Sin IA integrada y sin subir tu corpus.'}</p><div class="actions">${button('new-project', 'Crear mi proyecto', 'primary')}${button('demo', 'Explorar un ejemplo')}</div><p class="muted">El ejemplo contiene solo datos ficticios.</p></div><div class="trace-preview"><h2>Cada idea conserva su origen</h2><ol><li><small>Categoría</small>Articulación institucional</li><li><small>Código</small>Coordinación informal</li><li><small>Cita · ejemplo ficticio</small>“Cuando conocemos a alguien del otro equipo, llamamos directamente.”</li><li><small>Origen</small>Entrevista de ejemplo · párrafo 2</li></ol></div></div><div class="privacy-strip"><strong>${cloudMode ? 'Los proyectos se guardan en tu Drive privado.' : 'Tus datos se quedan en este navegador.'}</strong><p>${cloudMode ? 'Cada guardado confirmado crea una versión completa en Drive. Sheets contiene índices regenerables. Los intentos sin confirmación se conservan en este navegador para recuperarlos. Mantén también respaldos JSON.' : 'No hay cuentas ni sincronización. Descarga respaldos: borrar los datos del navegador elimina los proyectos locales.'} Los prompts se preparan aquí; tú decides si copiarlos en un chat externo.</p>${button('restore', 'Restaurar un respaldo')}${cloudMode ? button('recovery',`Recuperación local (${pendingCount})`) : ''}${projects.length ? button('resume', 'Volver a mis proyectos') : ''}</div></main>`;
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
    <aside class="inspector"><h3>Codificar selección</h3><div id="selection-preview">${selection?.documentId === docId ? `<blockquote>${e(doc.text.slice(selection.start, selection.end))}</blockquote>` : '<p class="muted">Selecciona texto con el ratón o el teclado en la entrevista.</p>'}</div><form id="coding-form"><fieldset><legend>Códigos</legend>${checklist('codeIds', current.codes)}</fieldset>${button('new-code', '+ Crear código', 'quiet')}<fieldset><legend>Preguntas / objetivos vinculados (opcional)</legend>${checklist('researchQuestionIds',researchItems())}</fieldset>${textarea('Memo de la cita (opcional)', 'memo', '', 3)}<button class="primary full" type="submit">Guardar cita codificada</button></form><hr><h3>Conserva el contexto</h3><p class="muted">Una cita puede tener varios códigos. Las ubicaciones se refieren al texto importado, no a las páginas de Word.</p></aside>
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
function matrixView() {
  if (!current.codes.length || !current.documents.length) return empty('La matriz necesita códigos y documentos', 'Importa entrevistas y asigna códigos a algunas citas para explorar su distribución.', button('go-documents','Ir a Documentos','primary') + button('go-book','Ir al libro de códigos'));
  const matrix = codeDocumentMatrix(current);
  const max = Math.max(1,...Object.values(matrix).flatMap(row=>Object.values(row)));
  return `<p class="muted">Cada celda cuenta citas asignadas a ese código en ese documento. Una cita con varios códigos cuenta una vez en cada código. El recuento no representa importancia, prevalencia ni significado; selecciona una celda para revisar sus citas.</p><div class="code-table matrix-table"><table><caption class="sr-only">Citas por código y documento</caption><thead><tr><th scope="col">Código</th>${current.documents.map(doc=>`<th scope="col">${e(doc.name)}</th>`).join('')}</tr></thead><tbody>${current.codes.map(code=>`<tr><th scope="row"><span class="tag" style="--code-color:${code.color}">${e(code.name)}</span><small class="path">${e(codePath(current,code.id))}</small></th>${current.documents.map(doc=>{
    const count=matrix[code.id][doc.id];
    const intensity=count ? (0.12 + 0.68 * count / max).toFixed(2) : 0;
    return `<td class="matrix-cell" style="--cell-intensity:${intensity}">${count ? button('matrix-cell',String(count),'count-button',`data-code="${code.id}" data-document="${doc.id}" aria-label="${count} citas de ${e(code.name)} en ${e(doc.name)}" title="Ver citas de ${e(code.name)} en ${e(doc.name)}"`) : '<span aria-label="0 citas">—</span>'}</td>`;
  }).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function filteredQuotes() {
  return current.quotes.filter(q => (!quoteFilter || q.codeIds.includes(quoteFilter)) && (!quoteDocumentFilter || q.documentId === quoteDocumentFilter) && (!researchFilter || (q.researchQuestionIds || []).includes(researchFilter)) && (!quoteSearch || `${q.text} ${q.memo} ${location(current,q)}`.toLocaleLowerCase().includes(quoteSearch.toLocaleLowerCase())));
}
function quotesView() {
  if (!current.quotes.length) return empty('Aquí empieza la trazabilidad', 'Guarda una cita desde Documentos. Después podrás volver al origen, reorganizar códigos y exportar insertos para tu informe.', button('go-documents', 'Ir a Documentos', 'primary'));
  const quotes = filteredQuotes();
  return `<div class="filterbar"><label>Filtrar por código<select id="quote-filter">${options(current.codes, quoteFilter, 'Todos los códigos')}</select></label><label>Entrevista<select id="quote-document-filter">${options(current.documents, quoteDocumentFilter, 'Todas')}</select></label><label>Pregunta / objetivo<select id="research-filter">${options((current.researchQuestions||[]).map(q=>({id:q.id,name:`${q.text}${q.archived?' (archivado)':''}`})),researchFilter,'Todos')}</select></label><label>Buscar citas o memos<input type="search" id="quote-search" value="${e(quoteSearch)}" placeholder="Texto, entrevista o memo…"></label><span>${quotes.length} de ${current.quotes.length} citas</span></div><div class="quote-list">${quotes.map(q => `<article class="quote-card" id="quote-${q.id}"><header><span>${e(location(current,q))}</span>${button('source', 'Ver en contexto ↗', 'quiet', `data-id="${q.id}"`)}</header><blockquote>${e(q.text)}</blockquote><div class="quote-paths">${q.codeIds.map(id => `<span class="tag" style="--code-color:${findCode(id).color}">${e(codePath(current,id))}</span>`).join('')}</div>${researchText(q)?`<p class="memo"><strong>Preguntas / objetivos:</strong> ${e(researchText(q))}</p>`:''}${q.memo ? `<p class="memo"><strong>Memo:</strong> ${e(q.memo)}</p>` : ''}<footer><small>ID de cita: ${q.id}</small><div>${button('edit-quote', 'Editar códigos / memo', 'quiet', `data-id="${q.id}"`)}${button('delete-quote', 'Eliminar cita', 'quiet danger', `data-id="${q.id}"`)}</div></footer></article>`).join('') || empty('Sin coincidencias', 'Cambia los filtros para ver otras citas.')}</div>`;
}
function thematicView() {
  const data = current.thematicAnalysis || {};
  return `<p class="muted thematic-intro">Guía basada en las seis fases de Braun y Clarke. Registra notas y decisiones, selecciona citas de respaldo y vuelve a la transcripción desde cada evidencia. Las fases pueden revisitarse; esta herramienta no determina si el análisis es correcto ni sustituye la reflexión metodológica.</p><div class="thematic-grid">${thematicPhases.map((phase,index)=>{
    const entry=data[phase.id] || {notes:'',quoteIds:[]};
    return `<article class="thematic-card"><header><span>FASE ${index+1}</span><h3>${e(phase.name)}</h3></header><p class="${entry.notes?'':'muted'} thematic-notes">${entry.notes ? e(entry.notes) : 'Sin notas todavía.'}</p><div class="thematic-evidence"><strong>${entry.quoteIds.length} ${entry.quoteIds.length===1?'cita vinculada':'citas vinculadas'}</strong>${entry.quoteIds.map(id=>{
      const quote=current.quotes.find(q=>q.id===id);
      return quote ? `<div><blockquote>${e(quote.text)}</blockquote><small>${e(location(current,quote))}</small>${button('source','Ver en contexto ↗','quiet',`data-id="${quote.id}"`)}</div>` : '';
    }).join('') || '<p class="muted">No hay evidencia vinculada.</p>'}</div>${button('edit-thematic-phase','Editar notas y evidencia','quiet',`data-id="${phase.id}"`)}</article>`;
  }).join('')}</div>`;
}
function thematicPhaseDialog(id) {
  const phase=thematicPhases.find(item=>item.id===id);
  if(!phase) throw new Error('La fase seleccionada no existe.');
  const entry=current.thematicAnalysis?.[id] || {notes:'',quoteIds:[]};
  modal(phase.name,`${textarea('Notas y decisiones','notes',entry.notes,7)}<fieldset><legend>Citas de respaldo</legend>${checklist('quoteIds',current.quotes.map(q=>({id:q.id,name:`${location(current,q)}: ${q.text.slice(0,150)}`})),entry.quoteIds)}</fieldset><p class="muted">Las citas se vinculan como evidencia; el texto fuente no se copia ni modifica. Puedes volver a esta fase y revisar las notas.</p>`,async form=>{
    await mutate(p=>{
      p.thematicAnalysis ||= Object.fromEntries(thematicPhases.map(item=>[item.id,{notes:'',quoteIds:[]}]));
      p.thematicAnalysis[id]={notes:form.get('notes').trim(),quoteIds:form.getAll('quoteIds')};
      log(p,'Fase de análisis temático actualizada',JSON.stringify({phase:id,quoteIds:p.thematicAnalysis[id].quoteIds}));
    });
  });
}
function codeDialog(id) {
  const c = id ? findCode(id) : { name:'', description:'', inclusion:'', exclusion:'', color:colors[current.codes.length % colors.length], categoryId:null, parentId:null };
  const descendants = new Set(id ? [id] : []);
  let changed = true;
  while (changed) {
    changed = false;
    current.codes.forEach(code => { if (descendants.has(code.parentId) && !descendants.has(code.id)) { descendants.add(code.id); changed = true; } });
  }
  modal(id ? 'Editar código' : 'Nuevo código', `${input('Nombre del código', 'name', c.name, true)}${textarea('Definición', 'description', c.description)}<div class="form-grid">${textarea('Criterios de inclusión','inclusion',c.inclusion)}${textarea('Criterios de exclusión','exclusion',c.exclusion)}</div><div class="form-grid"><label>Categoría mayor<select name="categoryId">${options(current.categories,c.categoryId,'Sin categoría')}</select></label><label>Código padre (subcódigo)<select name="parentId">${options(current.codes.filter(code => !descendants.has(code.id)),c.parentId,'Sin código padre')}</select></label></div>${input('Color', 'color', c.color, true, 'color')}<p class="muted">Cambiar una agrupación conserva las citas y registra el cambio. La categoría se asigna explícitamente a cada código, también a los subcódigos.</p>`, async form => {
    const name = form.get('name').trim();
    if (!name) throw new Error('Escribe un nombre.');
    if (current.codes.some(code => code.id !== id && code.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error('Ya existe un código con ese nombre. Reutilízalo o distingue su significado.');
    await mutate(p => {
      const value = { id: id || uid(), name, description:form.get('description').trim(), inclusion:form.get('inclusion').trim(), exclusion:form.get('exclusion').trim(), categoryId:form.get('categoryId') || null, parentId:form.get('parentId') || null, color:form.get('color') };
      if (id) p.codes[p.codes.findIndex(code => code.id === id)] = value;
      else p.codes.push(value);
      log(p, id ? 'Código actualizado' : 'Código creado', JSON.stringify(value));
    });
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
function resetView() { docId = undefined; selection = null; quoteFilter = ''; quoteDocumentFilter = ''; quoteSearch = ''; researchFilter = ''; documentSearch = ''; lastPrompt = ''; tab = 'documents'; }
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
function mapView() {
  const nodes = [...current.categories.map(c => ({...c,kind:'category'})), ...current.codes.map(c => ({...c,kind:'code'}))];
  if (!nodes.length) return empty('Conecta tu interpretación', 'Crea códigos y categorías en el libro. Aquí aparecerán como nodos vinculados a la evidencia.',button('go-book','Ir al libro de códigos','primary'));
  const edges = [
    ...current.codes.filter(c => c.categoryId).map(c => ({id:`cat-${c.id}`,source:c.id,target:c.categoryId,type:'es parte de', structural:true})),
    ...current.codes.filter(c => c.parentId).map(c => ({id:`parent-${c.id}`,source:c.id,target:c.parentId,type:'es subcódigo de',structural:true})),
    ...current.relations
  ];
  const categoryRows = Math.ceil(current.categories.length / 3);
  const positions = Object.fromEntries(nodes.map(n => {
    const index = n.kind === 'category' ? current.categories.findIndex(c => c.id === n.id) : current.codes.findIndex(c => c.id === n.id);
    const initial = { x: n.kind === 'category' && current.categories.length === 1 ? 440 : 70 + (index % 3) * 370, y: 65 + Math.floor(index / 3) * 190 + (n.kind === 'code' ? Math.max(1, categoryRows) * 230 : 0) };
    return [n.id, current.positions[n.id] || initial];
  }));
  const svgNodes = nodes.map(n => {
    const pos = positions[n.id]; const count = current.quotes.filter(q => q.codeIds.includes(n.id) || q.codeIds.some(id => findCode(id)?.categoryId === n.id)).length;
    const lines = wrap(n.name,27).slice(0,3);
    return `<g class="map-node" data-node="${n.id}" transform="translate(${pos.x} ${pos.y})" tabindex="0" role="button" aria-label="${e(n.name)}, ${count} citas. Enter para abrir citas." style="--code-color:${n.color}"><title>${e(n.name)}</title><rect width="280" height="100" rx="6" fill="${n.kind === 'category' ? '#eaf2f4' : '#ffffff'}" stroke="${n.color}" stroke-width="${n.kind === 'category' ? 2 : 1}"/><text x="16" y="21" class="node-kind">${n.kind === 'category' ? 'CATEGORÍA' : 'CÓDIGO'} · ${count} citas</text>${lines.map((line,i) => `<text x="16" y="${43+i*18}" class="node-name">${e(line)}</text>`).join('')}</g>`;
  }).join('');
  const maxY = Math.max(800,...Object.values(positions).map(p=>p.y+160));
  return `<div class="map-toolbar"><span><span class="line-key"></span> Jerarquía del libro <span class="line-key solid"></span> Relación interpretativa</span><div class="map-controls">${button('fit-map','Ajustar a pantalla','quiet')}<label>Zoom<select id="map-zoom"><option value="1" selected>100%</option><option value="0.75">75%</option><option value="0.5">50%</option><option value="1.25">125%</option></select></label></div><p>Arrastra los nodos. Doble clic o Enter para ver sus citas. Desplázate para recorrer mapas grandes.</p></div><div class="map-scroll"><svg id="relation-map" xmlns="http://www.w3.org/2000/svg" width="1600" height="${maxY}" viewBox="0 0 1600 ${maxY}" role="img" aria-label="Mapa de categorías y códigos"><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#607985"/></marker></defs>${edges.map((r,i) => `<g class="map-edge ${r.structural ? 'structural' : ''}" data-source="${r.source}" data-target="${r.target}" data-edge="${r.id}"><path id="edge-${i}" fill="none" stroke="${r.structural ? '#98adb5' : '#486572'}" ${r.structural ? 'stroke-dasharray="6 5"' : ''} stroke-width="1.5" marker-end="url(#arrow)"/><text class="edge-label" text-anchor="middle">${e(r.type)}</text></g>`).join('')}${svgNodes}</svg></div><div class="relationship-list"><h3>Relaciones interpretativas <span>${current.relations.length}</span></h3>${current.relations.map(r => `<article><div><strong>${e(findNode(r.source).name)}</strong> <span>${e(r.type)} →</span> <strong>${e(findNode(r.target).name)}</strong><p>${e(r.memo || 'Sin memo interpretativo')} · ${r.quoteIds.length} citas de respaldo</p></div>${button('edit-relation','Revisar','quiet',`data-id="${r.id}"`)}${button('delete-relation','Eliminar','quiet danger',`data-id="${r.id}"`)}</article>`).join('') || '<p class="muted">La jerarquía se muestra automáticamente. Añade relaciones interpretativas y respáldalas con citas o memos; una asociación no implica causalidad.</p>'}</div>`;
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
function setupMap() {
  const svg = document.querySelector('#relation-map');
  if (!svg) return;
  const positions = {};
  svg.querySelectorAll('[data-node]').forEach(node => {
    const transform = node.transform.baseVal.getItem(0).matrix;
    positions[node.dataset.node] = {x:transform.e,y:transform.f};
  });
  const updateEdges = () => svg.querySelectorAll('.map-edge').forEach(edge => {
    const a=positions[edge.dataset.source], b=positions[edge.dataset.target];
    const ax=a.x+140, ay=a.y+50, bx=b.x+140, by=b.y+50;
    const dx=bx-ax,dy=by-ay;
    const factor=1/Math.max(Math.abs(dx)/145,Math.abs(dy)/55,1);
    edge.querySelector('path').setAttribute('d',`M ${ax+dx*factor} ${ay+dy*factor} L ${bx-dx*factor} ${by-dy*factor}`);
    const x=(ax+bx)/2,y=(ay+by)/2-8;
    let angle=Math.atan2(dy,dx)*180/Math.PI;
    if(angle>90) angle-=180;
    if(angle<-90) angle+=180;
    edge.querySelector('text').setAttribute('transform',`translate(${x} ${y}) rotate(${angle})`);
  });
  updateEdges();
  document.querySelector('#map-zoom').addEventListener('change',event=>{
    if(event.target.value==='fit') { actions['fit-map'](); return; }
    const scale=Number(event.target.value);
    svg.setAttribute('width',String(svg.viewBox.baseVal.width*scale));
    svg.setAttribute('height',String(svg.viewBox.baseVal.height*scale));
  });
  svg.querySelectorAll('[data-node]').forEach(node => {
    let drag;
    node.addEventListener('pointerdown',event => {
      if (event.button !== 0) return;
      drag={x:event.clientX,y:event.clientY,start:{...positions[node.dataset.node]},moved:false};
      node.setPointerCapture(event.pointerId);
    });
    node.addEventListener('pointermove',event => {
      if (!drag) return;
      const scale=svg.viewBox.baseVal.width/svg.getBoundingClientRect().width;
      const x=Math.max(0,Math.min(1320,drag.start.x+(event.clientX-drag.x)*scale));
      const y=Math.max(0,Math.min(1100,drag.start.y+(event.clientY-drag.y)*scale));
      if (Math.abs(event.clientX-drag.x)+Math.abs(event.clientY-drag.y)>4) drag.moved=true;
      positions[node.dataset.node]={x,y};
      node.setAttribute('transform',`translate(${x} ${y})`); updateEdges();
    });
    const finish = async () => {
      if (!drag) return;
      const moved=drag.moved; drag=null;
      if (!moved) return;
      try { await mutate(p => { p.positions[node.dataset.node]=positions[node.dataset.node]; log(p,'Nodo reubicado',node.dataset.node); }); }
      catch(error) { report(error); render(); }
    };
    node.addEventListener('pointerup',finish);
    node.addEventListener('pointercancel',() => { drag=null; render(); });
    const inspect = () => {
      const id=node.dataset.node;
      if (findCode(id)) { quoteFilter=id; tab='quotes'; render(); }
      else {
        const codes=current.codes.filter(c=>c.categoryId===id).map(c=>c.id);
        const quotes=current.quotes.filter(q=>q.codeIds.some(id=>codes.includes(id)));
        modal('Evidencia de la categoría',quotes.map(q=>`<blockquote>${e(q.text)}</blockquote><p class="muted">${e(location(current,q))}</p>`).join('') || '<p>Todavía no hay citas vinculadas a esta categoría.</p>',async()=>{},'Cerrar');
      }
    };
    node.addEventListener('dblclick',inspect);
    node.addEventListener('keydown',event => { if(event.key==='Enter') inspect(); });
  });
}
function relationDialog(id) {
  const r=current.relations.find(r=>r.id===id) || {source:'',target:'',type:relationTypes[0],memo:'',quoteIds:[]};
  const nodes=[...current.categories.map(c=>({...c,name:`Categoría: ${c.name}`})),...current.codes.map(c=>({...c,name:`Código: ${c.name}`}))];
  if(nodes.length<2) throw new Error('Crea al menos dos códigos o categorías antes de relacionarlos.');
  modal(id ? 'Revisar relación' : 'Nueva relación',`<div class="form-grid"><label>Desde<select name="source" required>${options(nodes,r.source,'Seleccionar origen')}</select></label><label>Hacia<select name="target" required>${options(nodes,r.target,'Seleccionar destino')}</select></label></div><label>Relación dirigida<select name="type">${relationTypes.map(type=>`<option ${r.type===type?'selected':''}>${e(type)}</option>`).join('')}</select></label>${textarea('Memo / fundamento interpretativo','memo',r.memo)}<fieldset><legend>Citas de respaldo</legend>${checklist('quoteIds',current.quotes.map(q=>({id:q.id,name:`${location(current,q)}: ${q.text.slice(0,130)}`})),r.quoteIds)}</fieldset><p class="muted">La dirección es origen → destino. «Es causa de» exige una justificación interpretativa explícita; no se deriva de la coocurrencia.</p>`,async form=>{
    if(form.get('source')===form.get('target')) throw new Error('Elige dos nodos diferentes.');
    if(!form.get('memo').trim() && !form.getAll('quoteIds').length) throw new Error('Añade al menos una cita de respaldo o un memo interpretativo.');
    if(form.get('type')==='es causa de' && !form.get('memo').trim()) throw new Error('Explicita en el memo el fundamento de la relación causal.');
    await mutate(p=>{
      const value={id:id||uid(),source:form.get('source'),target:form.get('target'),type:form.get('type'),memo:form.get('memo').trim(),quoteIds:form.getAll('quoteIds')};
      if(id) p.relations[p.relations.findIndex(r=>r.id===id)]=value; else p.relations.push(value);
      log(p,id?'Relación revisada':'Relación creada',JSON.stringify(value));
    });
  });
}
function promptsView() {
  return `<div class="prompt-layout"><form id="prompt-form" class="prompt-config"><fieldset><legend>Preguntas / objetivos autorizados para esta solicitud</legend>${checklist('researchQuestionIds',researchItems())}</fieldset><p class="muted">El banco completo permanece fuera del prompt. Selecciona uno o varios elementos; si eliges varios, los resultados se pedirán separados. Administra el banco en Ajustes.</p>${textarea('Consulta focalizada (opcional si seleccionas preguntas)','question',activeResearch().length?'':current.question,3)}<div class="form-grid"><label>Modalidad<select name="mode"><option>Inductiva</option><option>Deductiva</option><option>Mixta</option></select></label><label>Operación<select name="operation" id="prompt-operation"><option>Codificar</option><option>Proponer subcódigos</option><option>Proponer categorías mayores</option><option>Comparar o fusionar códigos</option></select></label></div>
    <label>Material autorizado<select name="scope" id="prompt-scope"><option value="selection" ${selection?'selected':''}>Fragmento seleccionado en Documentos</option><option value="documents" ${!selection?'selected':''}>Documentos elegidos explícitamente</option><option value="quotes">Citas previamente codificadas</option></select></label>
    <div id="scope-selection" class="scope-panel"><p>${selection ? `${e(current.documents.find(d=>d.id===selection.documentId)?.name)} · ${selection.end-selection.start} caracteres` : 'Sin selección. Ve a Documentos y selecciona el fragmento antes de volver aquí.'}</p></div>
    <div id="scope-documents" class="scope-panel"><p class="muted">Ningún documento se incluye por defecto. Elegir un documento incluye todos sus párrafos.</p>${checklist('documentIds',current.documents)}</div>
    <div id="scope-quotes" class="scope-panel"><label>Mostrar citas de un código<select id="prompt-code-filter">${options(current.codes,'','Todos')}</select></label>${checklist('quoteIds',current.quotes.map(q=>({id:q.id,name:`${location(current,q)}: ${q.text.slice(0,150)}`})))}</div>
    <details><summary>Libro de códigos incluido en el prompt</summary><p class="muted">Incluye solo lo pertinente. En deductiva debes seleccionar al menos un código.</p>${checklist('codeIds',current.codes)}</details>
    <label>Máximo de códigos nuevos propuestos<input type="number" name="budget" value="5" min="0" max="50" required></label><p class="muted">Límite de revisión, no cuota metodológica. Se permiten cero propuestas. En deductiva no se autoriza crear códigos.</p><button class="primary full" type="submit">Preparar prompt y guardar solicitud</button>
    </form><div class="prompt-output"><div class="output-heading"><h3>Paquete para un chat externo</h3>${button('copy-prompt','Copiar', '',lastPrompt?'':'disabled')}${button('download-prompt','↓ TXT','quiet',lastPrompt?'':'disabled')}</div><p class="privacy-note">${cloudMode ? 'El paquete se archiva en tu Drive, pero no se envía a ninguna IA.' : 'Preparar no envía nada.'} Revisa y anonimiza antes de copiar. Una suscripción de chat no equivale a una API privada.</p><label><span class="sr-only">Prompt generado</span><textarea id="prompt-output" readonly placeholder="Tu solicitud aparecerá aquí, con evidencia y localizadores.">${e(lastPrompt)}</textarea></label><p id="prompt-size" class="muted">${lastPrompt ? `${lastPrompt.length.toLocaleString('es-CL')} caracteres · no es un conteo de tokens` : 'No se ha preparado ninguna solicitud en esta sesión.'}</p><details><summary>Solicitudes guardadas (${current.prompts.length})</summary>${current.prompts.slice().reverse().map(r=>`<div class="prompt-record"><strong>${e(r.question)}</strong><small>${new Date(r.createdAt).toLocaleString('es-CL')} · ${e(r.operation)} · ${e(r.mode)}</small>${button('load-prompt','Abrir paquete','quiet',`data-id="${r.id}"`)}</div>`).join('') || '<p class="muted">Las solicitudes guardan una copia exacta del prompt y del material enviado.</p>'}</details></div></div>`;
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
      const config={question:f.get('question').trim(),researchQuestionIds:f.getAll('researchQuestionIds'),mode:f.get('mode'),operation:f.get('operation'),scope:f.get('scope'),budget:Number(f.get('budget')),codeIds:f.getAll('codeIds'),documentIds:f.getAll('documentIds'),quoteIds:f.getAll('quoteIds'),selection};
      const text=promptText(current,config);
      const record={id:uid(),createdAt:now(),question:config.question||activeResearch().filter(q=>config.researchQuestionIds.includes(q.id)).map(q=>q.text).join(' / '),researchQuestionIds:config.researchQuestionIds,mode:config.mode,operation:config.operation,scope:config.scope,text};
      await mutate(p=>{p.prompts.push(record);log(p,'Prompt preparado',JSON.stringify({id:record.id,question:record.question,scope:record.scope}));});
      lastPrompt=text; render(); notify('Prompt preparado y guardado. No se envió nada a una IA.');
    } catch(error) {report(error);}
  });
}
function historyView() {
  return `<div class="history-list"><p class="muted">Las acciones se registran con la hora del equipo. Los respaldos JSON incluyen la bitácora completa.</p>${current.history.slice().reverse().map(h=>`<article><time datetime="${e(h.at)}">${e(new Date(h.at).toLocaleString('es-CL'))}</time><div><strong>${e(h.action)}</strong><p>${e(h.detail)}</p></div></article>`).join('') || empty('Sin cambios todavía','Las acciones del proyecto aparecerán aquí.')}</div>`;
}
function help() {
  if(cloudMode) {
    modal('Guía de la instalación privada', `<div class="help"><h3>Drive es el almacenamiento principal</h3><p>Cada guardado confirmado crea un archivo JSON completo e inmutable. La hoja Proyectos apunta a la versión vigente. Los documentos importados también conservan su original en Drive. No compartas la carpeta, la hoja ni los archivos.</p><h3>Sheets es un índice, no el editor</h3><p>En «Drive, índices y versiones», actualiza los índices después de trabajar. Las pestañas Documentos, Categorias, Codigos, Citas, Relaciones y Bitacora son proyecciones regenerables. No edites Proyectos ni uses las hojas para cambiar la codificación.</p><h3>Recuperación y conflictos</h3><p>Si falla una conexión, el intento completo queda en este navegador. En Recuperación local puedes descargarlo, reintentarlo con el mismo identificador o guardarlo como proyecto nuevo. Un conflicto nunca sobrescribe silenciosamente otro equipo. Antes de cerrar, espera la confirmación de Drive.</p><h3>Versiones</h3><p>Descarga versiones anteriores desde «Drive, índices y versiones». Para revisarlas sin reemplazar el proyecto actual, restáuralas como copias independientes. También puedes conservar respaldos JSON fuera de Google.</p><h3>Análisis y prompts</h3><p>El flujo de códigos, categorías, citas, memos, matriz código × documento, fases temáticas, mapas e insertos funciona como en la versión local. La matriz describe recuentos, no importancia ni prevalencia. Las fases guardan notas y vínculos a evidencia; no evalúan ni automatizan el análisis. Los prompts se archivan en Drive, sin enviarse a una IA. Revisa anonimización y consentimientos antes de copiarlos a un chat.</p><h3>Límites</h3><p>Solo PC. Máximo 8 MB de JSON por proyecto y 8 MB por archivo original. Las cuotas de Google pueden interrumpir operaciones. Las versiones consumen espacio y no se purgan automáticamente. Es una instalación personal, no un sistema colaborativo. Las copias pendientes del navegador y los JSON descargados no están cifrados por Trama.</p></div>`,async()=>{},'Entendido');
    return;
  }
  modal('Guía de uso y privacidad',`<div class="help"><h3>1. Prepara tu corpus</h3><p>Crea un proyecto por estudio. Importa TXT UTF-8, DOCX o pega texto. Se conserva el texto extraído, no el archivo Word original, sus páginas, imágenes ni tablas como estructura. Revisa siempre la importación.</p><h3>2. Codifica manualmente</h3><p>Crea códigos y categorías en el libro. En Documentos, selecciona texto y asigna uno o varios códigos. Usa memos para registrar interpretaciones. Puedes definir códigos padres y criterios deductivos.</p><h3>3. Explora la matriz</h3><p>La matriz código × documento cuenta citas por código y entrevista. Una celda abre sus citas para revisar la evidencia. Los recuentos no equivalen a importancia ni prevalencia; puedes exportarlos a CSV.</p><h3>4. Registra el análisis temático</h3><p>En Análisis temático, agrega notas y citas de respaldo a cada una de las seis fases de Braun y Clarke. Es una guía flexible que no evalúa ni automatiza tu análisis.</p><h3>5. Recupera evidencia</h3><p>En Citas, filtra por código o entrevista, revisa memos y usa «Ver en contexto». Las exportaciones CSV y los insertos HTML respetan el filtro actual. El HTML se abre en Word o permite imprimir a PDF.</p><h3>6. Conecta conceptos</h3><p>El mapa incluye jerarquías del libro y relaciones dirigidas. Arrastra nodos; usa doble clic o Enter para consultar evidencia. Añade memos o citas al fundamentar relaciones. Exporta SVG para informes.</p><h3>7. Prepara prompts sin API</h3><p>Selecciona una pregunta y alcance. Para desglosar usa citas codificadas, no todo el corpus. El paquete se guarda exactamente como fue generado. Copia manualmente al chat que elijas. Las respuestas externas se revisan y registran manualmente: no hay importación automática ni codificación por IA.</p><h3>Respaldo y límites</h3><p>Los proyectos usan IndexedDB, en este navegador y dirección web. No se sincronizan. El modo privado, borrar datos del sitio o cambiar de dispositivo puede hacerlos inaccesibles. Descarga JSON regularmente. Restaurar crea una copia independiente; no sobrescribe proyectos.</p><p>La app no transmite entrevistas ni incorpora analítica. GitHub aloja el código y recibe las peticiones normales de acceso al sitio. Un chat externo tiene sus propias condiciones: anonimiza y verifica consentimientos antes de copiar. La app no cifra los datos locales ni sustituye un protocolo de resguardo.</p><p>No importa proyectos propietarios de ATLAS.ti, PDF escaneado, audio ni video. No es una réplica ni está afiliada a ATLAS.ti.</p></div>`,async()=>{},'Entendido');
}
async function restore() {
  const [file]=await chooseFiles('.json');
  if(!file) return;
  if(file.size>100*1024*1024) throw new Error('El respaldo supera 100 MB. Divide el proyecto antes de importarlo.');
  let restored;
  try {restored=validateProject(JSON.parse(await file.text()));}
  catch {throw new Error('El archivo no es un respaldo válido de Trama versión 1. No se modificaron los proyectos.');}
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
const actions = {
  'home':()=>{current=undefined;welcome();},
  'resume':()=>{current=projects[0];resetView();render();},
  'new-project':()=>projectDialog(), 'edit-project':()=>projectDialog(true),
  'demo':async()=>{const p=demoProject();const saved=await saveProject(p);projects.push(saved);current=saved;resetView();render();},
  'close-dialog':()=>dialog.close(),
  'import-document':importDocument, 'paste-document':pasteDocument,
  'select-document':id=>{docId=id;selection=null;documentSearch='';render();},
  'new-code':()=>codeDialog(), 'edit-code':codeDialog,
  'new-category':()=>categoryDialog(), 'edit-category':categoryDialog,
  'go-documents':()=>{tab='documents';render();},'go-book':()=>{tab='book';render();},
  'code-quotes':id=>{quoteFilter=id;quoteDocumentFilter='';quoteSearch='';tab='quotes';render();},
  'matrix-cell':(_,target)=>{quoteFilter=target.dataset.code;quoteDocumentFilter=target.dataset.document;quoteSearch='';tab='quotes';render();},
  'edit-thematic-phase':thematicPhaseDialog,
  'source':showSource,'edit-quote':editQuote,
  'delete-quote':id=>modal('Eliminar cita', '<p>Se eliminará esta cita y sus vínculos de respaldo en relaciones y fases temáticas. El texto fuente y los códigos permanecerán. Esta acción no tiene deshacer.</p>',async()=>{await mutate(p=>{p.quotes=p.quotes.filter(q=>q.id!==id);p.relations.forEach(r=>{r.quoteIds=r.quoteIds.filter(q=>q!==id);});Object.values(p.thematicAnalysis || {}).forEach(phase=>{phase.quoteIds=phase.quoteIds.filter(q=>q!==id);});log(p,'Cita eliminada',id);});},'Eliminar cita'),
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
  'export-matrix':()=>{const matrix=codeDocumentMatrix(current);download(`${fileName(current.name)}-matriz-codigo-documento.csv`,csv([['ID código','Código',...current.documents.map(doc=>doc.name)],...current.codes.map(code=>[code.id,codePath(current,code.id),...current.documents.map(doc=>matrix[code.id][doc.id])])]),'text/csv;charset=utf-8');},
  'export-quotes':()=>download(`${fileName(current.name)}-matriz.csv`,csv([['Proyecto','Categoría → código','ID código','ID cita','Cita literal','Origen','Memo','Preguntas / objetivos'],...exportRows()]),'text/csv;charset=utf-8'),
  'export-report':exportReport,
  'new-relation':()=>relationDialog(), 'edit-relation':relationDialog,
  'delete-relation':id=>modal('Eliminar relación','<p>Se eliminará solo esta relación interpretativa. Sus códigos y citas permanecerán.</p>',async()=>{await mutate(p=>{p.relations=p.relations.filter(r=>r.id!==id);log(p,'Relación eliminada',id);});},'Eliminar relación'),
  'export-map':()=>{const svg=document.querySelector('#relation-map');if(!svg)throw new Error('Primero crea códigos para generar el mapa.');const clone=svg.cloneNode(true);clone.querySelectorAll('text').forEach(text=>{text.setAttribute('font-family','Arial, sans-serif');text.setAttribute('font-size',text.classList.contains('edge-label')?'12':'14');text.setAttribute('fill','#172d3a');});download(`${fileName(current.name)}-mapa.svg`,new XMLSerializer().serializeToString(clone),'image/svg+xml');},
  'fit-map':()=>{const svg=document.querySelector('#relation-map');if(!svg)return;const nodes=[...svg.querySelectorAll('[data-node]')];const width=Math.max(...nodes.map(node=>node.transform.baseVal.getItem(0).matrix.e+310));const height=Math.max(...nodes.map(node=>node.transform.baseVal.getItem(0).matrix.f+140));svg.setAttribute('viewBox',`0 0 ${Math.max(500,width)} ${Math.max(400,height)}`);svg.setAttribute('width',String(document.querySelector('.map-scroll').clientWidth));svg.setAttribute('height',String(document.querySelector('.map-scroll').clientWidth*svg.viewBox.baseVal.height/svg.viewBox.baseVal.width));const zoom=document.querySelector('#map-zoom');if(!zoom.querySelector('[value=fit]'))zoom.add(new Option('Ajustado','fit',false,true));zoom.value='fit';},
  'copy-prompt':async()=>{try{await navigator.clipboard.writeText(lastPrompt);notify('Prompt copiado. Revisa los datos antes de enviarlos a un chat.');}catch{throw new Error('El navegador no permitió copiar. Selecciona el texto del paquete y cópialo manualmente, o descarga TXT.');}},
  'download-prompt':()=>download(`${fileName(current.name)}-prompt.txt`,lastPrompt),
  'load-prompt':id=>{lastPrompt=current.prompts.find(p=>p.id===id).text;render();},
};
document.addEventListener('click',async event=>{
  const target=event.target.closest('[data-action], [data-tab]');
  if(!target) return;
  if(target.matches('a')) event.preventDefault();
  try {
    if(saving) throw new Error('Espera a que termine el guardado antes de cambiar de tarea.');
    if(target.dataset.tab) {tab=target.dataset.tab;render();window.scrollTo(0,0);return;}
    await actions[target.dataset.action]?.(target.dataset.id,target);
  } catch(error) {report(error);}
});
document.addEventListener('change',event=>{
  if(event.target.id==='project-select') {current=projects.find(p=>p.id===event.target.value);resetView();render();}
  if(event.target.id==='quote-filter') {quoteFilter=event.target.value;render();}
  if(event.target.id==='quote-document-filter') {quoteDocumentFilter=event.target.value;render();}
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
