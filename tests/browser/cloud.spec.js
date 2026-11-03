import { test, expect } from '@playwright/test';

async function mockCloud(page) {
  await page.addInitScript(()=>{
    window.__TRAMA_CLOUD__=true;
    const projects=JSON.parse(localStorage.getItem('mock-cloud')||'{}');
    let fail=false;
    window.__failCloud=()=>{fail=true;};
    function runner(success=()=>{},failure=()=>{}) {
      const methods={
        withSuccessHandler:fn=>runner(fn,failure),withFailureHandler:fn=>runner(success,fn),
        listCloudProjects:()=>setTimeout(()=>success(Object.values(projects)),5),
        saveCloudProject:(p,expected,operation)=>setTimeout(()=>{
          if(fail) {fail=false;failure({message:'Conexión de prueba interrumpida'});return;}
          const current=projects[p.id];
          if(current?.cloudRevision===operation) {success({project:current,revision:operation});return;}
          if((current&&current.updatedAt!==expected)||(!current&&expected!==null)) {failure({message:'CONFLICTO'});return;}
          const saved={...p,updatedAt:new Date().toISOString(),cloudRevision:operation};
          projects[p.id]=saved;localStorage.setItem('mock-cloud',JSON.stringify(projects));
          success({project:saved,revision:operation,indexesStale:true});
        },15),
      };
      return methods;
    }
    window.google={script:{run:runner()}};
  });
}
test('private mode confirms Drive saves and recovers failed changes without silent overwrite',async({page})=>{
  await mockCloud(page);await page.goto('/');
  await expect(page.getByText('Los proyectos se guardan en tu Drive privado.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Explorar un ejemplo'}).click();
  await expect(page.locator('#save-state')).toHaveText('Guardado en Drive privado');
  await page.evaluate(()=>window.__failCloud());
  await page.getByRole('button',{name:'Ajustes',exact:true}).click();
  await page.getByLabel('Nombre del proyecto').fill('Cambio pendiente en Drive');
  await page.getByRole('button',{name:'Guardar ajustes'}).click();
  await expect(page.locator('.form-error')).toContainText('No se confirmó');
  await page.getByRole('button',{name:'Cancelar',exact:true}).click();
  await page.getByRole('button',{name:/Recuperación local/}).click();
  await expect(page.getByRole('heading',{name:'Cambio pendiente en Drive'})).toBeVisible();
  await page.getByRole('button',{name:'Reintentar confirmación'}).click();
  await expect(page.locator('.topbar h1')).toHaveText('Cambio pendiente en Drive');
  await page.reload();
  await expect(page.locator('.topbar h1')).toHaveText('Cambio pendiente en Drive');
  await page.getByRole('button',{name:/Recuperación local/}).click();
  await expect(page.getByText('No hay intentos pendientes en este navegador.')).toBeVisible();
});
test('cloud flag never silently falls back to local project storage',async({page})=>{
  await page.addInitScript(()=>{window.__TRAMA_CLOUD__=true;});
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'No se pudo abrir Drive privado'})).toBeVisible();
  await expect(page.locator('#notice')).toContainText('Apps Script no está disponible');
});
