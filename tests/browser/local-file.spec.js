import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

test('local project file saves changes, detects external edits and can be restored', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.context().route('https://trama-local.test/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const name = path === '/' ? 'index.html' : decodeURIComponent(path.slice(1));
    if (normalize(name).startsWith('..')) return route.abort();
    const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.woff2':'font/woff2', '.webmanifest':'application/manifest+json', '.png':'image/png', '.svg':'image/svg+xml' };
    try { await route.fulfill({ body: await readFile(join('dist', name)), contentType: types[extname(name)] || 'application/octet-stream' }); }
    catch { await route.abort(); }
  });
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
  const pending = page.waitForEvent('download');
  await page.getByText('Archivo del proyecto .trama', { exact:true }).click();
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
