import test from 'node:test';
import assert from 'node:assert/strict';
import { project, demoProject, validateProject, addQuote, paragraphs, location, codePath, codeDocumentMatrix, thematicPhases, promptText, csv, escapeHTML, updateResearchBank } from '../src/domain.js';

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
test('code-document matrix counts each coded quote once per assigned code',()=>{
  const p=demoProject();
  addQuote(p,p.documents[0].id,p.quotes[0].start,p.quotes[0].end,p.codes.map(code=>code.id));
  const matrix=codeDocumentMatrix(p);
  assert.deepEqual(matrix[p.codes[0].id],{[p.documents[0].id]:1});
  assert.deepEqual(matrix[p.codes[1].id],{[p.documents[0].id]:2});
  assert.equal(Object.keys(matrix).length,p.codes.length);
});
test('thematic phase notes retain valid evidence links and reject missing citations',()=>{
  const p=demoProject();
  const phase=thematicPhases[0];
  p.thematicAnalysis[phase.id]={notes:'Relectura del corpus y primeras observaciones.',quoteIds:[p.quotes[0].id]};
  validateProject(p);
  p.thematicAnalysis[phase.id].quoteIds=['missing'];
  assert.throws(()=>validateProject(p));
  delete p.thematicAnalysis;
  assert.doesNotThrow(()=>validateProject(p));
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
