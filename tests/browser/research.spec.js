import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('select research questions and objectives independently of selected corpus and link manual coding',async({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:'Explorar un ejemplo'}).click();
  await page.getByRole('button',{name:'Ajustes',exact:true}).click();
  await page.getByLabel('Banco de preguntas (una por línea)').fill('¿Cómo coordinan los equipos?\n¿Qué barreras existen?\nPREGUNTA QUE NO SE INCLUYE');
  await page.getByLabel('Banco de objetivos (uno por línea)').fill('Caracterizar apoyos');
  await page.getByRole('button',{name:'Guardar ajustes'}).click();
  await expect(page.locator('#dialog')).not.toBeVisible();
  await page.locator('#transcript p').nth(1).evaluate(p=>{
    const range=document.createRange();range.selectNodeContents(p);
    const selected=window.getSelection();selected.removeAllRanges();selected.addRange(range);
    p.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
  });
  await page.locator('#coding-form input[name=codeIds]').first().check();
  await page.locator('#coding-form').getByText('Pregunta: ¿Cómo coordinan los equipos?',{exact:true}).click();
  await page.getByRole('button',{name:'Guardar cita y codificación'}).click();
  await page.getByRole('button',{name:'Citas e insertos',exact:false}).first().click();
  await page.getByRole('combobox',{name:'Pregunta / objetivo',exact:true}).selectOption({label:'¿Cómo coordinan los equipos?'});
  await expect(page.locator('.quote-card')).toHaveCount(1);
  await expect(page.locator('.quote-card')).toContainText('Cuando conocemos');
  await page.getByRole('button',{name:'Prompts sin API',exact:true}).click();
  await page.locator('#prompt-form').getByText('Pregunta: ¿Cómo coordinan los equipos?',{exact:true}).click();
  await page.locator('#prompt-form').getByText('Objetivo: Caracterizar apoyos',{exact:true}).click();
  await page.getByRole('combobox',{name:'Material autorizado',exact:true}).selectOption('quotes');
  await page.locator('#scope-quotes input[name=quoteIds]').first().check();
  await page.getByRole('button',{name:'Preparar prompt y guardar solicitud'}).click();
  await expect(page.locator('#prompt-output')).toHaveValue(/¿Cómo coordinan los equipos\?/);
  const text=await page.locator('#prompt-output').inputValue();
  expect(text).toContain('¿Cómo coordinan los equipos?');
  expect(text).toContain('Caracterizar apoyos');
  expect(text).not.toContain('¿Qué barreras existen?');
  expect(text).not.toContain('PREGUNTA QUE NO SE INCLUYE');
  expect(text).not.toContain('Cuando cambia el equipo');
  expect(text).toContain('GLOBAL para toda esta solicitud');
  await page.reload();
  await page.getByRole('button',{name:'Ajustes',exact:true}).click();
  await expect(page.getByLabel('Banco de preguntas (una por línea)')).toContainText('PREGUNTA QUE NO SE INCLUYE');
});
async function savedProject(page) {
  return page.evaluate(async()=>{
    const db = await new Promise((resolve,reject)=>{const request=indexedDB.open('trama-cualitativa');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    const projects = await new Promise((resolve,reject)=>{const request=db.transaction('projects').objectStore('projects').getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    db.close(); return projects[0];
  });
}
async function prepareExternalPrompt(page) {
  await page.goto('/');
  await page.getByRole('button',{name:'Explorar un ejemplo'}).click();
  await page.getByRole('button',{name:'Prompts sin API',exact:false}).first().click();
  await expect(page.getByLabel('Usar originales en IA externa: excluir texto del corpus')).toBeChecked();
  await page.locator('#scope-documents input[name=documentIds]').first().check();
  await page.getByRole('button',{name:'Preparar prompt y guardar solicitud'}).click();
  await expect(page.locator('#prompt-output')).toHaveValue(/exclusivamente JSON válido/);
  return savedProject(page);
}
function externalResponse(p) {
  const quote = p.quotes[0];
  const proposal = {id:'proposal-1',documentId:quote.documentId,text:quote.text,code:{name:'Apoyo interpersonal',description:'Apoyo entre personas de equipos distintos.',inclusion:'Contacto personal directo.',exclusion:'Convenios formales.'},researchQuestionIds:[],memo:'Propuesta externa para revisar.'};
  return {schemaVersion:1,projectId:p.id,promptId:p.prompts.at(-1).id,proposals:[proposal,{...proposal,id:'proposal-bad',text:'ESTA CITA NO EXISTE EN EL DOCUMENTO'}]};
}
test('external prompt exports three formats and JSON review accepts or rejects without losing source',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const p = await prepareExternalPrompt(page);
  await expect(page).toHaveTitle('TRAMA-QDA');
  await expect(page.locator('.brand')).toContainText('TRAMA-QDA');
  for (const format of ['json','txt','md']) {
    await page.getByLabel('Formato de exportación').selectOption(format);
    const pending = page.waitForEvent('download');
    await page.getByRole('button',{name:'↓ Exportar prompt'}).click();
    const download = await pending;
    expect(download.suggestedFilename()).toMatch(new RegExp(`\\.${format}$`));
    const content = await readFile(await download.path(),'utf8');
    for (const quote of p.quotes) expect(content).not.toContain(quote.text);
    expect(content).toContain(p.documents[0].id);
    if (format === 'json') expect(JSON.parse(content).promptId).toBe(p.prompts.at(-1).id);
  }
  await page.getByRole('button',{name:'↑ Importar resultados JSON'}).click();
  await expect(page.getByLabel('Autovalidar y aceptar propuestas verificables')).not.toBeChecked();
  await page.getByLabel('Resultados JSON').fill('```json\n{}\n```');
  await page.getByRole('button',{name:'Importar JSON',exact:true}).click();
  await expect(page.locator('.form-error')).toContainText('JSON válido');
  const response = externalResponse(p);
  await page.getByLabel('Resultados JSON').fill(JSON.stringify(response));
  await page.getByRole('button',{name:'Importar JSON',exact:true}).click();
  await expect(page.locator('.review-batch .quote-card')).toHaveCount(2);
  await expect(page.getByRole('button',{name:'✓ Aceptar'}).last()).toBeDisabled();
  expect((await savedProject(page)).codes).toHaveLength(2);
  await page.getByRole('button',{name:'✓ Aceptar'}).first().click();
  await expect(page.locator('.review-batch .quote-card').first()).toContainText('Aceptada');
  await page.getByRole('button',{name:'Rechazar',exact:true}).click();
  await expect(page.locator('.review-batch .quote-card').last()).toContainText('Rechazada');
  const saved = await savedProject(page);
  expect(saved.codes).toHaveLength(3);
  expect(saved.externalReviews[0].items.map(item=>item.status)).toEqual(['accepted','rejected']);
  const applied = saved.externalReviews[0].items[0];
  const quote = saved.quotes.find(q=>q.id===applied.appliedQuoteId);
  expect(quote.codeIds).toContain(applied.appliedCodeId);
  expect(saved.documents[0].text.slice(quote.start,quote.end)).toBe(quote.text);
  await page.reload();
  await page.getByRole('button',{name:/Revisión externa/}).click();
  await expect(page.locator('.review-batch')).toContainText('Aceptada');
  await expect(page.locator('.review-batch')).toContainText('Rechazada');
  await page.screenshot({path:'test-results/trama-qda-review.png',fullPage:true});
  await page.getByRole('button',{name:'Ver documento ↗'}).first().click();
  await expect(page.locator('#selection-preview blockquote')).toHaveText(quote.text);
  expect(errors).toEqual([]);
});
test('opt-in autovalidation accepts only literal verified results and file input remains JSON-only',async({page})=>{
  const p = await prepareExternalPrompt(page);
  const response = externalResponse(p);
  await page.getByRole('button',{name:'↑ Importar resultados JSON'}).click();
  await page.getByLabel('Autovalidar y aceptar propuestas verificables').check();
  const pending = page.waitForEvent('filechooser');
  await page.getByRole('button',{name:'↑ Seleccionar archivo JSON'}).click();
  await (await pending).setFiles({name:'results.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(response))});
  await expect(page.getByLabel('Resultados JSON')).toHaveValue(JSON.stringify(response));
  await page.getByRole('button',{name:'Importar JSON',exact:true}).click();
  await expect(page.locator('.review-batch')).toContainText('Aceptada');
  await expect(page.locator('.review-batch')).toContainText('Bloqueada');
  expect((await savedProject(page)).externalReviews[0].items.map(item=>item.status)).toEqual(['accepted','invalid']);
  await page.getByRole('button',{name:'↑ Importar resultados JSON'}).click();
  await expect(page.getByLabel('Autovalidar y aceptar propuestas verificables')).not.toBeChecked();
  const invalidFile = page.waitForEvent('filechooser');
  await page.getByRole('button',{name:'↑ Seleccionar archivo JSON'}).click();
  await (await invalidFile).setFiles({name:'results.txt',mimeType:'text/plain',buffer:Buffer.from(JSON.stringify(response))});
  await expect(page.locator('#notice')).toContainText('archivo .json');
});
