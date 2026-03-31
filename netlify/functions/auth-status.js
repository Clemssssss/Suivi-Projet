const {
  createLoginChallengeToken,
  evaluateAccessPolicy,
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
  const access = await evaluateAccessPolicy(event.headers || {});
  const authenticated = !!session && !!access.allowed;
  await logAccess(event, authenticated ? 'auth_status_authenticated' : 'auth_status_guest', 'info', {
    authenticated: authenticated,
    networkAllowed: !!access.allowed,
    networkReason: access.reason || ''
  }, authenticated ? session.user : '');
  const payload = {
    ok: true,
    authenticated: authenticated,
    user: authenticated && session ? session.user : '',
    networkAllowed: !!access.allowed,
    loginChallenge: authenticated ? '' : createLoginChallengeToken(event.headers || {})
  };

  if (authenticated) {
    payload.networkReason = access.reason || '';
    payload.clientIp = access.ip || '';
  } else if (!access.allowed) {
    payload.networkReason = access.reason || '';
  }

  return jsonResponse(200, payload);
};
