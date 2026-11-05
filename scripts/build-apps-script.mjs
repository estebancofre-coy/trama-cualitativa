import { build } from 'vite';
import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import JSZip from 'jszip';

await build({
  configFile: false,
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist-apps-script',
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    rollupOptions: { output: { inlineDynamicImports: true, entryFileNames: 'app.js', assetFileNames: '[name][extname]' } },
  },
});
const dir = 'dist-apps-script';
let html = await readFile(join(dir, 'index.html'), 'utf8');
const js = await readFile(join(dir, 'app.js'), 'utf8');
const css = await readFile(join(dir, 'style.css'), 'utf8');
const mark = await readFile('src/assets/trama-qda-mark.svg');
html = html.replace(/<script type="module"[^>]*src="[^"]+"[^>]*><\/script>/, () =>
  `<script>window.__TRAMA_CLOUD__ = true;</script><script type="module">${js.replace(/<\/script/gi, '<\\/script')}</script>`);
html = html.replace(/<link rel="stylesheet"[^>]*>/, () => `<style>${css}</style>`);
html = html.replace(/(<link[^>]+rel="icon"[^>]+href=")[^"]+("[^>]*>)/, (_, prefix, suffix) => `${prefix}data:image/svg+xml;base64,${mark.toString('base64')}${suffix}`);
html = html.replace('<head>', '<head><base target="_top">');
await writeFile(join(dir, 'Index.html'), html);
const domain = (await readFile('src/domain.js', 'utf8'))
  .replace(/^export /gm, '')
  .replace('const uid = () => crypto.randomUUID();', 'const uid = () => Utilities.getUuid();');
await writeFile(join(dir, 'Domain.gs'), domain);
await copyFile('apps-script/Code.gs', join(dir, 'Code.gs'));
await copyFile('apps-script/appsscript.json', join(dir, 'appsscript.json'));
await copyFile('docs/INSTALAR-GOOGLE.md', join(dir, 'INSTALAR-GOOGLE.md'));
if (/<script[^>]+src=|<link[^>]+rel="stylesheet"/i.test(html)) throw new Error('El paquete Google contiene recursos externos sin integrar.');
const zip = new JSZip();
for (const name of ['Code.gs', 'Domain.gs', 'Index.html', 'appsscript.json', 'INSTALAR-GOOGLE.md']) {
  zip.file(name, await readFile(join(dir, name)));
}
const archive = join(dir, 'TRAMA-QDA-instalacion-Google.zip');
await writeFile(archive, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
console.log(`Paquete privado listo: ${archive}. Incluye los cuatro archivos de Apps Script y la guia de instalacion.`);
