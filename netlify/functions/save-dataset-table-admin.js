const {
  evaluateAccessPolicy,
  getSessionPayload,
  isAdminSession,
  isSameOrigin,
  jsonResponse,
  logAccess
} = require('./_auth');
const { ensureSchema } = require('./_db');
const { getPlainDataset, upsertPlainDataset, DEFAULT_DATASET_KEY } = require('./_plain_dataset');

function readJsonBody(event) {
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64').toString('utf8')
    : String(event.body || '');
  return raw.trim() ? JSON.parse(raw) : {};
}

function normalizeCell(value) {
  if (value == null) return '';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

function stableRowJson(row) {
  const source = row && typeof row === 'object' ? row : {};
  const ordered = {};
  Object.keys(source).sort().forEach((key) => {
    if (String(key).indexOf('__') === 0) return;
    ordered[key] = normalizeCell(source[key]).trim();
  });
  return JSON.stringify(ordered);
}

function sanitizeRow(row) {
  const source = row && typeof row === 'object' ? row : {};
  const output = {};
  Object.keys(source).forEach((key) => {
    if (String(key).indexOf('__') === 0) return;
    output[key] = normalizeCell(source[key]);
  });
  return output;
}

function findMatchingRowIndex(rows, targetRow, usedIndexes) {
  const stableTarget = stableRowJson(targetRow);
  for (let index = 0; index < rows.length; index += 1) {
    if (usedIndexes && usedIndexes.has(index)) continue;
    if (stableRowJson(rows[index]) === stableTarget) return index;
  }
  return -1;
}

async function ensureAdmin(event) {
  const session = getSessionPayload(event);
  if (!session || !session.user) {
    await logAccess(event, 'save_dataset_table_admin_unauthorized', 'warn', {});
    return { ok: false, response: jsonResponse(401, { ok: false, error: 'Unauthorized' }) };
  }
  if (!isAdminSession(session)) {
    await logAccess(event, 'save_dataset_table_admin_forbidden', 'warn', {}, session.user);
    return { ok: false, response: jsonResponse(403, { ok: false, error: 'Forbidden' }) };
  }
  const access = await evaluateAccessPolicy(event.headers || {});
  if (!access.allowed) {
    await logAccess(event, 'save_dataset_table_admin_network_blocked', 'warn', {
      code: access.reason || '',
      ip: access.ip || ''
    }, session.user);
    return {
      ok: false,
      response: jsonResponse(403, { ok: false, error: 'Restricted network', code: access.reason || 'ip_not_whitelisted' })
    };
  }
  return { ok: true, session };
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
  } catch (_) {
    return jsonResponse(500, { ok: false, error: 'Database unavailable' });
  }

  const accessResult = await ensureAdmin(event);
  if (!accessResult.ok) return accessResult.response;

  let body;
  try {
    body = readJsonBody(event);
  } catch (err) {
    return jsonResponse(400, { ok: false, error: 'Invalid request body' });
  }

  const datasetKey = String(body.datasetKey || DEFAULT_DATASET_KEY).trim() || DEFAULT_DATASET_KEY;
  const changes = Array.isArray(body.changes) ? body.changes : [];
  const addedRows = Array.isArray(body.addedRows) ? body.addedRows : [];
  const deletedRows = Array.isArray(body.deletedRows) ? body.deletedRows : [];
  if (!changes.length && !addedRows.length && !deletedRows.length) {
    return jsonResponse(400, { ok: false, error: 'Aucune modification à sauvegarder' });
  }

  let record;
  try {
    record = await getPlainDataset(datasetKey);
  } catch (err) {
    record = null;
  }

  if (!record || !Array.isArray(record.data)) {
    return jsonResponse(404, { ok: false, error: 'Dataset introuvable' });
  }

  const rows = record.data.slice();
  const usedIndexes = new Set();
  const unmatched = [];
  let updatedCount = 0;
  let deletedCount = 0;
  let addedCount = 0;

  changes.forEach((change) => {
    const original = change && change.original && typeof change.original === 'object' ? change.original : null;
    const updated = change && change.updated && typeof change.updated === 'object' ? change.updated : null;
    if (!original || !updated) return;

    const matchIndex = findMatchingRowIndex(rows, original, usedIndexes);

    if (matchIndex === -1) {
      unmatched.push(original['Dénomination'] || original['Client'] || 'ligne');
      return;
    }

    usedIndexes.add(matchIndex);
    rows[matchIndex] = Object.assign({}, rows[matchIndex] || {}, sanitizeRow(updated));
    updatedCount += 1;
  });

  deletedRows.forEach((originalRow) => {
    if (!originalRow || typeof originalRow !== 'object') return;
    const matchIndex = findMatchingRowIndex(rows, originalRow);
    if (matchIndex === -1) {
      unmatched.push(originalRow['Dénomination'] || originalRow['Client'] || 'ligne');
      return;
    }
    rows.splice(matchIndex, 1);
    deletedCount += 1;
  });

  addedRows.forEach((row) => {
    if (!row || typeof row !== 'object') return;
    rows.push(sanitizeRow(row));
    addedCount += 1;
  });

  if (!updatedCount && !deletedCount && !addedCount) {
    return jsonResponse(409, {
      ok: false,
      error: 'Aucune ligne correspondante trouvée en base',
      unmatched: unmatched.slice(0, 5)
    });
  }

  const sourceName = String(body.sourceName || record.meta.sourceName || 'Tableau Excel').trim() || 'Tableau Excel';

  try {
    const saved = await upsertPlainDataset(datasetKey, sourceName, rows, accessResult.session.user);
    await logAccess(event, 'save_dataset_table_admin_success', 'info', {
      datasetKey,
      updatedCount,
      deletedCount,
      addedCount,
      unmatchedCount: unmatched.length
    }, accessResult.session.user);
    return jsonResponse(200, {
      ok: true,
      datasetKey: saved.datasetKey,
      rowCount: saved.rowCount,
      updatedAt: saved.updatedAt,
      updatedCount,
      deletedCount,
      addedCount,
      unmatched
    });
  } catch (err) {
    await logAccess(event, 'save_dataset_table_admin_error', 'error', {
      datasetKey,
      error: err && err.message ? err.message : 'save_error'
    }, accessResult.session.user);
    return jsonResponse(500, { ok: false, error: 'Impossible de sauvegarder le dataset' });
  }
};
