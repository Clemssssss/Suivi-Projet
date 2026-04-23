const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const EXPECTED_SCHEMA = [
  'Date réception','Client','Dénomination','Emetteur','Receveur','Zone Géographique',
  'Type de projet (Activité)','Bud','MB (€)','Puissance (MWc)','Win proba','CA win proba',
  'Statut','MG Statut Odoo MG','Date de retour demandée','GoNogo','N°- AO',
  'Carte Planner oui/non','Décidé le','Date de démarrage VRD prévisionnelle',
  'Date de démarrage GE prévisionnelle','Date de MSI prévisionnelle','Commentaires'
];
const EXPECTED_SCHEMA_NORMALIZED = new Set(EXPECTED_SCHEMA.map((header) => headerNorm(header)));

const DATE_FIELDS = new Set([
  'Date réception','Date de retour demandée','Décidé le','Décidé le ',
  'Date de démarrage VRD prévisionnelle','Date de démarrage GE prévisionnelle','Date de MSI prévisionnelle'
]);
const MONTANT_FIELDS = new Set(['Bud', 'MB (€)', 'CA win proba']);
const WINPROBA_FIELDS = new Set(['Win proba']);
const NUM_FIELDS = new Set(['Puissance (MWc)', '_annee', 'id']);
const HEADER_ALIAS_MAP = { 'Décidé le': 'Décidé le ', 'Décidé le ': 'Décidé le ' };

function canonicalHeader(h) {
  return HEADER_ALIAS_MAP[h] || h;
}

function nvClean(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s;
}

function sanitizeImportedText(v) {
  const cleaned = nvClean(v);
  if (!cleaned) return cleaned;
  return /^[=+\-@]/.test(cleaned) ? ("'" + cleaned) : cleaned;
}

