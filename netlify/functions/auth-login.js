const {
  buildSessionCookie,
  clearLoginFailures,
  createSessionToken,
  evaluateNetworkPolicy,
  getLoginThrottleState,
  isSameOrigin,
  jsonResponse,
  logAccess,
  looksLikeBot,
  markLoginFailure,
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
  const suspiciousBot = looksLikeBot(event.headers || {});
  const challengeValid = verifyLoginChallengeToken(challenge, event.headers || {}) != null;

  if (throttle.blocked) {
    await logAccess(event, 'auth_login_throttled', 'warn', {
      usernameAttempt: username,
      retryAfterSeconds: Math.ceil(throttle.retryAfterMs / 1000)
    }, username);
    return jsonResponse(429, {
      ok: false,
      error: 'Too many attempts',
      retryAfterSeconds: Math.ceil(throttle.retryAfterMs / 1000)
    }, {
      'Retry-After': String(Math.ceil(throttle.retryAfterMs / 1000))
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
    const headers = {};
    if (failure.blockedUntil) {
      headers['Retry-After'] = String(Math.ceil((failure.blockedUntil - Date.now()) / 1000));
    }
    await logAccess(event, 'auth_login_failed', 'warn', {
      usernameAttempt: username,
      failureCount: failure.count,
      blockedUntil: failure.blockedUntil || 0
    }, username);
    await new Promise((resolve) => setTimeout(resolve, 650));
    return jsonResponse(401, { ok: false, error: 'Invalid credentials' }, headers);
  }

  clearLoginFailures(event.headers || {}, username);
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
