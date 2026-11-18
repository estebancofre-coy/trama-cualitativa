import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

test.use({ serviceWorkers: 'allow' });

test('the installed worker opens the application and its projects without network', async ({ page, context }) => {
  await context.route('https://trama-offline.test/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const name = path === '/' ? 'index.html' : decodeURIComponent(path.slice(1));
    if (normalize(name).startsWith('..')) return route.abort();
    const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.woff2':'font/woff2', '.webmanifest':'application/manifest+json', '.png':'image/png', '.svg':'image/svg+xml' };
    try { await route.fulfill({ body: await readFile(join('dist', name)), contentType: types[extname(name)] || 'application/octet-stream' }); }
    catch { await route.abort(); }
  });
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
