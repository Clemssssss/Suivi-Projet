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
const crypto = require('crypto');
const { ensureSchema, query } = require('./_db');

const ACCESS_REQUEST_WINDOW_MS = 15 * 60 * 1000;
const ACCESS_REQUEST_LOCK_MS = 60 * 60 * 1000;
const ACCESS_REQUEST_MAX_ATTEMPTS = 3;

function cleanText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength || 160);
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function getThrottleKey(headers) {
  return sha256(
    getClientIP(headers || {}) + '|' +
    String(getUserAgent(headers || {})).toLowerCase()
  );
}

async function getAccessRequestThrottleState(headers) {
  const now = Date.now();
  const throttleKey = getThrottleKey(headers);
  await ensureSchema();
  const result = await query(
    `SELECT blocked_until AS "blockedUntil"
       FROM dashboard_access_request_attempts
      WHERE throttle_key = $1
      LIMIT 1`,
    [throttleKey]
  );
  const row = result.rows[0];
  const blockedUntilMs = row && row.blockedUntil ? new Date(row.blockedUntil).getTime() : 0;
  if (blockedUntilMs > now) {
    return { key: throttleKey, blocked: true, retryAfterMs: blockedUntilMs - now };
  }
  return { key: throttleKey, blocked: false, retryAfterMs: 0 };
}

async function markAccessRequestFailure(headers) {
  const now = Date.now();
  const throttleKey = getThrottleKey(headers);
  const ipHash = sha256(getClientIP(headers || {}));
  const userAgentHash = sha256(String(getUserAgent(headers || {})).toLowerCase());
  await ensureSchema();

  const currentResult = await query(
    `SELECT failure_count, first_attempt_at AS "firstAttemptAt"
       FROM dashboard_access_request_attempts
      WHERE throttle_key = $1
      LIMIT 1`,
    [throttleKey]
  );

  const current = currentResult.rows[0];
  const freshWindow = !current || ((new Date(current.firstAttemptAt).getTime() + ACCESS_REQUEST_WINDOW_MS) < now);
  const failureCount = freshWindow ? 1 : (Number(current.failureCount || 0) + 1);
  const firstAttemptAt = freshWindow ? new Date(now) : new Date(current.firstAttemptAt);
  const blockedUntil = failureCount >= ACCESS_REQUEST_MAX_ATTEMPTS ? new Date(now + ACCESS_REQUEST_LOCK_MS) : null;

  await query(
    `INSERT INTO dashboard_access_request_attempts
      (throttle_key, ip_hash, user_agent_hash, failure_count, first_attempt_at, last_attempt_at, blocked_until)
     VALUES ($1, $2, $3, $4, $5, NOW(), $6)
     ON CONFLICT (throttle_key)
     DO UPDATE SET
       ip_hash = EXCLUDED.ip_hash,
       user_agent_hash = EXCLUDED.user_agent_hash,
       failure_count = EXCLUDED.failure_count,
       first_attempt_at = EXCLUDED.first_attempt_at,
       last_attempt_at = NOW(),
       blocked_until = EXCLUDED.blocked_until`,
    [throttleKey, ipHash, userAgentHash, failureCount, firstAttemptAt.toISOString(), blockedUntil ? blockedUntil.toISOString() : null]
  );

  return {
    count: failureCount,
    blockedUntil: blockedUntil ? blockedUntil.getTime() : 0
  };
}

async function clearAccessRequestFailures(headers) {
  const throttleKey = getThrottleKey(headers);
  await ensureSchema();
  await query(`DELETE FROM dashboard_access_request_attempts WHERE throttle_key = $1`, [throttleKey]);
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
  const throttle = await getAccessRequestThrottleState(event.headers || {});
  if (throttle.blocked) {
    const retryAfterSeconds = Math.ceil((throttle.retryAfterMs || 0) / 1000);
    await logAccess(event, 'access_request_throttled', 'warn', {
      retryAfterSeconds: retryAfterSeconds
    });
    return jsonResponse(429, {
      ok: false,
      error: 'Too many requests',
      retryAfterSeconds: retryAfterSeconds,
      loginChallenge: createLoginChallengeToken(event.headers || {})
    }, {
      'Retry-After': String(retryAfterSeconds)
    });
  }

  const looksBot = looksLikeBot(event.headers || {});
  const challengeValid = verifyLoginChallengeToken(challenge, event.headers || {}) != null;
  if (honeypot || looksBot || !challengeValid) {
    await markAccessRequestFailure(event.headers || {});
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
    await clearAccessRequestFailures(event.headers || {});

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
