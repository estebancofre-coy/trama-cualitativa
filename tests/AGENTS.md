# Testing en TRAMA-QDA

Convenciones, estructura y mejores prácticas para pruebas unitarias, offline/PWA e integración.

## Estructura de tests

- `tests/domain.test.js`: pruebas unitarias del modelo de dominio (`src/domain.js`) usando `node --test`
- `tests/offline.test.js`: verifica que el service worker precachea todos los assets y sirve la app offline
- `tests/browser/`: tests E2E con Playwright (`*.spec.js`) simulando navegación, interacción y flujos de usuario completos
  - `app.spec.js`: flujo manual de codificación, mapas, respaldos, persistencia, deshacer, etc.
  - `codebook.spec.js`: exportación del libro de códigos con citas asociadas (CSV, DOCX, XLSX)
  - `research.spec.js`: preguntas de investigación, objetivos, prompts externos, autovalidación
  - `maps.spec.js`: construcción, sincronización y persistencia de mapas de relaciones
- `tests/local/`: tests E2E de modo offline/instalable y sincronización con archivos `.trama` locales
  - `offline.spec.js`: app instalable, fallo de preparación offline, reinstalación manual
  - `local-file.spec.js`: carga/guardado de proyecto local, detección de cambios externos, restauración ante conflictos

## Convenciones de tests

### Unitarios (`node --test`)
- Archivo: `tests/domain.test.js`
- Debe fallar sin la implementación: no escribir tests que solo repitan la lógica de código
- Cobertura de casos límite (inputs inválidos, restricciones globales, decodificación manual vs. automática)
- Importar solo `src/domain.js` (es el único módulo testeable como unidad; `src/storage.js`, `main.js`, etc. requieren DOM/IndexedDB/navegador)

### E2E Playwright (`tests/browser/` y `tests/local/`)
- Archivo: `*.spec.js` con la convención `tests/browser/name.spec.js`
- Usar `page.goto()` contra el servidor local (`http://127.0.0.1:5173`)
- **No** hacer asserts sobre contenido exacto de UI si es frágil a cambios de texto; usar selectores estables (IDs, roles ARIA, data-testid si es necesario)
- Esperar elementos dinámicos: `page.waitForSelector()` antes de `.click()` o `.fill()`
- Verificar comportamiento observable: cambio de estado, persistencia, error handling, etc.
- Offline/local: usar `playwright-local.config.js` que arranca el servidor en modo local/PWA

### Notas de testing
- **Antes de commit**: correr `npm test` (unitarios) + `npm run test:e2e` (todos los E2E)
- **Suite local/offline**: `npm run test:local` = build + offline unit + E2E local/PWA
- No hay tests para la exportación de prompts externos (JSON) ni para importación de respuestas JSON — eso se verifica en `codebook.spec.js` y `research.spec.js` con flujos completos
- Los tests **no** usan datos de investigación reales (entrevistas, proyectos, citas)
- Si un test falla tras tu cambio, el cambio está roto: arreglalo antes de commitear

## Fallos frecuentes y soluciones

| Problema | Causa | Solución |
|----------|-------|----------|
| Playwright timeout en `page.waitForSelector()` | Elemento no renderizado o no espera suficiente | Aumentar timeout: `page.waitForSelector(sel, { timeout: 10000 })` o inspeccionar por qué no renderiza |
| Test falla solo en `test:e2e` pero no en `test:local` | Dependencia de estado/caché previo o diferencia de config | Limpiar `test-results/`, checkear `playwright.config.js` vs. `playwright-local.config.js` |
| "Service Worker not activated" en offline.test.js | Service worker no registrado o falla de precache | Verificar que `src/service-worker.js` mapea todos los assets; correr `npm run build` primero |
| Fallo flaky (a veces pasa, a veces no) | Race condition o timing insuficiente | Agregar `page.waitForFunction()` o pequeña espera (`page.waitForTimeout()` como último recurso) |

## Nuevos tests: checklist
- [ ] ¿El test falla sin tu cambio? (implementación first)
- [ ] ¿Estoy testando comportamiento, no detalles de UI? (selectores estables, asserts observables)
- [ ] ¿Limpié estado anterior? (no dependencias de otros tests)
- [ ] ¿Corré `npm test` + `npm run test:e2e` y pasaron?
- [ ] ¿El commit message describe qué se prueba, no solo qué código cambió?
