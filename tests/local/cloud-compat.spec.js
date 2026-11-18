import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { demoProject } from '../../src/domain.js';

test('Apps Script keeps its Drive mode and does not register the local worker', async ({ page }) => {
  const project = demoProject();
  await page.addInitScript(value => {
    window.google = { script: { run: {
      withSuccessHandler(fn) { this.success = fn; return this; },
      withFailureHandler() { return this; },
      listCloudProjects() { queueMicrotask(() => this.success([value])); },
    } } };
  }, project);
  await page.route('https://trama-cloud.test/', async route => route.fulfill({
    contentType:'text/html', body:await readFile('dist-apps-script/Index.html', 'utf8'),
  }));
  await page.goto('https://trama-cloud.test/');
  await expect(page.getByRole('heading', { name:project.name })).toBeVisible();
  await expect(page.locator('#save-state')).toContainText('Guardado en Drive privado');
  await expect(page.getByText('Archivo del proyecto .trama')).toHaveCount(0);
  expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
});
