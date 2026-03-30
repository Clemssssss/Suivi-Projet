const {
  clearSessionCookie,
  isSameOrigin,
  jsonResponse
} = require('./_auth');

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { ok: false, error: 'Method not allowed' });
  }

  if (!isSameOrigin(event.headers || {})) {
    return jsonResponse(403, { ok: false, error: 'Forbidden' });
  }

  return jsonResponse(200, { ok: true }, {
    'Set-Cookie': clearSessionCookie(event.headers || {})
  });
};
