const crypto = require('crypto');
const {
  jsonResponse,
  logAccess
} = require('./_auth');
const { ensureSchema } = require('./_db');
const { upsertPlainDataset } = require('./_plain_dataset');
const { normalizeImportedRowObjects } = require('./_dataset_import');

const MAX_BODY_LENGTH = 10 * 1024 * 1024;

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

function getImportTokenFromHeaders(headers) {
  return String(
    headers['x-import-token'] ||
    headers['X-Import-Token'] ||
    headers.authorization ||
    headers.Authorization ||
    ''
  ).trim();
}

function constantTimeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (!left.length || left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function isValidImportToken(candidate) {
  const configured = String(process.env.POWER_AUTOMATE_IMPORT_TOKEN || '').trim();
  if (!configured) {
    throw new Error('Missing POWER_AUTOMATE_IMPORT_TOKEN');
  }
  const normalizedCandidate = String(candidate || '').replace(/^Bearer\s+/i, '').trim();
  return constantTimeEqual(normalizedCandidate, configured);
}

function cleanText(value, maxLength, fallback) {
  const text = String(value == null ? '' : value).trim();
  const finalValue = text || String(fallback || '');
  return finalValue.slice(0, maxLength || 500);
}

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { ok: false, error: 'Method not allowed' });
  }

  try {
    await ensureSchema();
  } catch (err) {
    return jsonResponse(500, { ok: false, error: 'Database unavailable' });
  }

  const token = getImportTokenFromHeaders(event.headers || {});
  let tokenValid = false;
  try {
    tokenValid = isValidImportToken(token);
  } catch (err) {
    await logAccess(event, 'power_automate_import_misconfigured', 'error', {
      error: err && err.message ? err.message : 'missing_power_automate_import_token'
    }, 'power-automate');
    return jsonResponse(500, { ok: false, error: 'Power Automate import is not configured' });
  }

  if (!tokenValid) {
    await logAccess(event, 'power_automate_import_unauthorized', 'warn', {}, 'power-automate');
    return jsonResponse(401, { ok: false, error: 'Unauthorized' });
  }

  let body;
  try {
    body = readLargeJsonBody(event);
  } catch (err) {
    await logAccess(event, 'power_automate_import_invalid_body', 'warn', {
      error: err && err.message ? err.message : 'invalid_json'
    }, 'power-automate');
    return jsonResponse(400, { ok: false, error: err && err.message ? err.message : 'Invalid request body' });
  }

  const datasetKey = cleanText(body.datasetKey, 120, 'saip-main') || 'saip-main';
  const sourceName = cleanText(body.sourceName, 255, 'Power Automate SharePoint');
  const rows = normalizeImportedRowObjects(body.rows);

  if (!rows.length) {
    await logAccess(event, 'power_automate_import_empty', 'warn', {
      datasetKey: datasetKey,
      receivedRows: Array.isArray(body.rows) ? body.rows.length : 0
    }, 'power-automate');
    return jsonResponse(400, { ok: false, error: 'Aucune ligne importable reçue' });
  }

  try {
    const saved = await upsertPlainDataset(datasetKey, sourceName, rows, 'power-automate');
    await logAccess(event, 'power_automate_import_success', 'info', {
      datasetKey: datasetKey,
      rowCount: saved.rowCount,
      sourceName: sourceName
    }, 'power-automate');
    return jsonResponse(200, {
      ok: true,
      datasetKey: saved.datasetKey,
      sourceName: saved.sourceName,
      rowCount: saved.rowCount,
      updatedAt: saved.updatedAt
    });
  } catch (err) {
    await logAccess(event, 'power_automate_import_error', 'error', {
      datasetKey: datasetKey,
      error: err && err.message ? err.message : 'import_error'
    }, 'power-automate');
    return jsonResponse(500, { ok: false, error: err && err.message ? err.message : 'Import impossible' });
  }
};
