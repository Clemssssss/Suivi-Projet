const {
  createLoginChallengeToken,
  getSessionPayload,
  jsonResponse
} = require('./_auth');

exports.handler = async function(event) {
  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, { ok: false, error: 'Method not allowed' });
  }

  const session = getSessionPayload(event);
  return jsonResponse(200, {
    ok: true,
    authenticated: !!session,
    user: session ? session.user : '',
    loginChallenge: session ? '' : createLoginChallengeToken(event.headers || {})
  });
};
