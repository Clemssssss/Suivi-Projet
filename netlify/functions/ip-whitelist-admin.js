const {
  evaluateAccessPolicy,
  getSessionPayload,
  isAdminUser,
  isSameOrigin,
  jsonResponse,
  logAccess
} = require('./_auth');
const { ensureSchema, query } = require('./_db');
const WHITELIST_ADMIN_IP = '90.82.197.132';

function cleanText(value, max) {
  return String(value == null ? '' : value).trim().slice(0, max || 160);
}

function normalizeIpRule(value) {
  return cleanText(value, 160);
}

function parseBody(event) {
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64').toString('utf8')
    : String(event.body || '');
  if (!rawBody.trim()) return {};
  return JSON.parse(rawBody);
}

async function ensureAdminAccess(event) {
  const session = getSessionPayload(event);
  if (!session || !session.user) {
    await logAccess(event, 'ip_whitelist_admin_unauthorized', 'warn', {});
    return { ok: false, response: jsonResponse(401, { ok: false, error: 'Unauthorized' }) };
  }

  if (!isAdminUser(session.user)) {
    await logAccess(event, 'ip_whitelist_admin_forbidden_non_admin', 'warn', {}, session.user);
    return { ok: false, response: jsonResponse(403, { ok: false, error: 'Forbidden' }) };
  }

  const clientIp = String((event && event.headers && (event.headers['x-nf-client-connection-ip'] || event.headers['x-forwarded-for'] || event.headers['client-ip'])) || '')
    .split(',')[0]
    .trim() || 'unknown';
  if (clientIp !== WHITELIST_ADMIN_IP) {
    await logAccess(event, 'ip_whitelist_admin_forbidden_ip', 'warn', {
      ip: clientIp
    }, session.user);
    return {
      ok: false,
      response: jsonResponse(403, { ok: false, error: 'Forbidden', code: 'restricted_admin_ip' })
    };
  }

  const access = await evaluateAccessPolicy(event.headers || {});
  if (!access.allowed) {
    await logAccess(event, 'ip_whitelist_admin_network_blocked', 'warn', {
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

async function loadSnapshot() {
  await ensureSchema();
  const [requestResult, whitelistResult] = await Promise.all([
    query(
      `SELECT id,
              requested_ip AS "requestedIp",
              requested_label AS "requestedLabel",
              requested_by AS "requestedBy",
              requested_email AS "requestedEmail",
              request_reason AS "requestReason",
              country,
              user_agent AS "userAgent",
              status,
              reviewed_by AS "reviewedBy",
              review_notes AS "reviewNotes",
              reviewed_at AS "reviewedAt",
              created_at AS "createdAt",
              updated_at AS "updatedAt"
         FROM dashboard_ip_access_requests
        ORDER BY
          CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 WHEN 'rejected' THEN 2 ELSE 9 END,
          created_at DESC
        LIMIT 250`
    ),
    query(
      `SELECT ip_rule AS "ipRule",
              label,
              notes,
              is_active AS "isActive",
              added_by AS "addedBy",
              created_at AS "createdAt",
              updated_at AS "updatedAt"
         FROM dashboard_ip_whitelist
        ORDER BY is_active DESC, updated_at DESC, created_at DESC
        LIMIT 250`
    )
  ]);

  return {
    requests: requestResult.rows || [],
    whitelist: whitelistResult.rows || []
  };
}

async function approveRequest(body, actor) {
  const id = Number(body.requestId);
  const reviewNotes = cleanText(body.reviewNotes, 500);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('Invalid request id');
  }

  const result = await query(
    `UPDATE dashboard_ip_access_requests
        SET status = 'approved',
            reviewed_by = $2,
            review_notes = $3,
            reviewed_at = NOW()
      WHERE id = $1
      RETURNING id, requested_ip AS "requestedIp"`,
    [id, actor, reviewNotes]
  );

  if (!result.rows[0]) throw new Error('Request not found');
  return result.rows[0];
}

async function rejectRequest(body, actor) {
  const id = Number(body.requestId);
  const reviewNotes = cleanText(body.reviewNotes, 500);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('Invalid request id');
  }

  const result = await query(
    `UPDATE dashboard_ip_access_requests
        SET status = 'rejected',
            reviewed_by = $2,
            review_notes = $3,
            reviewed_at = NOW()
      WHERE id = $1
      RETURNING id, requested_ip AS "requestedIp"`,
    [id, actor, reviewNotes]
  );

  if (!result.rows[0]) throw new Error('Request not found');
  return result.rows[0];
}

async function setWhitelistEntryActive(body, actor, isActive) {
  const ipRule = normalizeIpRule(body.ipRule);
  const notes = cleanText(body.reviewNotes || body.notes, 500);
  if (!ipRule) throw new Error('Invalid IP rule');

  const result = await query(
    `UPDATE dashboard_ip_whitelist
        SET is_active = $2,
            notes = CASE WHEN $3 <> '' THEN $3 ELSE notes END,
            added_by = CASE WHEN $4 <> '' THEN $4 ELSE added_by END,
            updated_at = NOW()
      WHERE ip_rule = $1
      RETURNING ip_rule AS "ipRule", is_active AS "isActive"`,
    [ipRule, isActive, notes, actor]
  );

  if (!result.rows[0]) throw new Error('Whitelist entry not found');
  return result.rows[0];
}

async function addWhitelistEntry(body, actor) {
  const ipRule = normalizeIpRule(body.ipRule);
  const label = cleanText(body.label || body.requestedLabel || ipRule, 160);
  const notes = cleanText(body.notes, 500);
  if (!ipRule) throw new Error('Invalid IP rule');

  const result = await query(
    `INSERT INTO dashboard_ip_whitelist (ip_rule, label, notes, is_active, added_by, created_at, updated_at)
     VALUES ($1, $2, $3, TRUE, $4, NOW(), NOW())
     ON CONFLICT (ip_rule)
     DO UPDATE SET
       label = EXCLUDED.label,
       notes = EXCLUDED.notes,
       is_active = TRUE,
       added_by = EXCLUDED.added_by,
       updated_at = NOW()
     RETURNING ip_rule AS "ipRule", is_active AS "isActive"`,
    [ipRule, label || ipRule, notes, actor]
  );

  return result.rows[0];
}

async function handleMutation(event, session) {
  if (!isSameOrigin(event.headers || {})) {
    await logAccess(event, 'ip_whitelist_admin_forbidden_origin', 'warn', {}, session.user);
    return jsonResponse(403, { ok: false, error: 'Forbidden' });
  }

  let body;
  try {
    body = parseBody(event);
  } catch (err) {
    await logAccess(event, 'ip_whitelist_admin_invalid_request', 'warn', {
      error: err && err.message ? err.message : 'invalid_request'
    }, session.user);
    return jsonResponse(400, { ok: false, error: 'Invalid request' });
  }

  const action = cleanText(body.action, 60);

  try {
    let result = null;

    if (action === 'approve_request') {
      result = await approveRequest(body, session.user);
    } else if (action === 'reject_request') {
      result = await rejectRequest(body, session.user);
    } else if (action === 'add_whitelist_entry') {
      result = await addWhitelistEntry(body, session.user);
    } else if (action === 'activate_whitelist_entry') {
      result = await setWhitelistEntryActive(body, session.user, true);
    } else if (action === 'deactivate_whitelist_entry') {
      result = await setWhitelistEntryActive(body, session.user, false);
    } else {
      return jsonResponse(400, { ok: false, error: 'Unknown action' });
    }

    await logAccess(event, 'ip_whitelist_admin_action', 'info', {
      action: action,
      target: result && (result.requestedIp || result.ipRule || '')
    }, session.user);

    const snapshot = await loadSnapshot();
    return jsonResponse(200, Object.assign({
      ok: true,
      action: action
    }, snapshot));
  } catch (err) {
    await logAccess(event, 'ip_whitelist_admin_error', 'error', {
      action: action,
      error: err && err.message ? err.message : 'ip_whitelist_admin_error'
    }, session.user);
    return jsonResponse(500, { ok: false, error: err && err.message ? err.message : 'Unable to process request' });
  }
}

exports.handler = async function(event) {
  const auth = await ensureAdminAccess(event);
  if (!auth.ok) return auth.response;

  if (event.httpMethod === 'GET') {
    try {
      const snapshot = await loadSnapshot();
      await logAccess(event, 'ip_whitelist_admin_view', 'info', {
        requestCount: snapshot.requests.length,
        whitelistCount: snapshot.whitelist.length
      }, auth.session.user);
      return jsonResponse(200, Object.assign({
        ok: true
      }, snapshot));
    } catch (err) {
      await logAccess(event, 'ip_whitelist_admin_load_error', 'error', {
        error: err && err.message ? err.message : 'ip_whitelist_admin_load_error'
      }, auth.session.user);
      return jsonResponse(500, { ok: false, error: 'Unable to load whitelist admin data' });
    }
  }

  if (event.httpMethod === 'POST') {
    return handleMutation(event, auth.session);
  }

  await logAccess(event, 'ip_whitelist_admin_method_not_allowed', 'warn', {
    method: event.httpMethod
  }, auth.session.user);
  return jsonResponse(405, { ok: false, error: 'Method not allowed' });
};