function parseDate(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  const fr = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (fr) return `${fr[3]}-${String(fr[2]).padStart(2, '0')}-${String(fr[1]).padStart(2, '0')}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return nvClean(s);
}

function parseMontant(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).trim().replace(/[\u20AC\u0080\$\u00A3\u00A0\u202F\s]/g, '');
  if (!s || s === '-') return null;
  s = s.replace(/[^0-9,.\-]/g, '');
  const lc = s.lastIndexOf(',');
  const ld = s.lastIndexOf('.');
  if (lc === -1 && ld === -1) {
    const n = parseFloat(s);
    return Number.isNaN(n) ? null : n;
  }
  if (lc === -1) {
    const afterDot = s.slice(ld + 1);
    if (afterDot.length === 3 && s.indexOf('.') === ld) {
      const n = parseFloat(s.replace(/\./g, ''));
      return Number.isNaN(n) ? null : n;
    }
    const n = parseFloat(s);
    return Number.isNaN(n) ? null : n;
  }
  if (ld === -1) {
    const commaCount = (s.match(/,/g) || []).length;
    const afterComma = s.slice(lc + 1);
    if (commaCount > 1 || afterComma.length === 3) {
      const n = parseFloat(s.replace(/,/g, ''));
      return Number.isNaN(n) ? null : n;
    }
    const n = parseFloat(s.replace(',', '.'));
    return Number.isNaN(n) ? null : n;
  }
  if (lc > ld) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = parseFloat(s);
  return Number.isNaN(n) ? null : n;
}

function parseWinProba(raw) {
  if (raw === '' || raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (s.endsWith('%')) return s;
  const n = parseFloat(s);
  if (Number.isNaN(n)) return nvClean(raw);
  return (n > 1 ? n : Math.round(n * 100)) + '%';
}

function normalizeZone(v) {
  if (!v) return null;
  const map = {
    france: 'France',
    national: 'France',
    'france et belgique': 'France',
    'un peu partout': 'France',
    partout: 'France',
    'nord-est': 'Nord-Est',
    nordest: 'Nord-Est',
    'nord est': 'Nord-Est',
    'nord-ouest': 'Nord-Ouest',
    nordouest: 'Nord-Ouest',
    'nord ouest': 'Nord-Ouest',
    'sud-est': 'Sud-Est',
    sudest: 'Sud-Est',
    'sud est': 'Sud-Est',
    'sud-ouest': 'Sud-Ouest',
    sudouest: 'Sud-Ouest',
    'sud ouest': 'Sud-Ouest',
    dom: 'DOM-TOM',
    'dom-tom': 'DOM-TOM',
    guyane: 'DOM-TOM',
    guadeloupe: 'DOM-TOM',
    martinique: 'DOM-TOM',
    corse: 'Corse',
    europe: 'Europe'
  };
  const s = String(v).trim();
  return map[s.toLowerCase()] || s;
}

function headerNorm(h) {
  return String(h || '')
    .replace(/[\u0080]/g, '€')
    .replace(/[\uFEFF\u200B\u200C\u200D\u00A0\u2060]/g, '')
    .replace(/\u2019|\u2018|\u201C|\u201D/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function scoreHeaderCandidate(cells) {
  const expected = EXPECTED_SCHEMA.map(headerNorm);
  const normalized = cells.map((cell) => headerNorm(canonicalHeader(String(cell || '').trim())));
  let score = 0;
  normalized.forEach((cell) => {
    if (expected.includes(cell)) score += 1;
  });
  return score;
}

function findHeaderRowIndex(matrix) {
  let bestIndex = 0;
  let bestScore = -1;
  for (let i = 0; i < Math.min(matrix.length, 12); i += 1) {
    const score = scoreHeaderCandidate(matrix[i] || []);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  return bestScore >= 4 ? bestIndex : 0;
}

function sanitizeHeader(raw) {
  return canonicalHeader(String(raw || '')
    .replace(/[\u0080]/g, '€')
    .replace(/^["'\u201C\u201D]/g, '')
    .replace(/["'\u201C\u201D]$/g, '')
    .replace(/[\u200B\u200C\u200D\u00A0\uFEFF]/g, '')
    .trim());
}

function splitCsvLine(line, delimiter) {
  const cells = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === delimiter && !inQuotes) {
      cells.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current);
  return cells;
}

function detectCsvDelimiter(lines) {
  const sample = lines.slice(0, 5);
  const semicolons = sample.reduce((sum, line) => sum + ((line.match(/;/g) || []).length), 0);
  const commas = sample.reduce((sum, line) => sum + ((line.match(/,/g) || []).length), 0);
  return semicolons > commas ? ';' : ',';
}

function loadWorkbookRowsFromCsvText(text) {
  const normalized = String(text || '').replace(/^\uFEFF/, '');
  const lines = normalized.split(/\r?\n/).filter((line) => String(line || '').trim() !== '');
  if (!lines.length) return { score: -1, rows: [], sheetName: 'CSV' };
  const delimiter = detectCsvDelimiter(lines);
  const matrix = lines.map((line) => splitCsvLine(line, delimiter).map((cell) => cell.trim()));
  const headerIndex = findHeaderRowIndex(matrix);
  const headers = (matrix[headerIndex] || []).map(sanitizeHeader);
  const rows = buildRows(headers, matrix.slice(headerIndex + 1), headerIndex + 1);
  return { score: scoreHeaderCandidate(matrix[headerIndex] || []), rows, sheetName: 'CSV' };
}

function loadCsvRowsFromBuffer(buffer) {
  const raw = Buffer.from(buffer || []);
  const utf8 = loadWorkbookRowsFromCsvText(raw.toString('utf8'));
  const latin1 = loadWorkbookRowsFromCsvText(raw.toString('latin1'));
  if ((latin1.score || -1) > (utf8.score || -1)) return latin1;
  if ((utf8.score || -1) > (latin1.score || -1)) return utf8;
  return (latin1.rows && latin1.rows.length > utf8.rows.length) ? latin1 : utf8;
}

function bufferLooksLikeHtml(buffer) {
  const snippet = Buffer.from(buffer || []).slice(0, 512).toString('utf8').trim().toLowerCase();
  return snippet.startsWith('<!doctype html') || snippet.startsWith('<html') || snippet.includes('<head') || snippet.includes('<body');
}

function bufferLooksLikeZip(buffer) {
  if (!buffer || buffer.length < 4) return false;
  return buffer[0] === 0x50 && buffer[1] === 0x4b;
}

function bufferLooksLikeCsv(buffer, contentType) {
  const ct = String(contentType || '').toLowerCase();
  if (ct.includes('text/csv') || ct.includes('application/csv') || ct.includes('text/plain')) return true;
  const snippet = Buffer.from(buffer || []).slice(0, 1024).toString('utf8');
  if (!snippet.trim()) return false;
  if (bufferLooksLikeHtml(buffer)) return false;
  return /(;|,)/.test(snippet) && /\r?\n/.test(snippet);
}

function buildRows(headers, matrixRows, rowOffset) {
  const rows = [];
  for (let rowIndex = 0; rowIndex < matrixRows.length; rowIndex += 1) {
    const values = matrixRows[rowIndex] || [];
    const hasMeaningfulValue = values.some((v) => String(v === undefined || v === null ? '' : v).trim() !== '');
    if (!hasMeaningfulValue) continue;
    const obj = {};

    headers.forEach((header, i) => {
      const raw = values[i];
      if (DATE_FIELDS.has(header) || DATE_FIELDS.has(header.trim())) obj[header] = parseDate(raw);
      else if (MONTANT_FIELDS.has(header)) obj[header] = parseMontant(raw);
      else if (WINPROBA_FIELDS.has(header)) obj[header] = parseWinProba(raw);
      else if (header === 'Zone Géographique') obj[header] = normalizeZone(raw) || sanitizeImportedText(raw);
      else if (header === 'Statut' || header.toLowerCase() === 'statut') obj[header] = sanitizeImportedText(raw);
      else if (NUM_FIELDS.has(header)) {
        const n = parseFloat(raw);
        obj[header] = Number.isNaN(n) ? nvClean(raw) : n;
      } else obj[header] = sanitizeImportedText(raw);
    });

    if (!obj.id) obj.id = rowOffset + rowIndex + 1;
    if (!obj.notes) obj.notes = '';
    rows.push(obj);
  }
  return rows;
}

function normalizeObjectKeys(input) {
  const source = input && typeof input === 'object' ? input : {};
  const map = {};
  Object.keys(source).forEach((key) => {
    const normalized = headerNorm(canonicalHeader(String(key || '').trim()));
    if (!normalized) return;
    map[normalized] = source[key];
  });
  return map;
}

function normalizeImportedRowObjects(list) {
  const rows = Array.isArray(list) ? list : [];
  return rows.reduce((acc, item, rowIndex) => {
    const normalizedMap = normalizeObjectKeys(item);
    const source = item && typeof item === 'object' ? item : {};
    const row = {};

    EXPECTED_SCHEMA.forEach((header) => {
      const raw = normalizedMap[headerNorm(header)];
      if (DATE_FIELDS.has(header) || DATE_FIELDS.has(header.trim())) row[header] = parseDate(raw);
      else if (MONTANT_FIELDS.has(header)) row[header] = parseMontant(raw);
      else if (WINPROBA_FIELDS.has(header)) row[header] = parseWinProba(raw);
      else if (header === 'Zone Géographique') row[header] = normalizeZone(raw) || nvClean(raw);
      else if (header === 'Statut' || header.toLowerCase() === 'statut') row[header] = sanitizeImportedText(raw);
      else if (NUM_FIELDS.has(header)) {
        const n = parseFloat(raw);
        row[header] = Number.isNaN(n) ? nvClean(raw) : n;
      } else {
        row[header] = sanitizeImportedText(raw);
      }
    });

    // Preserve additional columns coming from upstream payloads (Power Automate, future schema updates).
    Object.keys(source).forEach((sourceKey) => {
      const canonical = sanitizeHeader(sourceKey);
      if (!canonical) return;
      if (EXPECTED_SCHEMA_NORMALIZED.has(headerNorm(canonical))) return;
      if (canonical === 'id' || canonical === 'notes') return;

      const raw = source[sourceKey];
      if (DATE_FIELDS.has(canonical) || DATE_FIELDS.has(canonical.trim())) row[canonical] = parseDate(raw);
      else if (MONTANT_FIELDS.has(canonical)) row[canonical] = parseMontant(raw);
      else if (WINPROBA_FIELDS.has(canonical)) row[canonical] = parseWinProba(raw);
      else if (canonical === 'Zone Géographique') row[canonical] = normalizeZone(raw) || sanitizeImportedText(raw);
      else if (NUM_FIELDS.has(canonical)) {
        const n = parseFloat(raw);
        row[canonical] = Number.isNaN(n) ? nvClean(raw) : n;
      } else row[canonical] = sanitizeImportedText(raw);
    });

    const hasMeaningfulValue = Object.values(row).some((value) => String(value == null ? '' : value).trim() !== '');
    if (!hasMeaningfulValue) return acc;

    row.id = Number(item && item.id) || (rowIndex + 1);
    if (!row.notes) row.notes = '';
    acc.push(row);
    return acc;
  }, []);
}

function extractExcelCellValue(cell) {
  if (!cell) return '';
  const value = cell.value;
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value;
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) {
      return value.richText.map((item) => item && item.text ? item.text : '').join('');
    }
    if (Object.prototype.hasOwnProperty.call(value, 'result')) return value.result;
    if (Object.prototype.hasOwnProperty.call(value, 'text')) return value.text;
    if (Object.prototype.hasOwnProperty.call(value, 'hyperlink')) return value.text || value.hyperlink;
    if (Object.prototype.hasOwnProperty.call(value, 'formula')) return value.result != null ? value.result : '';
  }
  return value;
}

async function loadWorkbookRowsFromWorkbook(workbook) {
  let best = { score: -1, rows: [], sheetName: '' };
  workbook.worksheets.forEach((sheet) => {
    const matrix = [];
    sheet.eachRow({ includeEmpty: true }, (row) => {
      const width = Math.max(row.cellCount || 0, row.actualCellCount || 0, 1);
      const values = [];
      for (let col = 1; col <= width; col += 1) {
        values.push(extractExcelCellValue(row.getCell(col)));
      }
      matrix.push(values);
    });
    if (!matrix.length) return;
    const headerIndex = findHeaderRowIndex(matrix);
    const score = scoreHeaderCandidate(matrix[headerIndex] || []);
    if (score > best.score) {
      const headers = (matrix[headerIndex] || []).map(sanitizeHeader);
      const rows = buildRows(headers, matrix.slice(headerIndex + 1), headerIndex + 1);
      best = { score, rows, sheetName: sheet.name };
    }
  });
  return best;
}

async function loadWorkbookRowsFromFile(filePath) {
  const resolvedPath = path.resolve(filePath);
  const ext = path.extname(resolvedPath).toLowerCase();

  if (ext === '.csv' || ext === '.tsv' || ext === '.txt') {
    const raw = fs.readFileSync(resolvedPath);
    return loadCsvRowsFromBuffer(raw);
  }

  if (ext === '.xlsx' || ext === '.xlsm' || ext === '.xlsb' || ext === '.xltx' || ext === '.xltm' || ext === '.xls') {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(resolvedPath);
    return loadWorkbookRowsFromWorkbook(workbook);
  }

  const raw = fs.readFileSync(resolvedPath);
  if (bufferLooksLikeHtml(raw)) {
    throw new Error('Le fichier semble etre une page HTML, pas un import Excel/CSV');
  }
  if (bufferLooksLikeZip(raw)) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(raw);
    return loadWorkbookRowsFromWorkbook(workbook);
  }
  if (bufferLooksLikeCsv(raw, '')) {
    return loadCsvRowsFromBuffer(raw);
  }

  throw new Error('Format local non pris en charge : attendu .xlsx ou CSV');
}

async function loadWorkbookRowsFromBuffer(buffer) {
  if (bufferLooksLikeHtml(buffer)) {
    throw new Error('Le lien renvoie une page HTML SharePoint/Office, pas un fichier téléchargeable direct');
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return loadWorkbookRowsFromWorkbook(workbook);
}

async function loadRowsFromRemoteBuffer(buffer, meta) {
  const contentType = meta && meta.contentType ? meta.contentType : '';
  if (bufferLooksLikeHtml(buffer)) {
    throw new Error('Le lien renvoie une page HTML SharePoint/Office, pas un fichier téléchargeable direct');
  }
  if (bufferLooksLikeZip(buffer)) {
    return loadWorkbookRowsFromBuffer(buffer);
  }
  if (bufferLooksLikeCsv(buffer, contentType)) {
    return loadCsvRowsFromBuffer(buffer);
  }
  throw new Error('Format distant non pris en charge : attendu .xlsx ou CSV exploitable');
}

function assertExistingFile(filePath) {
  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error('Fichier introuvable : ' + resolvedPath);
  }
  return resolvedPath;
}

module.exports = {
  loadWorkbookRowsFromFile,
  loadWorkbookRowsFromBuffer,
  loadRowsFromRemoteBuffer,
  loadWorkbookRowsFromCsvText,
  normalizeImportedRowObjects,
  assertExistingFile
};
