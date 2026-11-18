import JSZip from 'jszip';
import { codePath, csv, location } from './domain.js';

export const codebookFormats = [
  { id: 'csv', name: 'CSV (.csv)', type: 'text/csv;charset=utf-8' },
  { id: 'docx', name: 'Word (.docx)', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  { id: 'xlsx', name: 'Excel (.xlsx)', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
];

function codebookRows(project) {
  const rows = [['ID', 'Ruta', 'Definición', 'Incluir', 'Excluir', 'ID cita', 'Cita literal', 'Origen']];
  const evidence = new Map(project.codes.map(code => [code.id, []]));
  for (const quote of project.quotes) {
    const fields = [quote.id, quote.text, location(project, quote)];
    for (const id of new Set(quote.codeIds)) evidence.get(id)?.push(fields);
  }
  for (const code of project.codes) {
    const fields = [code.id, codePath(project, code.id), code.description, code.inclusion, code.exclusion];
    const quotes = evidence.get(code.id);
    if (!quotes.length) rows.push([...fields, '', '', '']);
    else for (const quote of quotes) rows.push([...fields, ...quote]);
  }
  return rows.map(row => row.map(value => String(value ?? '')));
}

const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const contentNs = 'http://schemas.openxmlformats.org/package/2006/content-types';
const relNs = 'http://schemas.openxmlformats.org/package/2006/relationships';
const officeRelNs = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const wordNs = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const sheetNs = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

function xmlText(value) {
  return value
    .replace(/[^\u0009\u000a\u000d\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/gu, '\uFFFD')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function officePackage(zip, entry, parts) {
  const overrides = Object.entries(parts).map(([path, [type, body]]) => {
    zip.file(path, xml + body);
    return `<Override PartName="/${path}" ContentType="application/vnd.openxmlformats-officedocument.${type}+xml"/>`;
  }).join('');
  zip.file('[Content_Types].xml', `${xml}<Types xmlns="${contentNs}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${overrides}</Types>`);
  zip.file('_rels/.rels', `${xml}<Relationships xmlns="${relNs}"><Relationship Id="rId1" Type="${officeRelNs}/officeDocument" Target="${entry}"/></Relationships>`);
}

function wordRuns(value, bold) {
  return value.split(/(\r\n|\r|\n|\t)/).map(part => {
    const content = part === '\t' ? '<w:tab/>' : /^[\r\n]/.test(part) ? '<w:br/>' : `<w:t xml:space="preserve">${xmlText(part)}</w:t>`;
    return `<w:r><w:rPr>${bold ? '<w:b/>' : ''}<w:sz w:val="18"/></w:rPr>${content}</w:r>`;
  }).join('');
}

function writeWord(zip, rows) {
  const path = 'word/document.xml';
  const widths = [1250, 2050, 2050, 1400, 1400, 1250, 3150, 1850];
  const grid = widths.map(width => `<w:gridCol w:w="${width}"/>`).join('');
  const table = rows.map((row, i) => {
    const cells = row.map((value, col) => `<w:tc><w:tcPr><w:tcW w:w="${widths[col]}" w:type="dxa"/>${i === 0 ? '<w:shd w:fill="E3EFEB"/>' : ''}</w:tcPr><w:p>${wordRuns(value, i === 0)}</w:p></w:tc>`).join('');
    return `<w:tr>${i === 0 ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${cells}</w:tr>`;
  }).join('');
  const borders = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(side => `<w:${side} w:val="single" w:sz="4" w:color="B6C8CF"/>`).join('');
  const document = `<w:document xmlns:w="${wordNs}"><w:body><w:p><w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr><w:t>Libro de códigos</w:t></w:r></w:p><w:tbl><w:tblPr><w:tblW w:w="14400" w:type="dxa"/><w:tblBorders>${borders}</w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${table}</w:tbl><w:sectPr><w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="360" w:footer="360" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  officePackage(zip, path, { [path]: ['wordprocessingml.document.main', document] });
}

function writeExcel(zip, rows) {
  if (rows.length > 1048576 || rows.some(row => row.some(value => value.length > 32767))) {
    throw new Error('El libro supera el límite de filas o de texto por celda de Excel. Descárgalo en Word o CSV.');
  }
  const cells = rows.map((row, i) => `<row r="${i + 1}">${row.map((value, col) => {
    // Protect literal Open XML escape sequences before encoding carriage returns.
    const text = xmlText(value.replace(/_x[0-9a-f]{4}_/gi, match => `_x005F_${match.slice(1)}`).replaceAll('\r', '_x000D_'));
    return `<c r="${'ABCDEFGH'[col]}${i + 1}" s="${i === 0 ? 2 : 1}" t="inlineStr"><is><t xml:space="preserve">${text}</t></is></c>`;
  }).join('')}</row>`).join('');
  const cols = [23, 38, 42, 30, 30, 23, 60, 42].map((width, i) => `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`).join('');
  const workbook = 'xl/workbook.xml';
  const sheet = `<worksheet xmlns="${sheetNs}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${cells}</sheetData><autoFilter ref="A1:H${rows.length}"/></worksheet>`;
  const styles = `<styleSheet xmlns="${sheetNs}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  zip.file('xl/_rels/workbook.xml.rels', `${xml}<Relationships xmlns="${relNs}"><Relationship Id="rId1" Type="${officeRelNs}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${officeRelNs}/styles" Target="styles.xml"/></Relationships>`);
  officePackage(zip, workbook, {
    [workbook]: ['spreadsheetml.sheet.main', `<workbook xmlns="${sheetNs}" xmlns:r="${officeRelNs}"><bookViews><workbookView/></bookViews><sheets><sheet name="Libro de códigos" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    'xl/worksheets/sheet1.xml': ['spreadsheetml.worksheet', sheet],
    'xl/styles.xml': ['spreadsheetml.styles', styles],
  });
}

export async function exportCodebook(project, formatId) {
  const format = codebookFormats.find(candidate => candidate.id === formatId);
  if (!format) throw new Error('Elige un formato válido para exportar el libro de códigos.');
  const rows = codebookRows(project);
  if (format.id === 'csv') return { content: csv(rows), type: format.type };
  const zip = new JSZip();
  if (format.id === 'docx') writeWord(zip, rows);
  else writeExcel(zip, rows);
  return { content: await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }), type: format.type };
}
