# Contexto del proyecto

TRAMA-QDA es una herramienta de análisis cualitativo de datos (QDA) en español, inspirada en ATLAS.ti, para codificar manualmente entrevistas (TXT/DOCX) conservando trazabilidad entre categorías, códigos, citas y documentos. Es una app 100% navegador (sin backend ni servicios en la nube): los proyectos se guardan en IndexedDB, con respaldos descargables en JSON y `.trama`. Permite exportar el libro de códigos (CSV, DOCX, XLSX) con sus citas asociadas, construir mapas de relaciones y preparar prompts acotados para pegar en chats externos de IA (sin integración de API).

## Stack tecnológico
- Lenguaje / runtime: JavaScript (ES modules), Node.js
- Framework/bundler: Vite 6 (sin framework de UI; DOM vanilla en `src/main.js`)
- Persistencia: IndexedDB en el navegador (`src/storage.js`), sin base de datos de servidor
- Librerías clave: `elkjs` (layout automático de mapas), `jszip` (export `.trama`/paquetes), `mammoth` (import DOCX)
- Testing: `node --test` (unitarios, `tests/domain.test.js`, `tests/offline.test.js`) y Playwright (`tests/browser/`, `tests/local/`)

## Comandos clave
- Instalar dependencias: `npm install`
- Levantar en desarrollo: `npm run dev` (o `npm run dev:local` en puerto fijo 4174)
- Ejecutar tests unitarios: `npm test`
- Ejecutar tests E2E (Playwright): `npm run test:e2e`
- Ejecutar suite local/offline/PWA: `npm run test:local`
- Build de producción: `npm run build`
- Previsualizar build: `npm run preview`

No hay script de lint/format configurado en `package.json`; no inventar uno sin confirmarlo antes.

## Estructura del proyecto
- `src/main.js`: lógica principal de UI y orquestación de la aplicación (vanilla JS, sin framework)
- `src/domain.js`: modelo de dominio (proyectos, categorías, códigos, citas, relaciones)
- `src/storage.js`: persistencia en IndexedDB, conexión/sincronización con archivo `.trama` local
- `src/codebook-export.js`: exportación del libro de códigos (CSV, DOCX, XLSX) con citas asociadas
- `src/map-layout.js`: layouts automáticos de mapas de relaciones (ELK)
- `src/release-notes.js`: datos de versión/novedades mostrados en la app
- `src/service-worker.js`: soporte offline/PWA
- `tests/domain.test.js`, `tests/offline.test.js`: pruebas unitarias (`node --test`)
- `tests/browser/`: pruebas E2E Playwright sobre la app en navegador
- `tests/local/`: pruebas E2E de modo offline/instalable y archivo de proyecto local
- `PRODUCT.md`: contexto de producto (usuarios, alcance, principios) — fuente de verdad sobre qué construir
- `DESIGN.md`: sistema de diseño (tokens, componentes) usado por la skill impeccable

## Convenciones de código
- JavaScript con módulos ES (`type: module`); evitar introducir TypeScript o frameworks de UI sin consultar antes.
- Nombrar funciones y variables en `camelCase`; mantener el estilo vanilla DOM existente en `src/main.js`.
- Todo texto de interfaz en español, consistente con el resto de la app.
- Las pruebas nuevas van junto a las existentes: lógica de dominio en `tests/domain.test.js` (o un archivo unitario análogo), flujos de usuario en `tests/browser/*.spec.js`, comportamiento offline/instalable en `tests/local/*.spec.js`.
- Toda funcionalidad nueva debe incluir pruebas que fallarían sin el cambio.
- Antes de un commit, correr al menos `npm test` y, si el cambio toca UI o flujos de usuario, también `npm run test:e2e`.

## Restricciones (qué NO hacer)
- No reintroducir dependencias de Google Drive/Sheets/Apps Script ni ninguna sincronización con servicios externos: la app es exclusivamente local/navegador (decisión explícita del usuario).
- No incluir transcripciones completas de entrevistas ni el corpus íntegro en exportaciones de prompts o del libro de códigos; solo citas literales acotadas con su localizador.
- No enviar datos de investigación a servicios de IA mediante integración automática; los prompts se exportan para pegarlos manualmente en chats externos.
- No desarrollar funciones ni adaptaciones para móvil (uso exclusivo en PC de escritorio).
- No commitear archivos `.env`, credenciales, ni datos de investigación/entrevistas reales (no forman parte del repositorio).
- No instalar nuevas dependencias sin consultar antes.
- No hacer push a `main` ni activar el despliegue de GitHub Pages sin confirmación explícita del usuario.
