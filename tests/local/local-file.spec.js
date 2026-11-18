import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { demoProject } from '../../src/domain.js';

async function serveBuild(context) {
  await context.route('https://trama-local.test/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const name = path === '/' ? 'index.html' : decodeURIComponent(path.slice(1));
    if (normalize(name).startsWith('..')) return route.abort();
    const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.woff2':'font/woff2', '.webmanifest':'application/manifest+json', '.png':'image/png', '.svg':'image/svg+xml' };
    try { await route.fulfill({ body: await readFile(join('dist', name)), contentType: types[extname(name)] || 'application/octet-stream' }); }
    catch { await route.abort(); }
  });
}

async function localProjects(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('trama-cualitativa');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const request = open.result.transaction('projects').objectStore('projects').getAll();
      request.onsuccess = () => { resolve(request.result); open.result.close(); };
      request.onerror = () => reject(request.error);
    };
  }));
}

test('local project file saves changes, detects external edits and can be restored', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await serveBuild(page.context());
  await page.goto('https://trama-local.test/');
  await page.getByRole('button', { name:'Explorar un ejemplo' }).click();
  await page.evaluate(() => {
    window.showSaveFilePicker = async () => (await navigator.storage.getDirectory()).getFileHandle('project.trama', { create:true });
  });
  await page.getByText('Archivo del proyecto .trama', { exact:true }).click();
  await page.getByRole('button', { name:'Guardar en archivo .trama' }).click();
  await expect(page.locator('#save-state')).toContainText('Guardado en navegador y archivo');
  if (process.env.TRAMA_SCREENSHOTS) {
    for (const width of [1440, 1100]) {
      await page.setViewportSize({ width, height:900 });
      await page.screenshot({ path:join(process.env.TRAMA_SCREENSHOTS, `local-${width}.png`) });
    }
  }
  const readProjectFile = () => page.evaluate(async () => {
    const handle = await (await navigator.storage.getDirectory()).getFileHandle('project.trama');
    return (await handle.getFile()).text();
  });
  const initial = JSON.parse(await readProjectFile());
  expect(initial.name).toBe('Mi primer análisis');
  await page.reload();
  await expect(page.locator('#save-state')).toContainText('Guardado en navegador y archivo');
  await page.getByRole('button', { name:'Libro de códigos', exact:true }).click();
  await page.getByRole('button', { name:'+ Categoría', exact:true }).click();
  await page.getByLabel('Nombre', { exact:true }).fill('Prueba local');
  await page.getByRole('button', { name:'Guardar', exact:true }).click();
  await expect.poll(async () => JSON.parse(await readProjectFile()).categories.some(item => item.name === 'Prueba local')).toBe(true);

  await page.evaluate(() => {
    window.originalFilePermission = FileSystemFileHandle.prototype.queryPermission;
    FileSystemFileHandle.prototype.queryPermission = async () => 'prompt';
  });
  await page.getByRole('button', { name:'+ Categoría', exact:true }).click();
  await page.getByLabel('Nombre', { exact:true }).fill('Espera permiso');
  await page.getByRole('button', { name:'Guardar', exact:true }).click();
  await expect(page.locator('#save-state')).toContainText('Archivo requiere permiso');
  expect(JSON.parse(await readProjectFile()).categories.some(item => item.name === 'Espera permiso')).toBe(false);
  await page.evaluate(() => { FileSystemFileHandle.prototype.queryPermission = window.originalFilePermission; });
  await page.getByText('Archivo del proyecto .trama', { exact:true }).click();
  await page.getByRole('button', { name:'Autorizar archivo conectado' }).click();
  await expect(page.locator('#save-state')).toContainText('Guardado en navegador y archivo');
  expect(JSON.parse(await readProjectFile()).categories.some(item => item.name === 'Espera permiso')).toBe(true);

  await page.evaluate(async () => {
    const handle = await (await navigator.storage.getDirectory()).getFileHandle('project.trama');
    const writable = await handle.createWritable();
    await writable.write('cambio externo');
    await writable.close();
  });
  await page.getByRole('button', { name:'+ Categoría', exact:true }).click();
  await page.getByLabel('Nombre', { exact:true }).fill('Conservada en navegador');
  await page.getByRole('button', { name:'Guardar', exact:true }).click();
  await expect(page.locator('#save-state')).toContainText('Archivo modificado fuera');
  expect(await readProjectFile()).toBe('cambio externo');
  await page.evaluate(() => {
    window.showSaveFilePicker = async () => (await navigator.storage.getDirectory()).getFileHandle('project.trama');
  });
  await page.getByText('Archivo del proyecto .trama', { exact:true }).click();
  await page.getByRole('button', { name:'Guardar en archivo .trama' }).click();
  await expect(page.locator('#notice')).toContainText('ya contiene datos');
  expect(await readProjectFile()).toBe('cambio externo');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name:'Descargar archivo .trama' }).click();
  const backup = await pending;
  expect(backup.suggestedFilename()).toMatch(/\.trama$/);
  const recovered = JSON.parse(await (await backup.createReadStream()).toArray().then(parts => Buffer.concat(parts).toString('utf8')));
  expect(recovered.categories.some(item => item.name === 'Conservada en navegador')).toBe(true);
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name:'Restaurar respaldo', exact:true }).click();
  await (await chooser).setFiles(await backup.path());
  await expect(page.getByRole('heading', { name:'Mi primer análisis (restaurado)' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('project file follows changes from another window', async ({ page, context }) => {
  await serveBuild(context);
  await page.goto('https://trama-local.test/');
  await page.getByRole('button', { name:'Explorar un ejemplo' }).click();
  await page.evaluate(() => {
    window.showSaveFilePicker = async () => (await navigator.storage.getDirectory()).getFileHandle('shared.trama', { create:true });
  });
  await page.getByText('Archivo del proyecto .trama', { exact:true }).click();
  await page.getByRole('button', { name:'Guardar en archivo .trama' }).click();
  await expect(page.locator('#save-state')).toContainText('Guardado en navegador y archivo');
  const second = await context.newPage();
  await second.goto('https://trama-local.test/');
  await second.getByRole('button', { name:'Libro de códigos', exact:true }).click();
  await second.getByRole('button', { name:'+ Categoría', exact:true }).click();
  await second.getByLabel('Nombre', { exact:true }).fill('Desde otra ventana');
  await second.getByRole('button', { name:'Guardar', exact:true }).click();
  await expect.poll(() => page.evaluate(async () => {
    const handle = await (await navigator.storage.getDirectory()).getFileHandle('shared.trama');
    return JSON.parse(await (await handle.getFile()).text()).categories.some(item => item.name === 'Desde otra ventana');
  })).toBe(true);
  await page.getByRole('button', { name:'Libro de códigos', exact:true }).click();
  await expect(page.getByText('Desde otra ventana', { exact:true })).toBeVisible();
});

test('a frozen clock cannot hide concurrent edits or an undo from the file revision', async ({ page, context }) => {
  await context.addInitScript(() => {
    const NativeDate = Date;
    const fixed = NativeDate.parse('2026-01-01T12:00:00.000Z');
    window.Date = class extends NativeDate {
      constructor(...args) { if (args.length) super(...args); else super(fixed); }
      static now() { return fixed; }
    };
  });
  await serveBuild(context);
  await page.goto('https://trama-local.test/');
  await page.getByRole('button', { name:'Explorar un ejemplo' }).click();
  await page.evaluate(() => {
    window.showSaveFilePicker = async () => (await navigator.storage.getDirectory()).getFileHandle('clock.trama', { create:true });
  });
  await page.getByText('Archivo del proyecto .trama', { exact:true }).click();
  await page.getByRole('button', { name:'Guardar en archivo .trama' }).click();
  await expect(page.locator('#save-state')).toContainText('Guardado en navegador y archivo');
  const initial = (await localProjects(page))[0];

  const other = await context.newPage();
  await other.goto('https://trama-local.test/');
  await other.getByRole('button', { name:'Libro de códigos', exact:true }).click();
  await other.getByRole('button', { name:'+ Categoría', exact:true }).click();
  await other.getByLabel('Nombre', { exact:true }).fill('Edición atrasada');

  await page.getByRole('button', { name:'Libro de códigos', exact:true }).click();
  await page.getByRole('button', { name:'+ Categoría', exact:true }).click();
  await page.getByLabel('Nombre', { exact:true }).fill('Edición conservada');
  await page.getByRole('button', { name:'Guardar', exact:true }).click();
  await expect(page.locator('#dialog')).not.toBeVisible();
  const saved = (await localProjects(page))[0];
  expect(Date.parse(saved.updatedAt)).toBeGreaterThan(Date.parse(initial.updatedAt));

  await other.getByRole('button', { name:'Guardar', exact:true }).click();
  await expect(other.locator('.form-error')).toContainText('cambió en otra pestaña');
  let file = await page.evaluate(async () => JSON.parse(await (await (await navigator.storage.getDirectory()).getFileHandle('clock.trama')).getFile().then(item => item.text())));
  expect(file.categories.some(item => item.name === 'Edición conservada')).toBe(true);
  expect(file.categories.some(item => item.name === 'Edición atrasada')).toBe(false);

  await page.getByRole('button', { name:'Deshacer: Categoría creada' }).click();
  const undone = (await localProjects(page))[0];
  expect(Date.parse(undone.updatedAt)).toBeGreaterThan(Date.parse(saved.updatedAt));
  await expect.poll(async () => page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const file = await (await root.getFileHandle('clock.trama')).getFile();
    return JSON.parse(await file.text()).updatedAt;
  })).toBe(undone.updatedAt);
  file = await page.evaluate(async () => JSON.parse(await (await (await navigator.storage.getDirectory()).getFileHandle('clock.trama')).getFile().then(item => item.text())));
  expect(file.updatedAt).toBe(undone.updatedAt);
  expect(file.categories.some(item => item.name === 'Edición conservada')).toBe(false);
});

test('large backups can be restored after an explicit memory warning', async ({ page, context }) => {
  await page.addInitScript(() => {
    const originalSize = Object.getOwnPropertyDescriptor(Blob.prototype, 'size').get;
    Object.defineProperty(File.prototype, 'size', {
      configurable:true,
      get() { return this.name === 'large.trama' ? 100 * 1024 * 1024 + 1 : originalSize.call(this); },
    });
  });
  await serveBuild(context);
  await page.goto('https://trama-local.test/');
  const project = demoProject();
  const choose = async () => {
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name:'Restaurar un respaldo' }).click();
    await (await chooser).setFiles({ name:'large.trama', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(project)) });
  };
  await choose();
  await expect(page.getByRole('heading', { name:'Respaldo grande' })).toBeVisible();
  await page.getByRole('button', { name:'Cancelar', exact:true }).click();
  expect(await localProjects(page)).toHaveLength(0);

  await choose();
  await page.getByRole('button', { name:'Restaurar igualmente' }).click();
  await expect(page.getByRole('heading', { name:'Mi primer análisis (restaurado)' })).toBeVisible();
  const restored = (await localProjects(page))[0];
  expect(restored.documents).toEqual(project.documents);
  expect(restored.quotes).toEqual(project.quotes);
});

test('an incompatible local record does not hide valid projects and can be saved for recovery', async ({ page, context }) => {
  await serveBuild(context);
  await page.goto('https://trama-local.test/');
  await page.getByRole('button', { name:'Explorar un ejemplo' }).click();
  await page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('trama-cualitativa');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction('projects', 'readwrite');
      tx.objectStore('projects').put({ id:'incompatible', schemaVersion:999, name:'Registro de prueba' });
      tx.oncomplete = () => { open.result.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  }));
  await page.reload();
  await expect(page.getByRole('heading', { name:'Mi primer análisis' })).toBeVisible();
  await expect(page.locator('.rail-bottom')).toContainText('1 proyecto(s) incompatibles');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name:'Descargar copia de recuperación' }).click();
  const stream = await (await pending).createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  expect(JSON.parse(Buffer.concat(chunks).toString('utf8'))).toEqual([{ id:'incompatible', schemaVersion:999, name:'Registro de prueba' }]);
  expect(await localProjects(page)).toHaveLength(2);
});
