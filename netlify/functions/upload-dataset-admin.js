const {
  evaluateAccessPolicy,
  getSessionPayload,
  isAdminSession,
  isSameOrigin,
  jsonResponse,
  logAccess
} = require('./_auth');
const { ensureSchema } = require('./_db');
const { getPlainDataset, upsertPlainDataset } = require('./_plain_dataset');
const { loadRowsFromRemoteBuffer } = require('./_dataset_import');

const MAX_BODY_LENGTH = 16 * 1024 * 1024;

function cleanText(value, maxLength, fallback) {
  const text = String(value == null ? '' : value).trim();
  const finalValue = text || String(fallback || '');
  return finalValue.slice(0, maxLength || 500);
}

function readLargeJsonBody(event) {
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64').toString('utf8')
    : String(event.body || '');

  if (rawBody.length > MAX_BODY_LENGTH) {
    throw new Error('Payload too large');
  }
  if (!rawBody.trim()) return {};
  return JSON.parse(rawBody);
}

async function ensureAdminAccess(event) {
  const session = getSessionPayload(event);
  if (!session || !session.user) {
    await logAccess(event, 'upload_dataset_admin_unauthorized', 'warn', {});
    return { ok: false, response: jsonResponse(401, { ok: false, error: 'Unauthorized' }) };
  }

  if (!isAdminSession(session)) {
    await logAccess(event, 'upload_dataset_admin_forbidden_non_admin', 'warn', {}, session.user);
    return { ok: false, response: jsonResponse(403, { ok: false, error: 'Forbidden' }) };
  }

  const access = await evaluateAccessPolicy(event.headers || {});
  if (!access.allowed) {
    await logAccess(event, 'upload_dataset_admin_network_blocked', 'warn', {
      code: access.reason || '',
      ip: access.ip || ''
    }, session.user);
    return {
      ok: false,
      response: jsonResponse(403, { ok: false, error: 'Restricted network', code: access.reason || 'ip_not_whitelisted' })
    };
  }

  return { ok: true, session, access };
}

function decodeFileBuffer(fileBase64) {
  const raw = String(fileBase64 || '').trim();
  if (!raw) throw new Error('Fichier manquant');
  const normalized = raw.replace(/^data:.*;base64,/, '');
  const buffer = Buffer.from(normalized, 'base64');
  if (!buffer.length) throw new Error('Fichier vide');
  return buffer;
}

function buildSummary(loaded, fileName) {
  const rows = Array.isArray(loaded && loaded.rows) ? loaded.rows : [];
  const first = rows[0] || {};
  return {
    fileName: fileName || '',
    rowCount: rows.length,
    sheetName: loaded && loaded.sheetName ? loaded.sheetName : '',
    columns: Object.keys(first),
    sample: rows.slice(0, 3)
  };
}

function normalizeCell(value) {
  if (value == null) return '';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value instanceof Date) return value.toISOString();
  return String(value).trim().replace(/\s+/g, ' ');
}

function stableRowObject(row) {
  const source = row && typeof row === 'object' ? row : {};
  const output = {};
  Object.keys(source).sort().forEach((key) => {
    output[key] = normalizeCell(source[key]);
  });
  return output;
}

function buildRowBaseKey(row) {
  const candidates = [
    'N°- AO',
    'N° AO',
    'id',
    'ID',
    'Id',
    'Project ID',
    'Code projet',
    'projectId'
  ];
  for (const key of candidates) {
    const value = normalizeCell(row && row[key]);
    if (value) return `id:${value}`;
  }

  const composite = [
    normalizeCell(row && row['Date réception']),
    normalizeCell(row && row['Client']),
    normalizeCell(row && row['Dénomination']),
    normalizeCell(row && row['Type de projet (Activité)']),
    normalizeCell(row && row['Zone Géographique']),
    normalizeCell(row && row['Statut'])
  ].filter(Boolean);

  if (composite.length) return `cmp:${composite.join('|')}`;
  return `raw:${JSON.stringify(stableRowObject(row))}`;
}

function summarizeRow(row) {
  if (!row || typeof row !== 'object') return '(ligne vide)';
  const bits = [
    normalizeCell(row['N°- AO']) || normalizeCell(row['N° AO']),
    normalizeCell(row['Client']),
    normalizeCell(row['Dénomination']),
    normalizeCell(row['Date réception'])
  ].filter(Boolean);
  return bits.join(' · ') || JSON.stringify(stableRowObject(row)).slice(0, 180);
}

function buildRowIndex(rows) {
  const counters = new Map();
  const indexed = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const baseKey = buildRowBaseKey(row);
    const ordinal = (counters.get(baseKey) || 0) + 1;
    counters.set(baseKey, ordinal);
    const finalKey = `${baseKey}#${ordinal}`;
    indexed.set(finalKey, {
      key: finalKey,
      baseKey,
      row,
      stable: stableRowObject(row),
      stableJson: JSON.stringify(stableRowObject(row)),
      label: summarizeRow(row)
    });
  });
  return indexed;
}

