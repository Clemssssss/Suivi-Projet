const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { ensureSchema } = require('../netlify/functions/_db');
const { upsertSecureDataset } = require('../netlify/functions/_secure_dataset');

const EXPECTED_SCHEMA = [
  'Date réception','Client','Dénomination','Emetteur','Receveur','Zone Géographique',
  'Type de projet (Activité)','Bud','Puissance (MWc)','Win proba','CA win proba',
  'Statut','MG Statut Odoo MG','Date de retour demandée','GoNogo','N°- AO',
  'Carte Planner oui/non','Décidé le','Date de démarrage VRD prévisionnelle',
  'Date de démarrage GE prévisionnelle','Date de MSI prévisionnelle','Commentaires'
];

const DATE_FIELDS = new Set([
  'Date réception','Date de retour demandée','Décidé le','Décidé le ',
  'Date de démarrage VRD prévisionnelle','Date de démarrage GE prévisionnelle','Date de MSI prévisionnelle'
]);
const MONTANT_FIELDS = new Set(['Bud', 'CA win proba']);
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
  let s = String(v).trim().replace(/[\u20AC\$\u00A3\u00A0\u202F\s]/g, '');
  if (!s || s === '-') return null;
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
    .replace(/^["'\u201C\u201D]/g, '')
    .replace(/["'\u201C\u201D]$/g, '')
    .replace(/[\u200B\u200C\u200D\u00A0\uFEFF]/g, '')
    .trim());
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
      else if (header === 'Zone Géographique') obj[header] = normalizeZone(raw) || nvClean(raw);
      else if (header === 'Statut' || header.toLowerCase() === 'statut') obj[header] = nvClean(raw);
      else if (NUM_FIELDS.has(header)) {
        const n = parseFloat(raw);
        obj[header] = Number.isNaN(n) ? nvClean(raw) : n;
      } else obj[header] = nvClean(raw);
    });

    if (!obj.id) obj.id = rowOffset + rowIndex + 1;
    if (!obj.notes) obj.notes = '';
    rows.push(obj);
  }
  return rows;
}

function loadWorkbookRows(filePath) {
  const workbook = XLSX.readFile(filePath, { cellDates: true });
  let best = { score: -1, rows: [], sheetName: '' };
  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
    if (!matrix || !matrix.length) return;
    const headerIndex = findHeaderRowIndex(matrix);
    const score = scoreHeaderCandidate(matrix[headerIndex] || []);
    if (score > best.score) {
      const headers = (matrix[headerIndex] || []).map(sanitizeHeader);
      const rows = buildRows(headers, matrix.slice(headerIndex + 1), headerIndex + 1);
      best = { score, rows, sheetName };
    }
  });
  return best;
}

async function main() {
  const inputPath = process.argv[2];
  const datasetKey = process.argv[3] || 'saip-main';
  const actor = process.argv[4] || 'local-import';
  if (!inputPath) {
    throw new Error('Usage: node scripts/import_secure_dataset.js <xlsx-path> [datasetKey] [actor]');
  }
  const resolvedPath = path.resolve(inputPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error('Fichier introuvable : ' + resolvedPath);
  }

  const loaded = loadWorkbookRows(resolvedPath);
  if (!loaded.rows.length) {
    throw new Error('Aucune donnée importable trouvée dans le fichier');
  }

  await ensureSchema();
  const payload = {
    schemaVersion: 1,
    importedAt: new Date().toISOString(),
    sourcePath: path.basename(resolvedPath),
    sourceSheet: loaded.sheetName,
    data: loaded.rows
  };

  const saved = await upsertSecureDataset(datasetKey, path.basename(resolvedPath), payload, actor);
  console.log(JSON.stringify({
    ok: true,
    datasetKey: saved.datasetKey,
    sourceName: saved.sourceName,
    rowCount: saved.rowCount,
    sheetName: loaded.sheetName,
    updatedAt: saved.updatedAt
  }, null, 2));
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
