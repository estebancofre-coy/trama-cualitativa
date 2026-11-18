import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { addQuote, demoProject } from '../../src/domain.js';

const fixture = demoProject();
const [first, second] = fixture.codes;
const [source] = fixture.documents;
const outside = 'Línea de la entrevista que no se codificó';
const literal = '  =Cita «literal»; "<&>"\nsegundo renglón 🧵';
source.name = 'Entrevista ficticia <1>';
source.text = `${outside}\n${literal}\nOtra cita`;
fixture.quotes = [];
fixture.relations = [];
first.description = '\t+Descripción';
first.inclusion = 'Texto _x0041_ literal';
second.parentId = first.id;
const withoutQuote = { ...first, id: 'sin-cita', name: 'Código sin evidencia' };
fixture.codes.push(withoutQuote);
const start = outside.length + 1;
const shared = addQuote(fixture, source.id, start, start + literal.length, [first.id, second.id]);
const separate = addQuote(fixture, source.id, shared.end + 1, source.text.length, [first.id]);
const sharedFields = [shared.id, literal, `${source.name} · párr. 2, 3 · caracteres ${shared.start}–${shared.end}`];
const expected = [
  ['ID', 'Ruta', 'Definición', 'Incluir', 'Excluir', 'ID cita', 'Cita literal', 'Origen'],
  [first.id, 'Articulación institucional → Coordinación informal', first.description, first.inclusion, first.exclusion, ...sharedFields],
  [first.id, 'Articulación institucional → Coordinación informal', first.description, first.inclusion, first.exclusion, separate.id, 'Otra cita', `${source.name} · párr. 4 · caracteres ${separate.start}–${separate.end}`],
  [second.id, 'Articulación institucional → Coordinación informal → Continuidad de equipos', second.description, second.inclusion, second.exclusion, ...sharedFields],
  [withoutQuote.id, 'Articulación institucional → Código sin evidencia', withoutQuote.description, withoutQuote.inclusion, withoutQuote.exclusion, '', '', ''],
];

test('exports the codebook with every quote association', async ({ page }) => {
  await page.goto('/');
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Restaurar un respaldo' }).click();
  await (await chooser).setFiles({ name: 'proyecto.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture)) });

  await page.getByRole('button', { name: 'Libro de códigos', exact: true }).click();
  const format = page.getByRole('combobox', { name: 'Formato del libro de códigos' });
  const exportButton = page.getByRole('button', { name: 'Exportar libro' });
  for (const width of [1440, 1100]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(format).toBeInViewport();
    await expect(exportButton).toBeInViewport();
  }
  await expect(format).toHaveValue('csv');
  const requests = [];
  page.on('request', request => requests.push(request.url()));
  for (const extension of ['csv', 'docx', 'xlsx']) {
    if (extension !== 'csv') await format.selectOption(extension);
    const pending = page.waitForEvent('download');
    await exportButton.click();
    const download = await pending;
    const name = `${fixture.name} (restaurado)`;
    expect(download.suggestedFilename()).toBe(`${name}-libro.${extension}`);
    const bytes = await readFile(await download.path());
    if (extension === 'csv') {
      const csv = bytes.toString('utf8');
      expect(csv).not.toContain(outside);
      expect(csv.slice(0, 3)).toBe('\uFEFF"I');
      const cells = [...csv.slice(1).matchAll(/"((?:""|[^"])*)"([;\r]|$)/g)].map(match => match[1].replaceAll('""', '"'));
      const protectedValues = new Set([literal, first.description]);
      expect(cells).toEqual(expected.flat().map(value => protectedValues.has(value) ? `'${value}` : value));
      expect(csv).toContain('"Origen"\r\n');
      continue;
    }

    const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
    const parts = Object.fromEntries(await Promise.all(Object.values(zip.files).filter(file => !file.dir).map(async file => [file.name, await file.async('string')])));
    const actual = await page.evaluate(({ parts, extension }) => {
      const docs = Object.fromEntries(Object.entries(parts).map(([name, text]) => {
        const doc = new DOMParser().parseFromString(text, 'application/xml');
        if (doc.querySelector('parsererror')) throw new Error(`XML inválido: ${name}`);
        return [name, doc];
      }));
      const all = (root, name) => [...root.getElementsByTagNameNS('*', name)];
      const entry = all(docs['_rels/.rels'], 'Relationship').find(rel => rel.getAttribute('Type').endsWith('/officeDocument')).getAttribute('Target');
      if (extension === 'docx') {
        return all(docs[entry], 'tr').map(row => all(row, 'tc').map(cell => all(cell, 'r').flatMap(run => [...run.children]).map(el =>
          el.localName === 't' ? el.textContent : el.localName === 'br' ? '\n' : el.localName === 'tab' ? '\t' : '').join('')));
      }
      const sheet = docs['xl/worksheets/sheet1.xml'];
      if (!all(docs[entry], 'sheet').length || all(sheet, 'f').length) throw new Error('Libro sin hoja o con fórmulas');
      return all(sheet, 'row').map(row => all(row, 'c').map(cell => {
        if (cell.getAttribute('t') !== 'inlineStr') throw new Error('Celda no textual');
        return all(cell, 't')[0].textContent.replace(/_x([0-9a-f]{4})_/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
      }));
    }, { parts, extension });
    expect(Object.values(parts).join('\n')).not.toContain(outside);
    expect(actual).toEqual(expected);
  }
  expect(requests.filter(url => !url.startsWith('blob:'))).toEqual([]);
});
