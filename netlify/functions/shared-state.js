const {
  getSessionPayload,
  isSameOrigin,
  jsonResponse,
  logAccess,
  readRequestBody
} = require('./_auth');
const {
  ensureSchema,
  query,
  withTransaction
} = require('./_db');

const MAX_TEXT = 120;
const MAX_KEY = 160;
const MAX_SCOPE = 80;
const MAX_BODY = 800000;

function sanitizeToken(value, fallback) {
  const normalized = String(value || fallback || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_TEXT);
  return normalized || String(fallback || 'global');
}

function sanitizeKey(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9:_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_KEY);
}

function validatePayload(payload) {
  if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Invalid payload');
  }
  const raw = JSON.stringify(payload);
  if (raw.length > MAX_BODY) {
    throw new Error('Payload too large');
  }
  return payload;
}

async function handleGet(event, session) {
  const params = event.queryStringParameters || {};
  const scope = sanitizeToken(params.scope, 'global').slice(0, MAX_SCOPE);
  const docType = sanitizeToken(params.docType, '');
  const docKey = sanitizeKey(params.docKey || '');

  if (!docType) {
    await logAccess(event, 'shared_state_get_invalid', 'warn', { reason: 'docType_required' }, session.user);
    return jsonResponse(400, { ok: false, error: 'docType required' });
  }

  await ensureSchema();

  if (docKey) {
    const result = await query(
      `SELECT scope, doc_type AS "docType", doc_key AS "docKey", payload, updated_by AS "updatedBy",
              created_at AS "createdAt", updated_at AS "updatedAt", version
         FROM dashboard_state_documents
        WHERE scope = $1 AND doc_type = $2 AND doc_key = $3
        LIMIT 1`,
      [scope, docType, docKey]
    );
    await logAccess(event, 'shared_state_get_document', 'info', {
      scope,
      docType,
      docKey,
      found: !!(result.rows[0])
    }, session.user);
    return jsonResponse(200, {
      ok: true,
      document: result.rows[0] || null,
      actor: session.user
    });
  }

  const result = await query(
    `SELECT scope, doc_type AS "docType", doc_key AS "docKey", payload, updated_by AS "updatedBy",
            created_at AS "createdAt", updated_at AS "updatedAt", version
       FROM dashboard_state_documents
      WHERE scope = $1 AND doc_type = $2
      ORDER BY doc_key ASC`,
    [scope, docType]
  );

  await logAccess(event, 'shared_state_list_documents', 'info', {
    scope,
    docType,
    count: result.rows.length
  }, session.user);

  return jsonResponse(200, {
    ok: true,
    documents: result.rows,
    actor: session.user
  });
}

async function handlePut(event, session) {
  if (!isSameOrigin(event.headers || {})) {
    await logAccess(event, 'shared_state_put_forbidden_origin', 'warn', {}, session.user);
    return jsonResponse(403, { ok: false, error: 'Forbidden' });
  }

  let body;
  try {
    body = readRequestBody(event);
  } catch (err) {
    await logAccess(event, 'shared_state_put_invalid_request', 'warn', {
      error: err && err.message ? err.message : 'invalid_request'
    }, session.user);
    return jsonResponse(400, { ok: false, error: 'Invalid request' });
  }

  const scope = sanitizeToken(body.scope, 'global').slice(0, MAX_SCOPE);
  const docType = sanitizeToken(body.docType, '');
  const docKey = sanitizeKey(body.docKey || '');
  if (!docType || !docKey) {
    await logAccess(event, 'shared_state_put_invalid', 'warn', {
      reason: 'docType_and_docKey_required',
      scope,
      docType,
      docKey
    }, session.user);
    return jsonResponse(400, { ok: false, error: 'docType and docKey required' });
  }

  let payload;
  try {
    payload = validatePayload(body.payload);
  } catch (err) {
    await logAccess(event, 'shared_state_put_invalid_payload', 'warn', {
      scope,
      docType,
      docKey,
      error: err.message
    }, session.user);
    return jsonResponse(400, { ok: false, error: err.message });
  }

  await ensureSchema();

  const result = await withTransaction(async (client) => {
    const upsert = await client.query(
      `INSERT INTO dashboard_state_documents (scope, doc_type, doc_key, payload, updated_by)
       VALUES ($1, $2, $3, $4::jsonb, $5)
       ON CONFLICT (scope, doc_type, doc_key)
       DO UPDATE SET
         payload = EXCLUDED.payload,
         updated_by = EXCLUDED.updated_by,
         updated_at = NOW(),
         version = dashboard_state_documents.version + 1
       RETURNING scope, doc_type AS "docType", doc_key AS "docKey", payload,
                 updated_by AS "updatedBy", created_at AS "createdAt", updated_at AS "updatedAt", version`,
      [scope, docType, docKey, JSON.stringify(payload), session.user]
    );

    await client.query(
      `INSERT INTO dashboard_state_audit (scope, doc_type, doc_key, action, payload, actor)
       VALUES ($1, $2, $3, 'upsert', $4::jsonb, $5)`,
      [scope, docType, docKey, JSON.stringify(payload), session.user]
    );

    return upsert.rows[0];
  });

  await logAccess(event, 'shared_state_upsert', 'info', {
    scope,
    docType,
    docKey,
    version: result.version
  }, session.user);

  return jsonResponse(200, { ok: true, document: result });
}