function computeDiff(existingRows, importedRows) {
  const existing = buildRowIndex(existingRows);
  const incoming = buildRowIndex(importedRows);
  const added = [];
  const removed = [];
  const changed = [];
  const unchanged = [];
  const fieldCounts = {};

  incoming.forEach((entry, key) => {
    const previous = existing.get(key);
    if (!previous) {
      added.push({ label: entry.label, row: entry.row });
      return;
    }
    if (previous.stableJson === entry.stableJson) {
      unchanged.push({ label: entry.label, row: entry.row });
      return;
    }
    const changedFields = [];
    const keys = Array.from(new Set(Object.keys(previous.stable).concat(Object.keys(entry.stable))));
    keys.forEach((field) => {
      if ((previous.stable[field] || '') !== (entry.stable[field] || '')) {
        changedFields.push(field);
        fieldCounts[field] = (fieldCounts[field] || 0) + 1;
      }
    });
    changed.push({
      label: entry.label,
      row: entry.row,
      changedFields
    });
  });

  existing.forEach((entry, key) => {
    if (!incoming.has(key)) removed.push({ label: entry.label, row: entry.row });
  });

  return {
    existingRowCount: existing.size,
    incomingRowCount: incoming.size,
    addedCount: added.length,
    removedCount: removed.length,
    changedCount: changed.length,
    unchangedCount: unchanged.length,
    changedFieldLeaders: Object.entries(fieldCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([field, count]) => ({ field, count })),
    sampleAdded: added.slice(0, 3).map((item) => item.label),
    sampleRemoved: removed.slice(0, 3).map((item) => item.label),
    sampleChanged: changed.slice(0, 3).map((item) => ({
      label: item.label,
      changedFields: item.changedFields.slice(0, 6)
    }))
  };
}

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { ok: false, error: 'Method not allowed' });
  }

  if (!isSameOrigin(event.headers || {})) {
    return jsonResponse(403, { ok: false, error: 'Origin forbidden' });
  }

  try {
    await ensureSchema();
  } catch (err) {
    return jsonResponse(500, { ok: false, error: 'Database unavailable' });
  }

  const accessResult = await ensureAdminAccess(event);
  if (!accessResult.ok) return accessResult.response;

  let body;
  try {
    body = readLargeJsonBody(event);
  } catch (err) {
    await logAccess(event, 'upload_dataset_admin_invalid_body', 'warn', {
      error: err && err.message ? err.message : 'invalid_json'
    }, accessResult.session.user);
    return jsonResponse(400, { ok: false, error: err && err.message ? err.message : 'Invalid request body' });
  }

  const action = cleanText(body.action, 30, 'analyze').toLowerCase();
  const datasetKey = cleanText(body.datasetKey, 120, 'saip-main') || 'saip-main';
  const fileName = cleanText(body.fileName, 255, 'import.xlsx');
  const sourceName = cleanText(body.sourceName, 255, fileName || 'Import Excel manuel');
  const contentType = cleanText(body.contentType, 255, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

  let buffer;
  try {
    buffer = decodeFileBuffer(body.fileBase64);
  } catch (err) {
    return jsonResponse(400, { ok: false, error: err.message || 'Fichier invalide' });
  }

  let loaded;
  try {
    loaded = await loadRowsFromRemoteBuffer(buffer, { contentType: contentType });
  } catch (err) {
    await logAccess(event, 'upload_dataset_admin_parse_error', 'warn', {
      fileName: fileName,
      error: err && err.message ? err.message : 'parse_error'
    }, accessResult.session.user);
    return jsonResponse(400, { ok: false, error: err && err.message ? err.message : 'Fichier non exploitable' });
  }

  if (!loaded || !Array.isArray(loaded.rows) || !loaded.rows.length) {
    return jsonResponse(400, { ok: false, error: 'Aucune ligne importable détectée dans le fichier' });
  }

  let existingRecord = null;
  try {
    existingRecord = await getPlainDataset(datasetKey);
  } catch (_) {
    existingRecord = null;
  }
  const diff = computeDiff(existingRecord && existingRecord.data, loaded.rows);

  if (action === 'analyze') {
    await logAccess(event, 'upload_dataset_admin_analyze', 'info', {
      datasetKey: datasetKey,
      fileName: fileName,
      rowCount: loaded.rows.length,
      sheetName: loaded.sheetName || ''
    }, accessResult.session.user);
    return jsonResponse(200, {
      ok: true,
      action: 'analyze',
      datasetKey: datasetKey,
      summary: buildSummary(loaded, fileName),
      diff
    });
  }

  if (action !== 'import') {
    return jsonResponse(400, { ok: false, error: 'Action inconnue' });
  }

  try {
    const saved = await upsertPlainDataset(datasetKey, sourceName, loaded.rows, accessResult.session.user);
    await logAccess(event, 'upload_dataset_admin_import_success', 'info', {
      datasetKey: datasetKey,
      sourceName: sourceName,
      fileName: fileName,
      rowCount: saved.rowCount,
      sheetName: loaded.sheetName || ''
    }, accessResult.session.user);
    return jsonResponse(200, {
      ok: true,
      action: 'import',
      datasetKey: saved.datasetKey,
      sourceName: saved.sourceName,
      rowCount: saved.rowCount,
      updatedAt: saved.updatedAt,
      summary: buildSummary(loaded, fileName),
      diff
    });
  } catch (err) {
    await logAccess(event, 'upload_dataset_admin_import_error', 'error', {
      datasetKey: datasetKey,
      fileName: fileName,
      error: err && err.message ? err.message : 'import_error'
    }, accessResult.session.user);
    return jsonResponse(500, { ok: false, error: err && err.message ? err.message : 'Import impossible' });
  }
};
