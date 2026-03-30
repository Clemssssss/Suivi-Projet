const {
  clearSessionCookie,
  getSessionPayload,
  isSameOrigin,
  jsonResponse,
  logAccess
} = require('./_auth');

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    await logAccess(event, 'auth_logout_method_not_allowed', 'warn', {});
    return jsonResponse(405, { ok: false, error: 'Method not allowed' });
  }

  if (!isSameOrigin(event.headers || {})) {
    await logAccess(event, 'auth_logout_forbidden_origin', 'warn', {});
    return jsonResponse(403, { ok: false, error: 'Forbidden' });
  }

  const session = getSessionPayload(event);
  await logAccess(event, 'auth_logout', 'info', {
    authenticatedBeforeLogout: !!session
  }, session ? session.user : '');
  return jsonResponse(200, { ok: true }, {
    'Set-Cookie': clearSessionCookie(event.headers || {})
  });
};
