const {
  buildSessionCookie,
  clearLoginFailures,
  clearPersistentLoginFailures,
  createSessionToken,
  evaluateNetworkPolicy,
  getLoginThrottleState,
  getPersistentLoginThrottleState,
  isSameOrigin,
  jsonResponse,
  logAccess,
  looksLikeBot,
  markLoginFailure,
  markPersistentLoginFailure,
  readRequestBody,
  verifyLoginChallengeToken,
  verifyPassword
} = require('./_auth');

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    await logAccess(event, 'auth_login_method_not_allowed', 'warn', {});
    return jsonResponse(405, { ok: false, error: 'Method not allowed' });
  }

  if (!isSameOrigin(event.headers || {})) {
    await logAccess(event, 'auth_login_forbidden_origin', 'warn', {});
    return jsonResponse(403, { ok: false, error: 'Forbidden' });
  }

  let body;
  try {
    body = readRequestBody(event);
  } catch (err) {
    await logAccess(event, 'auth_login_invalid_request', 'warn', {
      error: err && err.message ? err.message : 'invalid_request'
    });
    return jsonResponse(400, { ok: false, error: 'Invalid request' });
  }

  const networkPolicy = evaluateNetworkPolicy(event.headers || {});
  if (!networkPolicy.allowed) {
    await logAccess(event, 'auth_login_network_blocked', 'warn', {
      code: networkPolicy.reason
    });
    return jsonResponse(403, {
      ok: false,
      error: 'Restricted network',
      code: networkPolicy.reason
    });
  }

  const expectedUser = String(process.env.DASHBOARD_LOGIN_USER || '');
  if (!expectedUser) {
    await logAccess(event, 'auth_login_unavailable', 'error', {
      missingEnv: 'DASHBOARD_LOGIN_USER'
    });
    return jsonResponse(503, { ok: false, error: 'Authentication unavailable' });
  }

  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const honeypot = typeof body.company === 'string' ? body.company.trim() : '';
  const challenge = typeof body.challenge === 'string' ? body.challenge.trim() : '';
  const throttle = getLoginThrottleState(event.headers || {}, username);
  let persistentThrottle = { blocked: false, retryAfterMs: 0 };
  try {
    persistentThrottle = await getPersistentLoginThrottleState(event.headers || {}, username);
  } catch (err) {
    console.warn('[auth-login] Persistent throttle unavailable', err && err.message ? err.message : err);
  }
  const suspiciousBot = looksLikeBot(event.headers || {});
  const challengeValid = verifyLoginChallengeToken(challenge, event.headers || {}) != null;

  if (throttle.blocked || persistentThrottle.blocked) {
    const retryAfterSeconds = Math.ceil(Math.max(throttle.retryAfterMs || 0, persistentThrottle.retryAfterMs || 0) / 1000);
    await logAccess(event, 'auth_login_throttled', 'warn', {
      usernameAttempt: username,
      retryAfterSeconds: retryAfterSeconds
    }, username);
    return jsonResponse(429, {
      ok: false,
      error: 'Too many attempts',
      retryAfterSeconds: retryAfterSeconds
    }, {
      'Retry-After': String(retryAfterSeconds)
    });
  }

  if (!username || !password || username.length > 80 || password.length > 256) {
    await logAccess(event, 'auth_login_invalid_credentials_shape', 'warn', {
      usernameAttempt: username,
      hasPassword: !!password
    }, username);
    return jsonResponse(401, { ok: false, error: 'Invalid credentials' });
  }

  if (honeypot || suspiciousBot || !challengeValid) {
    markLoginFailure(throttle.key);
    try { await markPersistentLoginFailure(event.headers || {}, username); } catch (_) {}
    await logAccess(event, 'auth_login_suspicious_request', 'warn', {
      usernameAttempt: username,
      honeypotFilled: !!honeypot,
      looksLikeBot: suspiciousBot,
      challengeValid: challengeValid
    }, username);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    return jsonResponse(403, { ok: false, error: 'Suspicious request' });
  }

  let passwordValid = false;
  try {
    passwordValid = verifyPassword(password);
  } catch (err) {
    console.error('[auth-login] Password config error', err);
    await logAccess(event, 'auth_login_password_config_error', 'error', {
      error: err && err.message ? err.message : 'password_config_error'
    }, username);
    return jsonResponse(503, { ok: false, error: 'Authentication unavailable' });
  }

  if (username !== expectedUser || !passwordValid) {
    const failure = markLoginFailure(throttle.key);
    let persistentFailure = null;
    try {
      persistentFailure = await markPersistentLoginFailure(event.headers || {}, username);
    } catch (_) {}
    const headers = {};
    const blockedUntil = Math.max(failure.blockedUntil || 0, persistentFailure && persistentFailure.blockedUntil ? persistentFailure.blockedUntil : 0);
    if (blockedUntil) {
      headers['Retry-After'] = String(Math.ceil((blockedUntil - Date.now()) / 1000));
    }
    await logAccess(event, 'auth_login_failed', 'warn', {
      usernameAttempt: username,
      failureCount: Math.max(failure.count || 0, persistentFailure && persistentFailure.count ? persistentFailure.count : 0),
      blockedUntil: blockedUntil || 0
    }, username);
    await new Promise((resolve) => setTimeout(resolve, 650));
    return jsonResponse(401, { ok: false, error: 'Invalid credentials' }, headers);
  }

  clearLoginFailures(event.headers || {}, username);
  try { await clearPersistentLoginFailures(event.headers || {}, username); } catch (_) {}
  const token = createSessionToken(expectedUser);
  await logAccess(event, 'auth_login_success', 'info', {
    usernameAttempt: username,
    sessionIssued: true
  }, expectedUser);
  return jsonResponse(200, {
    ok: true,
    authenticated: true,
    user: expectedUser
  }, {
    'Set-Cookie': buildSessionCookie(token, event.headers || {})
  });
};
