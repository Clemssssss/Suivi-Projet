const {
  buildSessionCookie,
  createSessionToken,
  isSameOrigin,
  jsonResponse,
  readRequestBody,
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

  const expectedUser = String(process.env.DASHBOARD_LOGIN_USER || '');
  if (!expectedUser) {
    return jsonResponse(503, { ok: false, error: 'Authentication unavailable' });
  }

  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!username || !password || username.length > 80 || password.length > 256) {
    return jsonResponse(401, { ok: false, error: 'Invalid credentials' });
  }

  let passwordValid = false;
  try {
    passwordValid = verifyPassword(password);
  } catch (err) {
    console.error('[auth-login] Password config error', err);
    return jsonResponse(503, { ok: false, error: 'Authentication unavailable' });
  }

  if (username !== expectedUser || !passwordValid) {
    await new Promise((resolve) => setTimeout(resolve, 650));
    return jsonResponse(401, { ok: false, error: 'Invalid credentials' });
  }

  const token = createSessionToken(expectedUser);
  return jsonResponse(200, {
    ok: true,
    authenticated: true,
    user: expectedUser
  }, {
    'Set-Cookie': buildSessionCookie(token, event.headers || {})
  });
};
