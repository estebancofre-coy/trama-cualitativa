import { test, expect } from '@playwright/test';
import JSZip from 'jszip';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';

async function createMapWindow(page, name = 'Mapa de articulación') {
  await page.getByRole('button',{name:'+ Crear mapa',exact:true}).first().click();
  await page.getByLabel('Nombre del mapa',{exact:true}).fill(name);
  await page.locator('select[name=categoryId]').selectOption({label:'Articulación institucional'});
  const pending=page.waitForEvent('popup');
  await page.getByRole('button',{name:'Crear y abrir',exact:true}).click();
  const popup=await pending;
  await expect(popup.locator('#relation-map')).toBeVisible();
  return popup;
}

test('manual workflow, traceability, focused prompt, map, backup and persistence',async({page})=>{
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button',{name:'Explorar un ejemplo'}).click();
  await expect(page.getByRole('heading',{name:'Mi primer análisis'})).toBeVisible();
  await page.getByRole('button',{name:'Libro de códigos',exact:false}).first().click();
  await page.getByRole('button',{name:'+ Código',exact:true}).click();
  await page.getByLabel('Nombre del código').fill('Pérdida de acuerdos');
  await page.getByLabel('Definición', {exact:true}).fill('Pérdida de acuerdos tras cambios de equipo.');
  await page.getByRole('combobox',{name:'Categoría mayor',exact:true}).selectOption({label:'Articulación institucional'});
  await page.getByRole('button',{name:'Guardar',exact:true}).click();
  await expect(page.getByText('Pérdida de acuerdos',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Documentos',exact:false}).first().click();
  await page.locator('#transcript p').last().evaluate(p=>{
    const range=document.createRange();range.selectNodeContents(p);
    const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
    p.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
  });
  await page.locator('#coding-form').getByText('Pérdida de acuerdos',{exact:true}).click();
  await page.getByLabel('Memo de la cita (opcional)').fill('Distinción revisada por la investigadora.');
  await page.getByRole('button',{name:'Guardar cita y codificación'}).click();
  await page.getByRole('button',{name:'Citas e insertos',exact:false}).first().click();
  await expect(page.getByText('Distinción revisada por la investigadora.',{exact:false})).toBeVisible();
  await page.getByRole('button',{name:'Ver en contexto ↗'}).last().click();
  await expect(page.locator('#selection-preview blockquote')).toContainText('Cuando cambia el equipo');
  await page.getByRole('button',{name:'Prompts sin API',exact:false}).first().click();
  await page.getByLabel('Usar originales en IA externa: excluir texto del corpus').uncheck();
  await page.getByLabel('Consulta focalizada (opcional si seleccionas preguntas)').fill('¿Qué sucede cuando cambia el equipo?');
  await page.getByRole('combobox',{name:'Operación',exact:true}).selectOption('Proponer subcódigos');
  await page.locator('#scope-quotes input[type=checkbox]').last().check();
  await page.getByRole('button',{name:'Preparar prompt y guardar solicitud'}).click();
  await expect(page.locator('#prompt-output')).toContainText('Cuando cambia el equipo');
  await expect(page.locator('#prompt-output')).not.toContainText('Cuando conocemos a alguien');
  await page.getByRole('button',{name:'Mapa de relaciones',exact:false}).first().click();
  const map=await createMapWindow(page);
  await expect(map.locator('.map-edge')).toHaveCount(4);
  await map.getByRole('button',{name:'Ajustar a pantalla'}).click();
  if(process.env.TRAMA_SCREENSHOTS) await page.screenshot({path:join(process.env.TRAMA_SCREENSHOTS,'trama-desktop.png'),fullPage:true});
  const downloadPromise=page.waitForEvent('download');
  await page.getByRole('button',{name:'↓ Descargar respaldo'}).click();
  const download=await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.json$/);
  const backupPath=await download.path();
  await page.reload();
  await expect(page.getByRole('heading',{name:'Mi primer análisis'})).toBeVisible();
  const chooserPromise=page.waitForEvent('filechooser');
  await page.getByRole('button',{name:'Restaurar respaldo',exact:true}).click();
  await (await chooserPromise).setFiles(backupPath);
  await expect(page.getByRole('heading',{name:'Mi primer análisis (restaurado)'})).toBeVisible();
  expect(errors).toEqual([]);
});

test('undo reverts the latest project change and preserves its audit history',async({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:'Explorar un ejemplo'}).click();
  await page.getByRole('button',{name:'Libro de códigos',exact:false}).first().click();
  await page.getByRole('button',{name:'+ Categoría',exact:true}).click();
  await page.getByLabel('Nombre',{exact:true}).fill('Categoría temporal');
  await page.getByLabel('Definición / principio de agrupación').fill('Agrupación para probar deshacer.');
  await page.getByRole('button',{name:'Guardar',exact:true}).click();
  await expect(page.getByText('Categoría temporal',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Deshacer: Categoría creada'}).click();
  await expect(page.getByText('Categoría temporal',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Deshacer última acción'})).toBeDisabled();
  await page.getByRole('button',{name:'Bitácora',exact:false}).first().click();
  await expect(page.locator('.history-list')).toContainText('Categoría creada');
  await expect(page.locator('.history-list')).toContainText('Cambio deshecho');
});

test('creating a code from a selected passage creates a quote traceable by group',async({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:'Explorar un ejemplo'}).click();
  await page.locator('#transcript p').last().evaluate(p=>{
    const range=document.createRange();range.selectNodeContents(p);
    const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
    p.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
  });
  await page.getByRole('button',{name:'+ Crear código y citar selección'}).click();
  await page.getByLabel('Nombre del código').fill('Pérdida de acuerdos');
  await page.getByLabel('Definición',{exact:true}).fill('Pérdida de continuidad tras cambios de equipo.');
  await page.getByRole('combobox',{name:'Categoría mayor'}).selectOption({label:'Articulación institucional'});
  await page.locator('#dialog').getByLabel('Memo de la cita (opcional)').fill('La rotación interrumpe acuerdos previos.');
  await page.getByRole('button',{name:'Guardar',exact:true}).click();
  await expect(page.locator('#notice')).toContainText('cita vinculada');
  await page.getByRole('button',{name:'Citas e insertos',exact:false}).first().click();
  const createdQuote=page.locator('.quote-card').filter({hasText:'Pérdida de acuerdos'});
  await expect(createdQuote).toContainText('Articulación institucional → Pérdida de acuerdos');
  await expect(createdQuote).toContainText('Cuando cambia el equipo');
  await expect(createdQuote).toContainText('La rotación interrumpe acuerdos previos.');
  await page.getByLabel('Filtrar por grupo / categoría').selectOption({label:'Articulación institucional'});
  await expect(createdQuote).toBeVisible();
});

test('custom relation labels can connect a category and code and be edited',async({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:'Explorar un ejemplo'}).click();
  await page.getByRole('button',{name:'Mapa de relaciones',exact:false}).first().click();
  page=await createMapWindow(page);
  await page.getByText('Construcción con desplegables',{exact:true}).click();
  await page.getByRole('button',{name:'+ Relación'}).click();
  await page.getByRole('combobox',{name:'Desde'}).selectOption({label:'Categoría: Articulación institucional'});
  await page.getByRole('combobox',{name:'Hacia'}).selectOption({label:'Código: Coordinación informal'});
  await page.getByLabel('Vinculación').selectOption('custom');
  await page.getByLabel('Texto del vínculo').fill('facilita en ciertos contextos');
  await page.getByLabel('Memo / fundamento interpretativo').fill('Etiqueta personalizada para esta relación.');
  await page.getByRole('button',{name:'Guardar',exact:true}).click();
  await expect(page.locator('.relationship-list')).toContainText('facilita en ciertos contextos');
  await page.getByRole('button',{name:'Revisar'}).last().click();
  await expect(page.getByLabel('Texto del vínculo')).toHaveValue('facilita en ciertos contextos');
  await page.getByLabel('Texto del vínculo').fill('sostiene la coordinación cotidiana');
  await page.getByRole('button',{name:'Guardar',exact:true}).click();
  await expect(page.locator('.relationship-list')).toContainText('sostiene la coordinación cotidiana');
});

test('PC layout, independent project and invalid restoration',async({page})=>{
  await page.setViewportSize({width:1280,height:800});
  await page.goto('/');
  await page.getByRole('button',{name:'Crear mi proyecto'}).click();
  await page.getByLabel('Nombre del proyecto').fill('Trabajo de campo');
  await page.getByLabel('Pregunta u objetivo de investigación').fill('Experiencias de participación');
  await page.getByRole('button',{name:'Crear proyecto',exact:true}).click();
  await page.getByRole('button',{name:'Pegar entrevista',exact:true}).first().click();
  await page.getByLabel('Nombre de la entrevista').fill('E01');
  await page.getByLabel('Transcripción',{exact:true}).fill('Una entrevista de prueba.\nOtro párrafo con contexto.');
  await page.getByRole('button',{name:'Importar texto'}).click();
  await expect(page.locator('#transcript')).toContainText('Otro párrafo con contexto.');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  const chooser=page.waitForEvent('filechooser');
  await page.getByRole('button',{name:'Restaurar respaldo',exact:true}).click();
  await (await chooser).setFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{"name":"bad"}')});
  await expect(page.locator('#notice')).toContainText('no es un respaldo válido');
  await expect(page.getByRole('heading',{name:'Trabajo de campo'})).toBeVisible();
});

test('DOCX import is local and preserves literal text in citation exports',async({page})=>{
  const zip=new JSZip();
  zip.file('[Content_Types].xml','<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml','<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Ejemplo sintético: coordinación y participación.</w:t></w:r></w:p><w:p><w:r><w:t>Segundo párrafo del documento de prueba.</w:t></w:r></w:p></w:body></w:document>');
  await page.goto('/');
  await page.getByRole('button',{name:'Explorar un ejemplo'}).click();
  const chooser=page.waitForEvent('filechooser');
  await page.getByRole('button',{name:'↑ Importar TXT / DOCX'}).click();
  await (await chooser).setFiles({name:'entrevista-ficticia.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:await zip.generateAsync({type:'nodebuffer'})});
  await expect(page.locator('#transcript')).toContainText('Ejemplo sintético: coordinación y participación.');
  await expect(page.locator('#transcript')).toContainText('Segundo párrafo del documento de prueba.');
  await page.locator('#transcript p').first().evaluate(p=>{
    const range=document.createRange();range.selectNodeContents(p);
    const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
    p.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
  });
  await page.locator('#coding-form input[type=checkbox]').first().check();
  await page.getByRole('button',{name:'Guardar cita y codificación'}).click();
  await page.getByRole('button',{name:'Citas e insertos',exact:false}).first().click();
  const downloads=page.waitForEvent('download');
  await page.getByRole('button',{name:'↓ Insertos HTML'}).click();
  const downloaded=await downloads;
  expect(downloaded.suggestedFilename()).toMatch(/insertos\.html$/);
  const stream=await downloaded.createReadStream();
  const chunks=[];for await(const chunk of stream) chunks.push(chunk);
  const html=Buffer.concat(chunks).toString('utf8');
  expect(html).toContain('Ejemplo sintético: coordinación y participación.');
  expect(html).toContain('entrevista-ficticia.docx');
  expect(html).toContain('Coordinación informal');
});

test('concurrent tabs cannot silently overwrite a project',async({page,context})=>{
  await page.goto('/');
  await page.getByRole('button',{name:'Explorar un ejemplo'}).click();
  const second=await context.newPage();
  await second.goto('/');
  await second.getByRole('button',{name:'Ajustes',exact:true}).click();
  await second.getByLabel('Nombre del proyecto').fill('Nombre obsoleto');
  await page.getByRole('button',{name:'Ajustes',exact:true}).click();
  await page.getByLabel('Nombre del proyecto').fill('Nombre guardado en la primera pestaña');
  await page.getByRole('button',{name:'Guardar ajustes'}).click();
  await second.getByRole('button',{name:'Guardar ajustes'}).click();
  await expect(second.locator('.form-error')).toContainText('otra pestaña');
  await second.reload();
  await expect(second.getByRole('heading',{name:'Nombre guardado en la primera pestaña'})).toBeVisible();
});

test('relationship creation, evidence retrieval and node positions persist',async({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:'Explorar un ejemplo'}).click();
  await page.getByRole('button',{name:'Mapa de relaciones',exact:false}).first().click();
  page=await createMapWindow(page);
  await page.getByText('Construcción con desplegables',{exact:true}).click();
  await page.getByRole('button',{name:'+ Relación'}).click();
  const source=page.getByRole('combobox',{name:'Desde',exact:true});
  const target=page.getByRole('combobox',{name:'Hacia',exact:true});
  await source.selectOption({label:'Código: Continuidad de equipos'});
  await target.selectOption({label:'Código: Coordinación informal'});
  await page.getByRole('combobox',{name:'Vinculación'}).selectOption('contradice');
  await page.getByLabel('Memo / fundamento interpretativo').fill('Relación ficticia para verificar el mapa.');
  await page.getByRole('button',{name:'Guardar',exact:true}).click();
  await expect(page.locator('.relationship-list article')).toHaveCount(2);
  const node=page.locator('.map-node').first();
  const before=await node.getAttribute('transform');
  const box=await node.boundingBox();
  await page.mouse.move(box.x+50,box.y+40);
  await page.mouse.down();await page.mouse.move(box.x+100,box.y+100,{steps:5});await page.mouse.up();
  await expect(page.locator('.map-node').first()).not.toHaveAttribute('transform',before);
  await expect(page.locator('#save-state')).toHaveText('Guardado en este navegador');
  const moved=await page.locator('.map-node').first().getAttribute('transform');
  await page.reload();
  await expect(page.locator('.map-node').first()).toHaveAttribute('transform',moved);
  await page.locator('.map-node').nth(1).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading',{name:'Evidencia del código'})).toBeVisible();
  await expect(page.locator('#dialog blockquote')).toContainText('Cuando conocemos a alguien');
});
test('map connects nodes, edits labels, persists automatic layouts and exports complete SVG',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button',{name:'Explorar un ejemplo'}).click();
  await page.getByRole('button',{name:'Mapa de relaciones',exact:false}).first().click();
  page=await createMapWindow(page);
  page.on('pageerror',error=>errors.push(error.message));
  await page.getByRole('button',{name:'Conectar nodos'}).click();
  await expect(page.getByRole('button',{name:'Conectar nodos'})).toHaveAttribute('aria-pressed','true');
  await page.locator('.map-node').first().click();
  await page.locator('.map-node').last().click();
  await expect(page.locator('#dialog')).toBeVisible();
  await expect(page.getByRole('combobox',{name:'Desde',exact:true})).not.toHaveValue('');
  await expect(page.getByRole('combobox',{name:'Hacia',exact:true})).not.toHaveValue('');
  await page.getByLabel('Vinculación').selectOption('custom');
  await page.getByLabel('Texto del vínculo').fill('facilita la continuidad de los equipos');
  await page.getByLabel('Memo / fundamento interpretativo').fill('Relación revisada con evidencia ficticia.');
  await page.getByRole('button',{name:'Guardar',exact:true}).click();
  await expect(page.locator('.map-edge.editable')).toHaveCount(2);
  await page.locator('.map-edge.editable').last().focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Texto del vínculo')).toHaveValue('facilita la continuidad de los equipos');
  const name='favorece la continuidad entre equipos bajo condiciones específicas';
  await page.getByLabel('Texto del vínculo').fill(name);
  await page.getByRole('button',{name:'Guardar',exact:true}).click();
  await expect(page.locator('.map-edge.editable').last().locator('.edge-label')).toHaveText(name);
  for(const mode of ['tree-right','tree-down','layered-down','radial','orthogonal']) {
    await page.getByRole('combobox',{name:'Organización',exact:true}).selectOption(mode);
    await page.getByRole('button',{name:'Organizar mapa',exact:true}).click();
    await expect(page.locator('#notice')).toContainText('Organización guardada');
    await expect(page.getByRole('button',{name:'Organizar mapa',exact:true})).toBeEnabled();
    await expect(page.getByRole('combobox',{name:'Organización',exact:true})).toHaveValue(mode);
    const nodes=await page.locator('.map-node').evaluateAll(elements=>elements.map(element=>{const transform=element.transform.baseVal.getItem(0).matrix;return {x:transform.e,y:transform.f};}));
    for(let index=0;index<nodes.length;index++)for(const other of nodes.slice(index+1)){const node=nodes[index];expect(node.x+280<=other.x||other.x+280<=node.x||node.y+100<=other.y||other.y+100<=node.y).toBeTruthy();}
    await expect(page.locator('.map-edge')).toHaveCount(4);
    for(const path of await page.locator('.edge-path').evaluateAll(paths=>paths.map(path=>path.getAttribute('d'))))expect(path).toMatch(/^M /);
  }
  await expect(page.getByRole('combobox',{name:'Conexiones',exact:true})).toHaveValue('orthogonal');
  const positions=await page.locator('.map-node').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('transform')));
  const routes=await page.locator('.edge-path').evaluateAll(paths=>paths.map(path=>path.getAttribute('d')));
  await page.reload();
  await expect(page.getByRole('combobox',{name:'Organización',exact:true})).toHaveValue('orthogonal');
  expect(await page.locator('.map-node').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('transform')))).toEqual(positions);
  expect(await page.locator('.edge-path').evaluateAll(paths=>paths.map(path=>path.getAttribute('d')))).toEqual(routes);
  for(const width of [1440,1100]) {
    await page.setViewportSize({width,height:900});
    await page.getByRole('button',{name:'Ajustar a pantalla'}).click();
    await expect(page.getByRole('button',{name:'Organizar mapa',exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
    await page.screenshot({path:`test-results/trama-qda-map-${width}.png`,fullPage:true});
  }
  const pending=page.waitForEvent('download');
  await page.getByRole('button',{name:'↓ Mapa SVG'}).click();
  const download=await pending;
  expect(download.suggestedFilename()).toMatch(/\.svg$/);
  const svg=await readFile(await download.path(),'utf8');
  expect(svg).toContain(name);
  expect(svg).not.toContain('class="edge-hit"');
  const exported=await page.context().newPage();
  await exported.setContent(svg);
  await expect(exported.locator('.map-node')).toHaveCount(3);
  expect(await exported.locator('.edge-path').evaluateAll(paths=>paths.map(path=>path.getAttribute('d')))).toEqual(routes);
  const contained=await exported.locator('svg').evaluate(svg=>{
    const bounds=svg.viewBox.baseVal;
    return [...svg.querySelectorAll('.map-node,.map-edge')].every(element=>{const box=element.getBBox(),transform=element.transform.baseVal.consolidate()?.matrix;const x=box.x+(transform?.e||0),y=box.y+(transform?.f||0);return x>=bounds.x && y>=bounds.y && x+box.width<=bounds.x+bounds.width && y+box.height<=bounds.y+bounds.height;});
  });
  expect(contained).toBeTruthy();
  await exported.close();
  await page.getByRole('combobox',{name:'Conexiones',exact:true}).selectOption('straight');
  await expect(page.getByRole('combobox',{name:'Conexiones',exact:true})).toHaveValue('straight');
  await expect(page.locator('#save-state')).toHaveText('Guardado en este navegador');
  await page.reload();
  await expect(page.getByRole('combobox',{name:'Conexiones',exact:true})).toHaveValue('straight');
  expect(errors).toEqual([]);
});
test('branding keeps logo, dark surfaces and semantic labels readable across desktop views',async({page})=>{
  await page.goto('/');
  await page.getByRole('button',{name:'Explorar un ejemplo'}).click();
  await page.getByRole('button',{name:'Mapa de relaciones',exact:false}).first().click();
  const map=await createMapWindow(page);
  await page.evaluate(()=>document.fonts.ready);
  const audit=async()=>page.evaluate(()=>{
    const luminance=color=>{
      const values=color.match(/[\d.]+/g).slice(0,3).map(Number).map(value=>{const channel=value/255;return channel<=0.04045?channel/12.92:((channel+0.055)/1.055)**2.4;});
      return values[0]*0.2126+values[1]*0.7152+values[2]*0.0722;
    };
    const ratio=(foreground,background)=>{const first=luminance(foreground),second=luminance(background);return (Math.max(first,second)+0.05)/(Math.min(first,second)+0.05);};
    const background=element=>{
      for(let node=element;node;node=node.parentElement){const color=getComputedStyle(node).backgroundColor;const values=color.match(/[\d.]+/g)?.map(Number);if(values && (values.length===3 || values[3]===1))return color;}
      return 'rgb(255,255,255)';
    };
    return [...document.querySelectorAll('.rail .brand-name,.rail .brand-suffix,.rail .brand small,.rail .project-switch,.rail select,.rail button,.rail nav small,.rail-bottom p,.tag,.tiny-tag,.review-status')].filter(element=>element.getBoundingClientRect().width>0).map(element=>({text:element.textContent.trim().slice(0,70),ratio:ratio(getComputedStyle(element).color,background(element))}));
  });
  for(const result of await audit())expect(result.ratio,`${result.text}: contraste insuficiente`).toBeGreaterThanOrEqual(4.5);
  await page.locator('.rail nav button').first().hover();
  for(const result of await audit())expect(result.ratio,`${result.text}: contraste hover insuficiente`).toBeGreaterThanOrEqual(4.5);
  const logo=await page.locator('.rail .brand-mark').evaluate(async image=>{
    await image.decode();
    const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
    const context=canvas.getContext('2d');context.fillStyle=getComputedStyle(image).backgroundColor;context.fillRect(0,0,64,64);context.drawImage(image,0,0,64,64);
    return {bracket:[...context.getImageData(8,20,1,1).data],background:[...context.getImageData(32,60,1,1).data],loaded:image.naturalWidth>0};
  });
  expect(logo.loaded).toBeTruthy();
  const luminance=values=>values.slice(0,3).map(value=>{const channel=value/255;return channel<=0.04045?channel/12.92:((channel+0.055)/1.055)**2.4;}).reduce((sum,value,index)=>sum+value*[0.2126,0.7152,0.0722][index],0);
  expect((luminance(logo.background)+0.05)/(luminance(logo.bracket)+0.05)).toBeGreaterThanOrEqual(7);
  for(const width of [1440,1100]){
    await page.setViewportSize({width,height:900});
    for(const [tab,name] of [['documents','Documentos'],['book','Libro de códigos'],['quotes','Citas e insertos'],['map','Mapa de relaciones'],['prompts','Prompts sin API'],['review','Revisión externa'],['history','Bitácora']]){
      await page.locator(`[data-tab="${tab}"]`).click();
      await expect(page.getByRole('heading',{name,exact:true})).toBeVisible();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),`${tab}: desbordamiento horizontal`).toBeTruthy();
      for(const result of await audit())expect(result.ratio,`${tab}: ${result.text}`).toBeGreaterThanOrEqual(4.5);
      if(tab==='map'){
        await map.setViewportSize({width,height:900});
        await map.getByRole('button',{name:'Ajustar a pantalla'}).click();
        const colors=await map.locator('.map-node[data-kind=category]').first().evaluate(node=>({background:node.querySelector('rect').getAttribute('fill'),text:getComputedStyle(node.querySelector('.node-name')).fill,metadata:getComputedStyle(node.querySelector('.node-kind')).fill}));
        expect(colors.background).toBe('#16302b');
        expect(colors.text).toBe('rgb(244, 248, 245)');
        expect(colors.metadata).toBe('rgb(199, 231, 217)');
      }
      if(['documents','map','book'].includes(tab))await page.screenshot({path:`test-results/trama-qda-brand-${tab}-${width}.png`,fullPage:true});
    }
  }
});
test('quick relation builder remains optional and exports the full map as nonblank PNG',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button',{name:'Explorar un ejemplo'}).click();
  await page.getByRole('button',{name:'Mapa de relaciones',exact:false}).first().click();
  page=await createMapWindow(page);
  page.on('pageerror',error=>errors.push(error.message));
  await expect(page.locator('.map-quick')).toHaveAttribute('open','');
  await expect(page.locator('.map-classic')).not.toHaveAttribute('open','');
  const form=page.locator('#quick-relation-form');
  await page.getByLabel('Buscar origen').fill('Coordinación informal');
  await expect(form.locator('input[name=source]:visible')).toHaveCount(1);
  await form.locator('input[name=source]').nth(1).check();
  await form.locator('input[name=target]').nth(1).check();
  await form.getByRole('button',{name:'Crear relación',exact:true}).click();
  await expect(form.locator('.form-error')).toContainText('dos nodos diferentes');
  await form.locator('input[name=target]').last().check();
  await form.getByRole('button',{name:'Crear relación',exact:true}).click();
  await expect(form.locator('.form-error')).toContainText('cita de respaldo o un memo');
  await form.getByRole('radio',{name:'es causa de',exact:true}).check();
  await form.getByText('Citas de respaldo',{exact:true}).click();
  await form.locator('input[name=quoteIds]').first().check();
  await form.getByRole('button',{name:'Crear relación',exact:true}).click();
  await expect(form.locator('.form-error')).toContainText('relación causal');
  await form.getByRole('radio',{name:'Texto personalizado',exact:true}).check();
  await form.getByLabel('Nombre personalizado de la relación').fill('facilita la continuidad');
  await form.getByLabel('Fundamento de la relación').fill('Fundamento interpretativo de la relación rápida.');
  await form.getByRole('button',{name:'Crear relación',exact:true}).click();
  await expect(page.locator('.relationship-list article')).toHaveCount(2);
  await expect(page.locator('.relationship-list')).toContainText('facilita la continuidad');
  await expect(page.locator('.relationship-list article').last()).toContainText('1 citas de respaldo');
  await page.locator('.map-quick>summary').click();
  await expect(form).not.toBeVisible();
  await page.getByText('Construcción con desplegables',{exact:true}).click();
  await page.getByRole('button',{name:'+ Relación',exact:true}).click();
  await expect(page.getByRole('combobox',{name:'Desde',exact:true})).toBeVisible();
  await page.locator('#dialog').getByRole('button',{name:'Cancelar',exact:true}).click();
  await page.getByRole('button',{name:'Organizar mapa',exact:true}).click();
  await expect(page.locator('#notice')).toContainText('Organización guardada');
  await expect(page.getByRole('button',{name:'Organizar mapa',exact:true})).toBeEnabled();
  await expect(page.locator('.map-quick')).not.toHaveAttribute('open','');
  await expect(page.locator('.map-classic')).toHaveAttribute('open','');
  await page.locator('.map-node').first().evaluate(node=>node.setAttribute('transform','translate(2000 1600)'));
  const pendingSVG=page.waitForEvent('download');
  await page.getByRole('button',{name:'↓ Mapa SVG'}).click();
  const svgDownload=await pendingSVG;
  const svg=await readFile(await svgDownload.path(),'utf8');
  const bounds=await page.evaluate(source=>{const box=new DOMParser().parseFromString(source,'image/svg+xml').documentElement.viewBox.baseVal;return {width:box.width,height:box.height};},svg);
  const pendingPNG=page.waitForEvent('download');
  await page.getByRole('button',{name:'↓ Mapa PNG'}).click();
  const pngDownload=await pendingPNG;
  const png=await readFile(await pngDownload.path());
  expect(pngDownload.suggestedFilename()).toMatch(/-mapa\.png$/);
  expect(png.subarray(0,8)).toEqual(Buffer.from([137,80,78,71,13,10,26,10]));
  expect(png.readUInt32BE(16)).toBe(Math.floor(bounds.width*2));
  expect(png.readUInt32BE(20)).toBe(Math.floor(bounds.height*2));
  const pixels=await page.evaluate(async base64=>{
    const image=new Image();image.src=`data:image/png;base64,${base64}`;await image.decode();
    const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
    const context=canvas.getContext('2d');context.drawImage(image,0,0);
    const data=context.getImageData(0,0,canvas.width,canvas.height).data;
    let nonwhite=0,ink=0;
    for(let offset=0;offset<data.length;offset+=64){if(data[offset]<240 || data[offset+1]<240 || data[offset+2]<240)nonwhite++;if(data[offset]<70 && data[offset+1]<100 && data[offset+2]<100)ink++;}
    return {nonwhite,ink,corner:[...data.slice(0,4)]};
  },png.toString('base64'));
  expect(pixels.nonwhite).toBeGreaterThan(1000);
  expect(pixels.ink).toBeGreaterThan(1000);
  expect(pixels.corner).toEqual([255,255,255,255]);
  await page.reload();
  await expect(page.locator('.relationship-list')).toContainText('facilita la continuidad');
  expect(errors).toEqual([]);
});
