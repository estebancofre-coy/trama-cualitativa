import test from 'node:test';
import assert from 'node:assert/strict';
import { project, demoProject, validateProject, addQuote, paragraphs, location, codePath, promptText, promptManifest, exportPrompt, stageExternalResults, decideExternalResult, verifyExternalProposal, csv, escapeHTML, updateResearchBank, mapScopeNodes, mapScopeLabel } from '../src/domain.js';
import { autoLayout, mapLayouts, scopedEdges, edgeGeometry } from '../src/map-layout.js';

function config(p, overrides = {}) {
  return { question:'¿Cómo coordinan?',mode:'Inductiva',operation:'Codificar',scope:'quotes',budget:5,codeIds:p.codes.map(c=>c.id),quoteIds:[p.quotes[0].id],documentIds:[], ...overrides };
}
test('new project and synthetic example validate and survive JSON round trip',()=>{
  assert.equal(validateProject(project('Estudio')).name,'Estudio');
  const p=demoProject();
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))),p);
  assert.equal(p.quotes.length,2);
});
test('literal spans and paragraph locations remain linked after category changes',()=>{
  const p=demoProject(),q=p.quotes[0];
  assert.equal(p.documents[0].text.slice(q.start,q.end),q.text);
  assert.match(location(p,q),/párr\. 2/);
  p.categories[0].name='Condiciones';
  assert.match(codePath(p,q.codeIds[0]),/^Condiciones →/);
  assert.equal(q.text,p.documents[0].text.slice(q.start,q.end));
});
test('deduplicates exact quotes, merges code assignments, and preserves memo',()=>{
  const p=demoProject(),q=p.quotes[0];
  addQuote(p,q.documentId,q.start,q.end,[p.codes[1].id],'Nota adicional');
  assert.equal(p.quotes.length,2);
  assert.equal(q.codeIds.length,2);
  assert.match(q.memo,/Nota adicional/);
  assert.throws(()=>addQuote(p,q.documentId,-1,q.end,[p.codes[0].id]));
  assert.throws(()=>addQuote(p,q.documentId,0,10,[]));
});
test('paragraph offsets retain whitespace and empty lines',()=>{
  const doc={id:'d',text:'Primero\n\n  Segundo.\nTercero'};
  const parts=paragraphs(doc);
  assert.equal(parts.length,3);
  assert.equal(parts[1].start,9);
  for(const part of parts) assert.equal(doc.text.slice(part.start,part.end),part.text);
});
test('scoped prompts contain selected evidence and never unrelated content',()=>{
  const p=demoProject();
  const text=promptText(p,config(p));
  assert.ok(text.includes(p.quotes[0].text));
  assert.ok(!text.includes(p.quotes[1].text));
  assert.match(text,/Máximo de códigos NUEVOS propuestos: 5/);
  assert.match(text,/PENDIENTES/);
  assert.throws(()=>promptText(p,config(p,{quoteIds:[]})),/Selecciona/);
  assert.throws(()=>promptText(p,config(p,{question:' '})),/pregunta/);
});
test('document and literal selection scopes do not include other documents',()=>{
  const p=demoProject();
  p.documents.push({id:'outside',name:'Otro',text:'SECRETO FUERA DEL ALCANCE',createdAt:new Date().toISOString()});
  const text=promptText(p,config(p,{scope:'documents',documentIds:[p.documents[0].id]}));
  assert.ok(!text.includes('SECRETO'));
  const q=p.quotes[0];
  const selection=promptText(p,config(p,{scope:'selection',selection:{documentId:q.documentId,start:q.start,end:q.end}}));
  assert.ok(selection.includes(q.text));
  assert.ok(!selection.includes(p.quotes[1].text));
  assert.throws(()=>promptText(p,config(p,{scope:'selection',selection:{documentId:q.documentId,start:-1,end:30}})));
});
test('deductive and followup safeguards are enforced',()=>{
  const p=demoProject();
  assert.throws(()=>promptText(p,config(p,{mode:'Deductiva',codeIds:[]})),/deductiva/);
  assert.throws(()=>promptText(p,config(p,{operation:'Proponer subcódigos',scope:'documents',documentIds:[p.documents[0].id]})),/citas/);
  assert.match(promptText(p,config(p,{mode:'Deductiva'})),/aplica exclusivamente/);
  assert.throws(()=>promptText(p,config(p,{budget:51})),/entre 0 y 50/);
});
test('backup validation rejects broken spans, missing links, duplicate IDs and cycles',()=>{
  for(const change of [
    p=>{p.quotes[0].text='inventada';},
    p=>{p.quotes[0].codeIds=['missing'];},
    p=>{p.quotes[0].end=1e9;},
    p=>{p.codes[0].parentId=p.codes[0].id;},
    p=>{p.codes[0].parentId=p.codes[1].id;p.codes[1].parentId=p.codes[0].id;},
    p=>{p.codes[0].color='red; background:url(x)';},
    p=>{p.relations[0].source='missing';},
    p=>{p.relations[0].quoteIds=['missing'];},
    p=>{p.codes[1].id=p.codes[0].id;},
    p=>{p.codes[0].categoryId='missing';},
    p=>{p.positions[p.codes[0].id]={x:Infinity,y:1};},
    p=>{p.schemaVersion=2;},
    p=>{p.codes[0].id='"><img src=x>';},
  ]) {
    const p=demoProject();change(p);assert.throws(()=>validateProject(p));
  }
});
test('project backups accept bounded custom relationship labels',()=>{
  const p=demoProject();
  p.relations[0].type='favorece bajo ciertas condiciones';
  assert.equal(validateProject(p),p);
  p.relations[0].type='x'.repeat(121);
  assert.throws(()=>validateProject(p));
});
test('saved maps retain independent scopes and layouts through backup restoration',()=>{
  const p=demoProject();
  const category=p.categories[0], code=p.codes[0];
  const stamp=p.createdAt;
  p.savedMaps=[
    {id:'map-a',name:'Primero',scope:{type:'category',id:category.id},positions:{[code.id]:{x:80,y:200}},createdAt:stamp,updatedAt:stamp},
    {id:'map-b',name:'Segundo',scope:{type:'category',id:category.id},positions:{[code.id]:{x:500,y:300}},createdAt:stamp,updatedAt:stamp},
  ];
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))),p);
  for(const change of [
    copy=>{copy.savedMaps[0].scope.id='missing';},
    copy=>{copy.savedMaps[0].scope.type='invalid';},
    copy=>{copy.savedMaps[0].positions[code.id].x=Infinity;},
    copy=>{copy.savedMaps[0].mapLayout={mode:'unknown',routing:'straight',routes:{}};},
    copy=>{copy.savedMaps[1].id='map-a';},
    copy=>{copy.savedMaps[0].id=code.id;},
    copy=>{copy.savedMaps[0].name=' ';},
  ]) {
    const copy=structuredClone(p);change(copy);assert.throws(()=>validateProject(copy));
  }
  delete p.savedMaps;
  assert.equal(validateProject(p),p);
});
test('map scopes exclude unrelated categories and codes but retain linked research evidence',()=>{
  const p=demoProject();
  const category=p.categories[0];
  p.categories.push({...category,id:'other-category',name:'Otra'});
  p.codes.push({...p.codes[0],id:'other-code',categoryId:'other-category'});
  const scope={type:'category',id:category.id};
  assert.deepEqual(mapScopeNodes(p,scope).map(n=>n.id),[category.id,p.codes[0].id,p.codes[1].id]);
  assert.equal(mapScopeLabel(p,scope),`Categoría: ${category.name}`);
  p.researchQuestions=[{id:'question',kind:'Pregunta',text:'¿Cómo coordinan?',archived:false}];
  p.quotes[0].researchQuestionIds=['question'];
  const research={type:'research',id:'question'};
  const nodes=mapScopeNodes(p,research);
  assert.deepEqual(nodes.map(n=>n.id),[category.id,p.codes[0].id]);
  const edges=scopedEdges(p,new Set(nodes.map(n=>n.id)));
  assert.ok(edges.every(edge=>nodes.some(n=>n.id===edge.source)&&nodes.some(n=>n.id===edge.target)));
  assert.equal(edges.filter(edge=>!edge.structural).length,0);
  p.researchQuestions[0].archived=true;
  assert.match(mapScopeLabel(p,research),/archivada/);
  assert.deepEqual(mapScopeNodes(p,research),nodes);
  p.quotes[0].researchQuestionIds=[];
  assert.deepEqual(mapScopeNodes(p,research),[]);
  assert.throws(()=>mapScopeNodes(p,{type:'category',id:'missing'}));
  assert.throws(()=>mapScopeNodes(p,{type:'research',id:'missing'}));
});
test('CSV export prevents formula execution and HTML escapes untrusted content',()=>{
  const output=csv([['=HYPERLINK("x")',' +SUM(A1)','Normal;con separador','línea\nnueva']]);
  assert.ok(output.startsWith('\uFEFF'));
  assert.match(output,/'=HYPERLINK/);
  assert.match(output,/' \+SUM/);
  assert.equal(escapeHTML('<script>"&'), '&lt;script&gt;&quot;&amp;');
});
test('research bank scopes selected questions without including the rest or broad project goal',()=>{
  const p=demoProject();
  p.question='CONTEXTO GENERAL QUE NO SE DEBE ENVIAR';
  updateResearchBank(p,'¿Qué barreras existen?\nPREGUNTA EXCLUIDA DEL ANÁLISIS','Caracterizar apoyos');
  const question=p.researchQuestions[0],objective=p.researchQuestions[2];
  const text=promptText(p,config(p,{question:'',researchQuestionIds:[question.id,objective.id]}));
  assert.ok(text.includes(question.text));
  assert.ok(text.includes(objective.text));
  assert.ok(!text.includes('PREGUNTA EXCLUIDA'));
  assert.ok(!text.includes('CONTEXTO GENERAL'));
  assert.match(text,/GLOBAL para toda esta solicitud/);
  assert.match(text,/separa los hallazgos por sus IDs/);
  assert.throws(()=>promptText(p,config(p,{researchQuestionIds:['missing']})),/no está disponible/);
});
test('research bank edits archive old definitions and preserve citation references',()=>{
  const p=demoProject();
  updateResearchBank(p,'Pregunta original\nPregunta estable','');
  const original=p.researchQuestions[0],stable=p.researchQuestions[1];
  const q=p.quotes[0];
  addQuote(p,q.documentId,q.start,q.end,q.codeIds,'',[original.id]);
  updateResearchBank(p,'Pregunta reformulada\nPregunta estable','Objetivo nuevo');
  assert.equal(p.researchQuestions.find(r=>r.id===original.id).archived,true);
  assert.equal(p.researchQuestions.find(r=>r.text==='Pregunta estable').id,stable.id);
  assert.ok(q.researchQuestionIds.includes(original.id));
  validateProject(p);
  assert.throws(()=>promptText(p,config(p,{researchQuestionIds:[original.id]})),/no está disponible/);
  assert.throws(()=>updateResearchBank(p,'Duplicada\nduplicada',''),/duplicados/);
});
test('legacy backups without research bank still validate and can be extended',()=>{
  const p=demoProject();delete p.researchQuestions;
  for(const q of p.quotes) delete q.researchQuestionIds;
  validateProject(p);
  updateResearchBank(p,'Pregunta nueva','');
  validateProject(p);
});
function externalFixture(overrides = {}) {
  const p = demoProject();
  const settings = config(p,{requestId:'request-1',externalMaterial:true,documentIds:[p.documents[0].id],...overrides});
  const record = {id:settings.requestId,createdAt:new Date().toISOString(),question:settings.question,mode:settings.mode,operation:settings.operation,scope:settings.scope,text:promptText(p,settings),manifest:promptManifest(p,settings)};
  p.prompts.push(record);
  const proposal = {id:'proposal-1',documentId:p.quotes[0].documentId,text:p.quotes[0].text,code:{existingId:p.codes[0].id},researchQuestionIds:[],memo:'Fundamento externo'};
  const encode = proposals => JSON.stringify({schemaVersion:1,projectId:p.id,promptId:record.id,proposals});
  return {p,record,proposal,encode};
}
test('external prompts export JSON TXT and Markdown without corpus in every scope',()=>{
  const {p,record} = externalFixture();
  for (const scope of ['quotes','documents','selection']) {
    const settings = config(p,{requestId:record.id,externalMaterial:true,scope,documentIds:[p.documents[0].id],selection:{documentId:p.quotes[0].documentId,start:p.quotes[0].start,end:p.quotes[0].end}});
    record.text = promptText(p,settings);
    for (const format of ['json','txt','md']) {
      const output = exportPrompt(record,format);
      for (const quote of p.quotes) assert.ok(!output.includes(quote.text));
      assert.ok(output.includes(p.documents[0].id));
    }
    assert.equal(JSON.parse(exportPrompt(record,'json')).promptId,record.id);
    assert.match(record.text,/exclusivamente JSON válido/);
    assert.ok(!record.text.includes('B. Tabla:'));
  }
  assert.throws(()=>exportPrompt(record,'html'));
});
test('JSON results stay pending, accept or reject individually, and survive backups',()=>{
  const {p,proposal,encode} = externalFixture();
  const batch = stageExternalResults(p,encode([proposal,{...proposal,id:'bad',text:'Cita inventada'}]));
  p.externalReviews = [batch];
  assert.deepEqual(batch.items.map(item=>item.status),['pending','invalid']);
  assert.equal(p.quotes.length,2);
  decideExternalResult(p,batch.id,batch.items[0].id,true);
  decideExternalResult(p,batch.id,batch.items[1].id,false);
  assert.deepEqual(batch.items.map(item=>item.status),['accepted','rejected']);
  assert.equal(p.quotes.length,2);
  assert.match(p.quotes[0].memo,/Fundamento externo/);
  validateProject(JSON.parse(JSON.stringify(p)));
  assert.throws(()=>decideExternalResult(p,batch.id,batch.items[0].id,true),/resuelta/);
  assert.throws(()=>stageExternalResults(p,encode([proposal])),/anteriormente/);
});
test('JSON contract rejects Markdown, foreign requests, malformed entries and duplicate IDs',()=>{
  const {p,proposal,encode} = externalFixture();
  for (const text of ['```json\n{}\n```','null',JSON.stringify({schemaVersion:1,projectId:'foreign',promptId:'request-1',proposals:[]}),encode([proposal,proposal]),encode([null])]) assert.throws(()=>stageExternalResults(p,text));
  assert.throws(()=>stageExternalResults(p,encode([proposal]).replace('request-1','missing')),/prompt/);
});
test('literal verification blocks ambiguous matches and wrong offsets, codes and research scope',()=>{
  const {p,record,proposal} = externalFixture({scope:'documents'});
  record.manifest.ranges = [{documentId:p.documents[0].id,start:0,end:p.documents[0].text.length}];
  for (const changed of [
    {...proposal,documentId:'missing'},
    {...proposal,text:p.quotes[0].text.toUpperCase()},
    {...proposal,start:0,end:proposal.text.length},
    {...proposal,code:{existingId:'missing'}},
    {...proposal,researchQuestionIds:['missing']},
  ]) assert.throws(()=>verifyExternalProposal(p,record,changed));
  proposal.text = 'equipo';
  assert.throws(()=>verifyExternalProposal(p,record,proposal),/ambigua/);
  proposal.start = p.documents[0].text.indexOf(proposal.text); proposal.end = proposal.start + proposal.text.length;
  assert.equal(verifyExternalProposal(p,record,proposal).start,proposal.start);
});
test('new codes respect deductive restrictions and global budget across imports',()=>{
  const {p,record,proposal,encode} = externalFixture({budget:1});
  const newCode = {name:'Apoyo informal',description:'Apoyo entre personas',inclusion:'Contacto personal',exclusion:'Convenios'};
  proposal.code = newCode;
  const batch = stageExternalResults(p,encode([proposal,{...proposal,id:'proposal-2',code:{...newCode,name:'Otro código'}}]));
  p.externalReviews = [batch];
  decideExternalResult(p,batch.id,batch.items[0].id,true);
  assert.equal(p.codes.length,3);
  assert.throws(()=>decideExternalResult(p,batch.id,batch.items[1].id,true),/máximo global/);
  assert.throws(()=>verifyExternalProposal(p,record,{...proposal,code:{...newCode,name:p.codes[0].name}}),/conflicto/);
  const another = stageExternalResults(p,encode([{...proposal,id:'proposal-3'}]));
  p.externalReviews.push(another);
  decideExternalResult(p,another.id,another.items[0].id,true);
  assert.equal(p.codes.length,3);
  record.manifest.mode = 'Deductiva';
  assert.throws(()=>verifyExternalProposal(p,record,proposal),/no autoriza/);
  validateProject(p);
});
test('automatic layouts preserve all nodes, relations and evidence with non-overlapping positions',async()=>{
  const p=demoProject();
  const original=structuredClone({codes:p.codes,categories:p.categories,quotes:p.quotes,relations:p.relations});
  const nodes=[...p.categories,...p.codes];
  const nodeIds=new Set(nodes.map(n=>n.id));
  const edges=scopedEdges(p,nodeIds);
  for (const preset of mapLayouts) {
    const result=await autoLayout(nodes,edges,preset.id);
    p.positions=result.positions;p.mapLayout=result.mapLayout;
    validateProject(JSON.parse(JSON.stringify(p)));
    assert.deepEqual({codes:p.codes,categories:p.categories,quotes:p.quotes,relations:p.relations},original);
    const positions=Object.values(result.positions);
    assert.equal(positions.length,3);
    for (let index=0;index<positions.length;index++) for (const other of positions.slice(index+1)) {
      const pos=positions[index];
      assert.ok(pos.x+280<=other.x || other.x+280<=pos.x || pos.y+100<=other.y || other.y+100<=pos.y,`${preset.name}: nodos solapados`);
    }
    for (const edge of edges) assert.ok(result.mapLayout.routes[edge.id],`Ruta ausente: ${edge.id}`);
    if(preset.id==='orthogonal') for(const route of Object.values(result.mapLayout.routes)) for(let index=1;index<route.points.length;index++)assert.ok(route.points[index].x===route.points[index-1].x || route.points[index].y===route.points[index-1].y);
  }
});
test('automatic layouts handle disconnected nodes, cycles and maps beyond legacy dimensions',async()=>{
  const p=demoProject();
  p.relations.push({id:'cycle',source:p.codes[1].id,target:p.codes[0].id,type:'contradice',memo:'Ciclo interpretativo',quoteIds:[]});
  for(let index=0;index<40;index++)p.codes.push({...p.codes[0],id:`isolated-${index}`,name:`Código aislado ${index}`,categoryId:null,parentId:null});
  const nodes=[...p.categories,...p.codes];
  const nodeIds=new Set(nodes.map(n=>n.id));
  const edges=scopedEdges(p,nodeIds);
  const result=await autoLayout(nodes,edges,'orthogonal');
  p.positions=result.positions;p.mapLayout=result.mapLayout;
  validateProject(p);
  assert.equal(Object.keys(p.positions).length,43);
  p.positions[p.codes[0].id]={x:5000,y:3000};
  p.mapLayout.routes={};
  validateProject(JSON.parse(JSON.stringify(p)));
  assert.throws(()=>validateProject({...p,mapLayout:{mode:'unknown',routing:'orthogonal',routes:{}}}));
  assert.throws(()=>validateProject({...p,mapLayout:{mode:'orthogonal',routing:'orthogonal',routes:{bad:{points:[{x:NaN,y:0},{x:0,y:1}]}}}}));
  await assert.rejects(()=>autoLayout(nodes,edges,'unknown'));
  await assert.rejects(()=>autoLayout([],[],'orthogonal'));
});
test('edge geometry preserves routed bends and keeps orthogonal fallback labels horizontal',()=>{
  const source={x:0,y:0},target={x:600,y:200};
  const result=edgeGeometry(source,target,'orthogonal');
  assert.match(result.path,/^M .* L .* L .* L /);
  assert.ok(Number.isFinite(result.label.x) && Number.isFinite(result.label.y));
  const route={points:[{x:1,y:2},{x:1,y:30},{x:50,y:30}],label:{x:20,y:10}};
  assert.deepEqual(edgeGeometry(source,target,'orthogonal',route),{path:'M 1 2 L 1 30 L 50 30',label:route.label});
});
