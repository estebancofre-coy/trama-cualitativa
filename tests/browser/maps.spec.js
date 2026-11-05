import {test, expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {demoProject} from '../../src/domain.js';

async function restoreProject(page, project) {
  await page.goto('/');
  const chooser=page.waitForEvent('filechooser');
  await page.getByRole('button',{name:/^Restaurar (un )?respaldo$/}).click();
  await (await chooser).setFiles({name:'map-fixture.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});
  await expect(page.locator('.topbar h1')).toContainText('(restaurado)');
  await page.getByRole('button',{name:'Mapa de relaciones',exact:true}).click();
}

async function createMap(page,name,scope='category',scopeId) {
  await page.getByRole('button',{name:'+ Crear mapa',exact:true}).first().click();
  await page.getByLabel('Nombre del mapa',{exact:true}).fill(name);
  if(scope==='research')await page.getByRole('radio',{name:'Códigos de una pregunta u objetivo'}).check();
  await page.locator(`select[name=${scope==='research'?'researchId':'categoryId'}]`).selectOption(scopeId);
  const pending=page.waitForEvent('popup');
  await page.getByRole('button',{name:'Crear y abrir',exact:true}).click();
  const popup=await pending;
  await expect(popup.locator('.map-window')).toBeVisible();
  return popup;
}

async function backup(page) {
  const pending=page.waitForEvent('download');
  await page.getByRole('button',{name:'↓ Descargar respaldo',exact:true}).click();
  return JSON.parse(await readFile(await (await pending).path(),'utf8'));
}

test('parallel maps retain independent positions, sync analysis and preserve a relation draft',async({page,context})=>{
  const errors=[];
  context.on('page',popup=>popup.on('pageerror',error=>errors.push(error.message)));
  const project=demoProject();
  await restoreProject(page,project);
  const first=await createMap(page,'Mapa primero','category',project.categories[0].id);
  const second=await createMap(page,'Mapa segundo','category',project.categories[0].id);
  await expect(page.locator('.map-card')).toHaveCount(2);
  const node=first.locator('.map-node').first();
  const original=await node.getAttribute('transform');
  const box=await node.boundingBox();
  await first.mouse.move(box.x+50,box.y+40);
  await first.mouse.down();
  await first.mouse.move(box.x+100,box.y+100,{steps:5});
  await first.mouse.up();
  await expect(first.locator('.map-node').first()).not.toHaveAttribute('transform',original);
  const moved=await first.locator('.map-node').first().getAttribute('transform');
  await expect(second.locator('.map-node').first()).toHaveAttribute('transform',original);
  await first.getByRole('button',{name:'Guardar mapa',exact:true}).click();
  await first.getByLabel('Nombre del mapa',{exact:true}).fill('Mapa revisado');
  await first.getByRole('button',{name:'Guardar',exact:true}).click();
  await expect(page.locator('.map-card').filter({hasText:'Mapa revisado'})).toBeVisible();
  const pages=context.pages().length;
  await page.locator('.map-card').filter({hasText:'Mapa revisado'}).getByRole('button',{name:'Abrir mapa'}).click();
  expect(context.pages().length).toBe(pages);
  const form=first.locator('#quick-relation-form');
  await form.getByLabel('Fundamento de la relación').fill('Borrador conservado mientras se actualiza el libro.');
  await page.getByRole('button',{name:'Libro de códigos',exact:true}).click();
  await page.locator('.code-table').getByRole('button',{name:'Editar',exact:true}).first().click();
  await page.getByLabel('Nombre del código').fill('Coordinación revisada');
  await page.getByRole('button',{name:'Guardar',exact:true}).click();
  await expect(second.locator('.map-node')).toContainText(['Articulación institucional','Coordinación revisada','Continuidad de equipos']);
  await expect(form.getByLabel('Fundamento de la relación')).toHaveValue('Borrador conservado mientras se actualiza el libro.');
  await form.locator('input[name=source]').first().check();
  await form.locator('input[name=target]').last().check();
  await form.getByRole('button',{name:'Crear relación',exact:true}).click();
  await expect(first.locator('.relationship-list article')).toHaveCount(2);
  await expect(second.locator('.relationship-list article')).toHaveCount(2);
  await first.reload();
  await expect(first.locator('.map-node').first()).toHaveAttribute('transform',moved);
  await expect(first.locator('.map-window-title strong')).toHaveText('Mapa revisado');
  await page.getByRole('button',{name:'Mapa de relaciones',exact:true}).click();
  const saved=await backup(page);
  expect(saved.savedMaps).toHaveLength(2);
  expect(saved.savedMaps.find(m=>m.name==='Mapa revisado').positions).not.toEqual(saved.savedMaps.find(m=>m.name==='Mapa segundo').positions);
  await page.locator('.map-card').filter({hasText:'Mapa revisado'}).getByRole('button',{name:'Eliminar',exact:true}).click();
  await page.getByRole('button',{name:'Eliminar mapa',exact:true}).click();
  await expect(first.getByRole('heading',{name:'Este mapa ya no está disponible'})).toBeVisible();
  await expect(second.locator('#relation-map')).toBeVisible();
  const after=await backup(page);
  expect(after.codes).toEqual(saved.codes);
  expect(after.relations).toEqual(saved.relations);
  expect(after.savedMaps).toHaveLength(1);
  await restoreProject(page,saved);
  await expect(page.locator('.map-card')).toHaveCount(2);
  const restoredPopup=page.waitForEvent('popup');
  await page.locator('.map-card').filter({hasText:'Mapa segundo'}).getByRole('button',{name:'Abrir mapa'}).click();
  const restored=await restoredPopup;
  await expect(restored.locator('#relation-map')).toBeVisible();
  expect(new URL(restored.url()).searchParams.get('project')).not.toBe(new URL(second.url()).searchParams.get('project'));
  await expect(restored.locator('.map-node').first()).toHaveAttribute('transform',original);
  expect(errors).toEqual([]);
});

test('legacy backups create scoped category, question and empty objective maps',async({page})=>{
  const project=demoProject();
  delete project.savedMaps;
  project.categories.push({...project.categories[0],id:'other-category',name:'Otra categoría'});
  project.codes.push({...project.codes[0],id:'other-code',name:'Código externo',categoryId:'other-category'});
  project.researchQuestions=[
    {id:'question',kind:'Pregunta',text:'¿Cómo coordinan?',archived:false},
    {id:'objective',kind:'Objetivo',text:'Comprender las tensiones',archived:false},
  ];
  project.quotes[0].researchQuestionIds=['question'];
  await restoreProject(page,project);
  const category=await createMap(page,'Categoría acotada','category',project.categories[0].id);
  await expect(category.locator('.map-node')).toHaveCount(3);
  await expect(category.locator('#relation-map')).not.toContainText('Código externo');
  const question=await createMap(page,'Pregunta acotada','research','question');
  await expect(question.locator('.map-node')).toHaveCount(2);
  await expect(question.locator('#relation-map')).not.toContainText('Continuidad de equipos');
  await expect(question.locator('.map-node[data-kind=category]')).toContainText('1 citas');
  const objective=await createMap(page,'Objetivo sin citas','research','objective');
  await expect(objective.getByRole('heading',{name:'Sin nodos en este alcance'})).toBeVisible();
  await expect(objective.getByRole('button',{name:'Conectar nodos'})).toBeDisabled();
  await expect(objective.getByRole('button',{name:'Ajustar a pantalla'})).toBeDisabled();
  await page.locator('[data-tab=quotes]').click();
  await page.locator('.quote-card').first().getByRole('button',{name:'Editar códigos / memo',exact:true}).click();
  await page.getByLabel('Objetivo: Comprender las tensiones',{exact:true}).check();
  await page.getByRole('button',{name:'Guardar',exact:true}).click();
  await expect(objective.locator('#relation-map')).toBeVisible();
  await expect(objective.locator('.map-node')).toHaveCount(2);
  await expect(objective.getByRole('button',{name:'↓ Mapa SVG'})).toBeEnabled();
  await objective.getByRole('button',{name:'Cerrar ventana',exact:true}).click();
  await expect.poll(()=>objective.isClosed()).toBe(true);
  await page.getByRole('button',{name:'Mapa de relaciones',exact:true}).click();
  const pending=page.waitForEvent('popup');
  await page.locator('.map-card').filter({hasText:'Objetivo sin citas'}).getByRole('button',{name:'Abrir mapa'}).click();
  await expect((await pending).locator('.map-node')).toHaveCount(2);
});

test('a blocked popup leaves a saved map that can be reopened',async({page})=>{
  const project=demoProject();
  await restoreProject(page,project);
  await page.evaluate(()=>{window.open=()=>null;});
  await page.getByRole('button',{name:'+ Crear mapa',exact:true}).first().click();
  await page.getByLabel('Nombre del mapa',{exact:true}).fill('Mapa recuperable');
  await page.locator('select[name=categoryId]').selectOption(project.categories[0].id);
  await page.getByRole('button',{name:'Crear y abrir',exact:true}).click();
  await expect(page.locator('#notice')).toContainText('bloqueó la ventana');
  await expect(page.locator('.map-card')).toContainText('Mapa recuperable');
  await page.reload();
  await page.getByRole('button',{name:'Mapa de relaciones',exact:true}).click();
  const pending=page.waitForEvent('popup');
  await page.getByRole('button',{name:'Abrir mapa',exact:true}).click();
  await expect((await pending).locator('#relation-map')).toBeVisible();
});
