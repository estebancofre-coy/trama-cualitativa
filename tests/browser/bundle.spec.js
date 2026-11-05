import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

test('Apps Script HTML bundle is self-contained and starts in private mode',async({page})=>{
  const html=readFileSync('dist-apps-script/Index.html','utf8');
  expect(html).not.toMatch(/<script[^>]+src=/i);
  expect(html).not.toMatch(/<link[^>]+rel="stylesheet"/i);
  expect(html).toMatch(/rel="icon"[^>]+href="data:image\/svg\+xml;base64,/);
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
    const runner={
      withSuccessHandler(fn) {this.success=fn;return this;},
      withFailureHandler(fn) {this.failure=fn;return this;},
      listCloudProjects() {setTimeout(()=>this.success([]),0);},
    };
    window.google={script:{run:runner}};
  });
  await page.route('https://trama-package.test/',route=>route.fulfill({contentType:'text/html',body:html}));
  await page.goto('https://trama-package.test/');
  await expect(page.getByRole('button',{name:'Crear mi proyecto'})).toBeVisible();
  await expect(page.getByText('Los proyectos se guardan en tu Drive privado.',{exact:true})).toBeVisible();
  expect(errors).toEqual([]);
});
