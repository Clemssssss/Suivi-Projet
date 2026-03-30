const {
  createLoginChallengeToken,
  getSessionPayload,
  jsonResponse,
  logAccess
} = require('./_auth');

exports.handler = async function(event) {
  if (event.httpMethod !== 'GET') {
    await logAccess(event, 'auth_status_method_not_allowed', 'warn', {});
    return jsonResponse(405, { ok: false, error: 'Method not allowed' });
  }

  const session = getSessionPayload(event);
  await logAccess(event, session ? 'auth_status_authenticated' : 'auth_status_guest', 'info', {
    authenticated: !!session
  }, session ? session.user : '');
  return jsonResponse(200, {
    ok: true,
    authenticated: !!session,
    user: session ? session.user : '',
    loginChallenge: session ? '' : createLoginChallengeToken(event.headers || {})
  });
};
