const crypto = require('crypto');

const SESSION_COOKIE_NAME = 'sp_dashboard_session';
const SESSION_TTL_SECONDS = 60 * 60 * 8;
const MAX_BODY_LENGTH = 4096;

function toBase64Url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(input) {
  const normalized = String(input || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + padding, 'base64');
}

function getHostInfo(headers) {
  const host = String(headers['x-forwarded-host'] || headers.host || '').split(',')[0].trim();
  const proto = String(headers['x-forwarded-proto'] || 'https').split(',')[0].trim() || 'https';
  return { host, proto };
}

function isSameOrigin(headers) {
  const origin = headers.origin || headers.Origin;
  if (!origin) return true;
  const hostInfo = getHostInfo(headers);
  if (!hostInfo.host) return false;
  return origin === hostInfo.proto + '://' + hostInfo.host;
}

function parseCookies(cookieHeader) {
  return String(cookieHeader || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const eqIndex = part.indexOf('=');
      if (eqIndex <= 0) return acc;
      const key = part.slice(0, eqIndex).trim();
      const value = part.slice(eqIndex + 1).trim();
      acc[key] = value;
      return acc;
    }, {});
}

function constantTimeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function getPasswordConfig() {
  const encoded = process.env.DASHBOARD_LOGIN_PASSWORD_HASH;
  if (!encoded) throw new Error('Missing DASHBOARD_LOGIN_PASSWORD_HASH');

  const parts = String(encoded).split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2_sha256') {
    throw new Error('Invalid password hash format');
  }

  return {
    iterations: Number(parts[1]),
    salt: parts[2],
    hash: parts[3]
  };
}

function hashPassword(password, salt, iterations) {
  const derived = crypto.pbkdf2Sync(String(password), fromBase64Url(salt), iterations, 32, 'sha256');
  return toBase64Url(derived);
}

function verifyPassword(password) {
  const config = getPasswordConfig();
  const candidate = hashPassword(password, config.salt, config.iterations);
  return constantTimeEqual(candidate, config.hash);
}

function getSessionSecret() {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret || String(secret).length < 32) {
    throw new Error('Missing AUTH_SESSION_SECRET');
  }
  return String(secret);
}

function signToken(encodedPayload) {
  return toBase64Url(
    crypto
      .createHmac('sha256', getSessionSecret())
      .update(encodedPayload)
      .digest()
  );
}

function createSessionToken(username) {
  const payload = {
    user: String(username),
    nonce: toBase64Url(crypto.randomBytes(16)),
    exp: Date.now() + (SESSION_TTL_SECONDS * 1000)
  };

  const encodedPayload = toBase64Url(Buffer.from(JSON.stringify(payload), 'utf8'));
  const signature = signToken(encodedPayload);
  return encodedPayload + '.' + signature;
}

function verifySessionToken(token) {
  if (typeof token !== 'string' || token.indexOf('.') === -1) return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const encodedPayload = parts[0];
  const signature = parts[1];
  if (!constantTimeEqual(signToken(encodedPayload), signature)) return null;

  let payload;
  try {
    payload = JSON.parse(fromBase64Url(encodedPayload).toString('utf8'));
  } catch (err) {
    return null;
  }

  if (!payload || typeof payload.user !== 'string' || typeof payload.exp !== 'number') {
    return null;
  }

  if (payload.exp <= Date.now()) return null;
  return payload;
}

function isLocalhost(headers) {
  const hostInfo = getHostInfo(headers);
  return /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(hostInfo.host);
}

function buildSessionCookie(token, headers) {
  const secureFlag = isLocalhost(headers) ? '' : '; Secure';
  return (
    SESSION_COOKIE_NAME + '=' + token +
    '; Path=/' +
    '; HttpOnly' +
    secureFlag +
    '; SameSite=Strict' +
    '; Max-Age=' + SESSION_TTL_SECONDS
  );
}

function clearSessionCookie(headers) {
  const secureFlag = isLocalhost(headers) ? '' : '; Secure';
  return (
    SESSION_COOKIE_NAME + '=' +
    '; Path=/' +
    '; HttpOnly' +
    secureFlag +
    '; SameSite=Strict' +
    '; Max-Age=0'
  );
}

function readRequestBody(event) {
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64').toString('utf8')
    : String(event.body || '');

  if (rawBody.length > MAX_BODY_LENGTH) {
    throw new Error('Payload too large');
  }

  if (!rawBody.trim()) return {};
  return JSON.parse(rawBody);
}

function jsonResponse(statusCode, payload, extraHeaders) {
  return {
    statusCode,
    headers: Object.assign({
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }, extraHeaders || {}),
    body: JSON.stringify(payload)
  };
}

function getSessionPayload(event) {
  const cookies = parseCookies(event.headers.cookie || event.headers.Cookie);
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) return null;
  try {
    return verifySessionToken(token);
  } catch (err) {
    return null;
  }
}

module.exports = {
  SESSION_COOKIE_NAME,
  buildSessionCookie,
  clearSessionCookie,
  createSessionToken,
  getSessionPayload,
  isSameOrigin,
  jsonResponse,
  readRequestBody,
  verifyPassword
};
