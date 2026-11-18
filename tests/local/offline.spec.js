import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

test.use({ serviceWorkers: 'allow' });

async function serveBuild(context, failRequest = () => false) {
  await context.route('https://trama-offline.test/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (failRequest(path)) return route.abort();
    const name = path === '/' ? 'index.html' : decodeURIComponent(path.slice(1));
    if (normalize(name).startsWith('..')) return route.abort();
    const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.woff2':'font/woff2', '.webmanifest':'application/manifest+json', '.png':'image/png', '.svg':'image/svg+xml' };
    try { await route.fulfill({ body: await readFile(join('dist', name)), contentType: types[extname(name)] || 'application/octet-stream' }); }
    catch { await route.abort(); }
  });
}

test('the installed worker opens the application and its projects without network', async ({ page, context }) => {
  await serveBuild(context);
  await page.goto('https://trama-offline.test/');
  await page.getByRole('button', { name:'Explorar un ejemplo' }).click();
  await expect(page.getByRole('heading', { name:'Mi primer análisis' })).toBeVisible();
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    if (registration.active.state !== 'activated') await new Promise(resolve => registration.active.addEventListener('statechange', resolve, { once:true }));
  });
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.unrouteAll({ behavior:'wait' });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name:'Mi primer análisis' })).toBeVisible();
  await page.getByRole('button', { name:'Libro de códigos', exact:true }).click();
  await expect(page.getByText('Coordinación informal', { exact:true }).first()).toBeVisible();
  const assets = await page.evaluate(async () => {
    const cache = await caches.open((await caches.keys()).find(key => key.startsWith('trama-qda-')));
    const keys = await cache.keys();
    const modules = keys.map(request => request.url).filter(url => /\/(mammoth\.browser|elk\.bundled)-.*\.js$/.test(url));
    await Promise.all(modules.map(url => import(url)));
    return modules.length;
  });
  expect(assets).toBe(2);
});

test('failed offline preparation is visible and a reload can recover', async ({ page, context }) => {
  let failIcon = true;
  await serveBuild(context, path => failIcon && path.endsWith('/icons/trama-192.png'));
  await page.goto('https://trama-offline.test/');
  await expect(page.locator('[data-offline-state]')).toContainText('Sin conexión no disponible');
  await expect(page.locator('#notice')).toContainText('No se pudo preparar el uso sin conexión');
  await page.getByRole('button', { name:'Instalar aplicación' }).click();
  await expect(page.locator('#notice')).toContainText('recarga antes de instalar');

  failIcon = false;
  await page.reload();
  await expect(page.locator('[data-offline-state]')).toHaveText('Preparada para usar sin conexión.');
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.unrouteAll({ behavior:'wait' });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name:'Crear mi proyecto' })).toBeVisible();
});

test('install button supports manual instructions and the native browser prompt', async ({ page, context }) => {
  await context.addInitScript(() => {
    window.addEventListener('beforeinstallprompt', event => {
      if (!event.tramaTest) { event.preventDefault(); event.stopImmediatePropagation(); }
    }, true);
  });
  await serveBuild(context);
  await page.goto('https://trama-offline.test/');
  await expect(page.locator('[data-offline-state]')).toHaveText('Preparada para usar sin conexión.');
  await page.getByRole('button', { name:'Instalar aplicación' }).click();
  await expect(page.getByRole('heading', { name:'Instalar TRAMA-QDA' })).toBeVisible();
  await expect(page.locator('#dialog')).toContainText('Chrome o Edge');
  await page.getByRole('button', { name:'Entendido' }).click();

  await page.getByRole('button', { name:'Explorar un ejemplo' }).click();
  await expect(page.getByRole('button', { name:'Instalar aplicación' })).toBeVisible();
  expect(await page.evaluate(() => {
    window.installCalls = 0;
    const event = new Event('beforeinstallprompt', { cancelable:true });
    event.tramaTest = true;
    event.prompt = async () => { window.installCalls += 1; };
    event.userChoice = Promise.resolve({ outcome:'accepted' });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  })).toBe(true);
  await page.getByRole('button', { name:'Instalar aplicación' }).click();
  expect(await page.evaluate(() => window.installCalls)).toBe(1);
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await expect(page.getByRole('button', { name:'Instalar aplicación' })).toHaveCount(0);
});