async function handleDelete(event, session) {
  if (!isSameOrigin(event.headers || {})) {
    await logAccess(event, 'shared_state_delete_forbidden_origin', 'warn', {}, session.user);
    return jsonResponse(403, { ok: false, error: 'Forbidden' });
  }

  let body;
  try {
    body = readRequestBody(event);
  } catch (err) {
    await logAccess(event, 'shared_state_delete_invalid_request', 'warn', {
      error: err && err.message ? err.message : 'invalid_request'
    }, session.user);
    return jsonResponse(400, { ok: false, error: 'Invalid request' });
  }

  const scope = sanitizeToken(body.scope, 'global').slice(0, MAX_SCOPE);
  const docType = sanitizeToken(body.docType, '');
  const docKey = sanitizeKey(body.docKey || '');
  if (!docType || !docKey) {
    await logAccess(event, 'shared_state_delete_invalid', 'warn', {
      reason: 'docType_and_docKey_required',
      scope,
      docType,
      docKey
    }, session.user);
    return jsonResponse(400, { ok: false, error: 'docType and docKey required' });
  }

  await ensureSchema();

  await withTransaction(async (client) => {
    await client.query(
      `DELETE FROM dashboard_state_documents
        WHERE scope = $1 AND doc_type = $2 AND doc_key = $3`,
      [scope, docType, docKey]
    );
    await client.query(
      `INSERT INTO dashboard_state_audit (scope, doc_type, doc_key, action, payload, actor)
       VALUES ($1, $2, $3, 'delete', '{}'::jsonb, $4)`,
      [scope, docType, docKey, session.user]
    );
  });

  await logAccess(event, 'shared_state_delete', 'info', {
    scope,
    docType,
    docKey
  }, session.user);

  return jsonResponse(200, { ok: true });
}

exports.handler = async function(event) {
  const session = getSessionPayload(event);
  if (!session || !session.user) {
    await logAccess(event, 'shared_state_unauthorized', 'warn', {});
    return jsonResponse(401, { ok: false, error: 'Unauthorized' });
  }

  try {
    if (event.httpMethod === 'GET') return await handleGet(event, session);
    if (event.httpMethod === 'PUT') return await handlePut(event, session);
    if (event.httpMethod === 'DELETE') return await handleDelete(event, session);
    await logAccess(event, 'shared_state_method_not_allowed', 'warn', {
      method: event.httpMethod
    }, session.user);
    return jsonResponse(405, { ok: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('[shared-state] Unexpected error', err);
    await logAccess(event, 'shared_state_error', 'error', {
      error: err && err.message ? err.message : 'database_error'
    }, session.user);
    return jsonResponse(500, { ok: false, error: 'Database error' });
  }
};
