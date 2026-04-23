const crypto = require('crypto');
const {
  evaluateAccessPolicy,
  getSessionPayload,
  isAdminSession,
  isSameOrigin,
  jsonResponse,
  logAccess,
  normalizeUserRole,
  readRequestBody
} = require('./_auth');
const { ensureSchema, query } = require('./_db');

const PBKDF2_ITERATIONS = 150000;

function cleanText(value, max) {
  return String(value == null ? '' : value).trim().slice(0, max || 200);
}

function normalizeUsername(value) {
  return cleanText(value, 80);
}

function sanitizeRole(value) {
  const role = String(value == null ? '' : value).trim().toLowerCase();
  if (role === 'admin') return 'admin';
  if (role === 'consultation' || role === 'viewer' || role === 'read_only' || role === 'readonly') {
    return 'consultation';
  }
  return 'user';
}

function toBase64Url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function hashPassword(password, salt, iterations) {
  const normalizedSalt = String(salt || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padding = normalizedSalt.length % 4 === 0 ? '' : '='.repeat(4 - (normalizedSalt.length % 4));
  const derived = crypto.pbkdf2Sync(String(password), Buffer.from(normalizedSalt + padding, 'base64'), iterations, 32, 'sha256');
  return toBase64Url(derived);
}

function buildPasswordHash(password) {
  const saltBytes = crypto.randomBytes(16);
  const salt = saltBytes.toString('base64url');
  const hash = hashPassword(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2_sha256$${PBKDF2_ITERATIONS}$${salt}$${hash}`;
}

async function ensureAdminAccess(event) {
  const session = getSessionPayload(event);
  if (!session || !session.user) {
    await logAccess(event, 'auth_users_admin_unauthorized', 'warn', {});
    return { ok: false, response: jsonResponse(401, { ok: false, error: 'Unauthorized' }) };
  }

  if (!isAdminSession(session)) {
    await logAccess(event, 'auth_users_admin_forbidden_non_admin', 'warn', {}, session.user);
    return { ok: false, response: jsonResponse(403, { ok: false, error: 'Forbidden' }) };
  }

  const access = await evaluateAccessPolicy(event.headers || {});
  if (!access.allowed) {
    await logAccess(event, 'auth_users_admin_network_blocked', 'warn', {
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

async function loadAccounts() {
  await ensureSchema();
  const result = await query(
    `SELECT username,
            role,
            is_active AS "isActive",
            created_by AS "createdBy",
            updated_by AS "updatedBy",
            created_at AS "createdAt",
            updated_at AS "updatedAt"
       FROM dashboard_auth_users
      ORDER BY is_active DESC, role DESC, username ASC
      LIMIT 250`
  );

  const rows = result.rows || [];
  return {
    accounts: rows.map((row) => ({
      username: row.username,
      role: normalizeUserRole(row.role, row.username),
      isActive: !!row.isActive,
      createdBy: row.createdBy || '',
      updatedBy: row.updatedBy || '',
      createdAt: row.createdAt || null,
      updatedAt: row.updatedAt || null
    })),
    summary: {
      total: rows.length,
      active: rows.filter((row) => !!row.isActive).length,
      inactive: rows.filter((row) => !row.isActive).length
    }
  };
}

async function upsertAccount(body, actor) {
  const username = normalizeUsername(body.username);
  const password = String(body && body.password == null ? '' : body.password);
  const role = sanitizeRole(body.role);
  const isActive = body.isActive === undefined
    ? true
    : body.isActive === true || body.isActive === 'true' || body.isActive === 1 || body.isActive === '1';

  if (!username) {
    throw new Error('Username requis');
  }
  if (!password || password.length < 8) {
    throw new Error('Mot de passe trop court');
  }
  if (username.length > 80) {
    throw new Error('Username trop long');
  }

  const passwordHash = buildPasswordHash(password);
  const result = await query(
    `INSERT INTO dashboard_auth_users
      (username, password_hash, role, is_active, created_by, updated_by, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $5, NOW(), NOW())
     ON CONFLICT (username)
     DO UPDATE SET
       password_hash = EXCLUDED.password_hash,
       role = EXCLUDED.role,
       is_active = EXCLUDED.is_active,
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()
     RETURNING username`,
    [username, passwordHash, role, isActive, actor]
  );

  return result.rows[0];
}

async function setAccountActive(body, actor, isActive) {
  const username = normalizeUsername(body.username);
  if (!username) {
    throw new Error('Username requis');
  }

  const result = await query(
    `UPDATE dashboard_auth_users
        SET is_active = $2,
            updated_by = $3,
            updated_at = NOW()
      WHERE username = $1
      RETURNING username`,
    [username, isActive, actor]
  );

  if (!result.rows[0]) {
    throw new Error('Compte introuvable');
  }

  return result.rows[0];
}

async function handleMutation(event, session) {
  if (!isSameOrigin(event.headers || {})) {
    await logAccess(event, 'auth_users_admin_forbidden_origin', 'warn', {}, session.user);
    return jsonResponse(403, { ok: false, error: 'Forbidden' });
  }

  let body;
  try {
    body = readRequestBody(event);
  } catch (err) {
    await logAccess(event, 'auth_users_admin_invalid_request', 'warn', {
      error: err && err.message ? err.message : 'invalid_request'
    }, session.user);
    return jsonResponse(400, { ok: false, error: 'Invalid request' });
  }

  const action = cleanText(body.action, 60);

  try {
    let result = null;
    if (action === 'create_user') {
      result = await upsertAccount(body, session.user);
    } else if (action === 'activate_user') {
      result = await setAccountActive(body, session.user, true);
    } else if (action === 'deactivate_user') {
      result = await setAccountActive(body, session.user, false);
    } else {
      return jsonResponse(400, { ok: false, error: 'Unknown action' });
    }

    await logAccess(event, 'auth_users_admin_action', 'info', {
      action: action,
      target: result && result.username ? result.username : ''
    }, session.user);

    const snapshot = await loadAccounts();
    return jsonResponse(200, Object.assign({
      ok: true,
      action: action
    }, snapshot));
  } catch (err) {
    await logAccess(event, 'auth_users_admin_error', 'error', {
      action: action,
      error: err && err.message ? err.message : 'auth_users_admin_error'
    }, session.user);
    return jsonResponse(500, { ok: false, error: err && err.message ? err.message : 'Unable to process request' });
  }
}

exports.handler = async function(event) {
  const auth = await ensureAdminAccess(event);
  if (!auth.ok) return auth.response;

  if (event.httpMethod === 'GET') {
    try {
      const snapshot = await loadAccounts();
      await logAccess(event, 'auth_users_admin_view', 'info', {
        accountCount: snapshot.accounts.length,
        activeCount: snapshot.summary.active
      }, auth.session.user);
      return jsonResponse(200, Object.assign({
        ok: true
      }, snapshot));
    } catch (err) {
      await logAccess(event, 'auth_users_admin_load_error', 'error', {
        error: err && err.message ? err.message : 'auth_users_admin_load_error'
      }, auth.session.user);
      return jsonResponse(500, { ok: false, error: 'Unable to load accounts' });
    }
  }

  if (event.httpMethod === 'POST') {
    return handleMutation(event, auth.session);
  }

  await logAccess(event, 'auth_users_admin_method_not_allowed', 'warn', {
    method: event.httpMethod
  }, auth.session.user);
  return jsonResponse(405, { ok: false, error: 'Method not allowed' });
};
