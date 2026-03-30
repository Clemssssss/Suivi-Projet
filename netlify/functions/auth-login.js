const {
  buildSessionCookie,
  clearLoginFailures,
  createSessionToken,
  evaluateNetworkPolicy,
  getLoginThrottleState,
  isSameOrigin,
  jsonResponse,
  looksLikeBot,
  markLoginFailure,
  readRequestBody,
  verifyLoginChallengeToken,
  verifyPassword
} = require('./_auth');

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { ok: false, error: 'Method not allowed' });
  }

  if (!isSameOrigin(event.headers || {})) {
    return jsonResponse(403, { ok: false, error: 'Forbidden' });
  }

  let body;
  try {
    body = readRequestBody(event);
  } catch (err) {
    return jsonResponse(400, { ok: false, error: 'Invalid request' });
  }

  const networkPolicy = evaluateNetworkPolicy(event.headers || {});
  if (!networkPolicy.allowed) {
    return jsonResponse(403, {
      ok: false,
      error: 'Restricted network',
      code: networkPolicy.reason
    });
  }

  const expectedUser = String(process.env.DASHBOARD_LOGIN_USER || '');
  if (!expectedUser) {
    return jsonResponse(503, { ok: false, error: 'Authentication unavailable' });
  }

  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const honeypot = typeof body.company === 'string' ? body.company.trim() : '';
  const challenge = typeof body.challenge === 'string' ? body.challenge.trim() : '';
  const throttle = getLoginThrottleState(event.headers || {}, username);

  if (throttle.blocked) {
    return jsonResponse(429, {
      ok: false,
      error: 'Too many attempts',
      retryAfterSeconds: Math.ceil(throttle.retryAfterMs / 1000)
    }, {
      'Retry-After': String(Math.ceil(throttle.retryAfterMs / 1000))
    });
  }

  if (!username || !password || username.length > 80 || password.length > 256) {
    return jsonResponse(401, { ok: false, error: 'Invalid credentials' });
  }

  if (honeypot || looksLikeBot(event.headers || {}) || !verifyLoginChallengeToken(challenge, event.headers || {})) {
    markLoginFailure(throttle.key);
    await new Promise((resolve) => setTimeout(resolve, 1200));
    return jsonResponse(403, { ok: false, error: 'Suspicious request' });
  }

  let passwordValid = false;
  try {
    passwordValid = verifyPassword(password);
  } catch (err) {
    console.error('[auth-login] Password config error', err);
    return jsonResponse(503, { ok: false, error: 'Authentication unavailable' });
  }

  if (username !== expectedUser || !passwordValid) {
    const failure = markLoginFailure(throttle.key);
    const headers = {};
    if (failure.blockedUntil) {
      headers['Retry-After'] = String(Math.ceil((failure.blockedUntil - Date.now()) / 1000));
    }
    await new Promise((resolve) => setTimeout(resolve, 650));
    return jsonResponse(401, { ok: false, error: 'Invalid credentials' }, headers);
  }

  clearLoginFailures(event.headers || {}, username);
  const token = createSessionToken(expectedUser);
  return jsonResponse(200, {
    ok: true,
    authenticated: true,
    user: expectedUser
  }, {
    'Set-Cookie': buildSessionCookie(token, event.headers || {})
  });
};
