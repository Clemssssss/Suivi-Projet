const {
  createLoginChallengeToken,
  evaluateAccessPolicy,
  getClientCountry,
  getClientIP,
  getUserAgent,
  isSameOrigin,
  jsonResponse,
  logAccess,
  looksLikeBot,
  readRequestBody,
  verifyLoginChallengeToken
} = require('./_auth');
const { ensureSchema, query } = require('./_db');

function cleanText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength || 160);
}

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    await logAccess(event, 'access_request_method_not_allowed', 'warn', {});
    return jsonResponse(405, { ok: false, error: 'Method not allowed' });
  }

  if (!isSameOrigin(event.headers || {})) {
    await logAccess(event, 'access_request_forbidden_origin', 'warn', {});
    return jsonResponse(403, { ok: false, error: 'Forbidden' });
  }

  let body;
  try {
    body = readRequestBody(event);
  } catch (err) {
    await logAccess(event, 'access_request_invalid_request', 'warn', {
      error: err && err.message ? err.message : 'invalid_request'
    });
    return jsonResponse(400, { ok: false, error: 'Invalid request' });
  }

  const honeypot = cleanText(body.company, 120);
  const challenge = cleanText(body.challenge, 600);
  const looksBot = looksLikeBot(event.headers || {});
  const challengeValid = verifyLoginChallengeToken(challenge, event.headers || {}) != null;
  if (honeypot || looksBot || !challengeValid) {
    await logAccess(event, 'access_request_suspicious', 'warn', {
      honeypotFilled: !!honeypot,
      looksLikeBot: looksBot,
      challengeValid: challengeValid
    });
    await new Promise((resolve) => setTimeout(resolve, 1200));
    return jsonResponse(403, {
      ok: false,
      error: 'Suspicious request',
      loginChallenge: createLoginChallengeToken(event.headers || {})
    });
  }

  const access = await evaluateAccessPolicy(event.headers || {});
  if (access.allowed) {
    await logAccess(event, 'access_request_already_allowed', 'info', {
      ip: access.ip || '',
      matchedRule: access.matchedRule || ''
    });
    return jsonResponse(200, {
      ok: true,
      status: 'already_allowed',
      message: 'Cette IP est déjà autorisée.'
    });
  }

  const requestedIp = cleanText(access.ip || getClientIP(event.headers || {}), 160);
  const requestedBy = cleanText(body.requestedBy || body.name, 120);
  const requestedEmail = cleanText(body.requestedEmail || body.email, 160);
  const requestedLabel = cleanText(body.requestedLabel || requestedBy || requestedIp, 160);
  const requestReason = cleanText(body.requestReason || body.reason, 500);

  if (!requestedIp || requestedIp === 'unknown') {
    await logAccess(event, 'access_request_ip_unknown', 'warn', {});
    return jsonResponse(400, {
      ok: false,
      error: 'Unknown client IP',
      loginChallenge: createLoginChallengeToken(event.headers || {})
    });
  }

  if (!requestedBy || !requestReason) {
    await logAccess(event, 'access_request_invalid_payload', 'warn', {
      requestedByPresent: !!requestedBy,
      requestReasonPresent: !!requestReason
    });
    return jsonResponse(400, {
      ok: false,
      error: 'Nom et raison requis',
      loginChallenge: createLoginChallengeToken(event.headers || {})
    });
  }

  try {
    await ensureSchema();
    const existing = await query(
      `SELECT id, status
         FROM dashboard_ip_access_requests
        WHERE requested_ip = $1
          AND status = 'pending'
        ORDER BY created_at DESC
        LIMIT 1`,
      [requestedIp]
    );

    if (existing.rows[0]) {
      await logAccess(event, 'access_request_duplicate_pending', 'info', {
        ip: requestedIp,
        requestId: existing.rows[0].id
      });
      return jsonResponse(200, {
        ok: true,
        status: 'pending',
        requestId: existing.rows[0].id,
        message: 'Une demande est déjà en attente pour cette IP.'
      });
    }

    const result = await query(
      `INSERT INTO dashboard_ip_access_requests
        (requested_ip, requested_label, requested_by, requested_email, request_reason, country, user_agent, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
       RETURNING id, status, created_at AS "createdAt"`,
      [
        requestedIp,
        requestedLabel,
        requestedBy,
        requestedEmail,
        requestReason,
        cleanText(getClientCountry(event.headers || {}), 32),
        cleanText(getUserAgent(event.headers || {}), 500)
      ]
    );

    await logAccess(event, 'access_request_created', 'info', {
      ip: requestedIp,
      requestId: result.rows[0].id
    }, requestedBy);

    return jsonResponse(200, {
      ok: true,
      status: 'pending',
      requestId: result.rows[0].id,
      createdAt: result.rows[0].createdAt,
      message: 'Demande enregistrée. Un administrateur doit maintenant la valider.'
    });
  } catch (err) {
    await logAccess(event, 'access_request_error', 'error', {
      error: err && err.message ? err.message : 'access_request_error',
      ip: requestedIp
    }, requestedBy);
    return jsonResponse(500, {
      ok: false,
      error: 'Unable to save request',
      loginChallenge: createLoginChallengeToken(event.headers || {})
    });
  }
};
