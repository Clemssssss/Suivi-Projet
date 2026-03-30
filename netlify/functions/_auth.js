const crypto = require('crypto');
const { ensureSchema, query } = require('./_db');

const SESSION_COOKIE_NAME = 'sp_dashboard_session';
const SESSION_TTL_SECONDS = 60 * 60 * 8;
const MAX_BODY_LENGTH = 4096;
const LOGIN_CHALLENGE_TTL_MS = 15 * 60 * 1000;
const LOGIN_MIN_SOLVE_MS = 1500;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCK_MS = 30 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;
const loginAttempts = new Map();

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

function sha256(input) {
  return crypto.createHash('sha256').update(String(input || '')).digest('hex');
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

function createLoginChallengeToken(headers) {
  const issuedAt = Date.now();
  const payload = {
    purpose: 'login',
    nonce: toBase64Url(crypto.randomBytes(16)),
    iat: issuedAt,
    exp: issuedAt + LOGIN_CHALLENGE_TTL_MS,
    ua: sha256(getUserAgent(headers)),
    ip: sha256(getClientIP(headers))
  };

  const encodedPayload = toBase64Url(Buffer.from(JSON.stringify(payload), 'utf8'));
  const signature = signToken(encodedPayload);
  return encodedPayload + '.' + signature;
}

function verifySignedPayload(token) {
  if (typeof token !== 'string' || token.indexOf('.') === -1) return null;

  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const encodedPayload = parts[0];
  const signature = parts[1];
  if (!constantTimeEqual(signToken(encodedPayload), signature)) return null;

  try {
    return JSON.parse(fromBase64Url(encodedPayload).toString('utf8'));
  } catch (err) {
    return null;
  }
}

function verifySessionToken(token) {
  const payload = verifySignedPayload(token);
  if (!payload || typeof payload.user !== 'string' || typeof payload.exp !== 'number') {
    return null;
  }

  if (payload.exp <= Date.now()) return null;
  return payload;
}

function verifyLoginChallengeToken(token, headers) {
  var payload = verifySignedPayload(token);
  if (!payload || payload.purpose !== 'login' || typeof payload.iat !== 'number') return null;
  if (typeof payload.exp !== 'number' || payload.exp <= Date.now()) return null;
  if ((Date.now() - payload.iat) < LOGIN_MIN_SOLVE_MS) return null;
  if (payload.ua !== sha256(getUserAgent(headers))) return null;
  if (payload.ip !== sha256(getClientIP(headers))) return null;
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

function getUserAgent(headers) {
  return String(headers['user-agent'] || headers['User-Agent'] || '').trim();
}

function getAcceptLanguage(headers) {
  return String(headers['accept-language'] || headers['Accept-Language'] || '').trim();
}

function getClientIP(headers) {
  const forwarded = String(
    headers['x-nf-client-connection-ip'] ||
    headers['x-forwarded-for'] ||
    headers['client-ip'] ||
    ''
  ).trim();

  return forwarded.split(',')[0].trim() || 'unknown';
}

function getClientCountry(headers) {
  return String(
    headers['x-country'] ||
    headers['x-nf-geo-country'] ||
    headers['cf-ipcountry'] ||
    ''
  ).trim().toUpperCase();
}

function getRequestId(headers) {
  return String(
    headers['x-nf-request-id'] ||
    headers['x-request-id'] ||
    headers['x-correlation-id'] ||
    ''
  ).trim();
}

function clipText(value, maxLength) {
  return String(value == null ? '' : value).trim().slice(0, maxLength || 500);
}

function sanitizeLogDetails(details) {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return {};
  const safe = {};
  Object.keys(details).forEach((key) => {
    const value = details[key];
    if (value == null) {
      safe[key] = value;
      return;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
      safe[key] = value;
      return;
    }
    if (typeof value === 'string') {
      safe[key] = clipText(value, 600);
      return;
    }
    if (Array.isArray(value)) {
      safe[key] = value.slice(0, 30).map((item) => clipText(item, 120));
      return;
    }
    if (typeof value === 'object') {
      try {
        safe[key] = JSON.parse(JSON.stringify(value));
      } catch (_) {
        safe[key] = clipText(String(value), 600);
      }
    }
  });
  return safe;
}

function buildAccessContext(event) {
  const headers = event && event.headers ? event.headers : {};
  const hostInfo = getHostInfo(headers);
  return {
    actor: '',
    ip: getClientIP(headers),
    country: getClientCountry(headers),
    userAgent: getUserAgent(headers),
    method: clipText((event && event.httpMethod) || '', 20),
    path: clipText((event && (event.path || event.rawUrl || event.rawPath)) || '', 300),
    host: clipText(hostInfo.host, 180),
    origin: clipText(headers.origin || headers.Origin || '', 240),
    referer: clipText(headers.referer || headers.Referer || '', 400),
    requestId: clipText(getRequestId(headers), 180)
  };
}

async function logAccess(event, eventType, level, details, actor) {
  const ctx = buildAccessContext(event || {});
  ctx.actor = clipText(actor || ctx.actor || '', 120);
  const payload = {
    timestamp: new Date().toISOString(),
    eventType: clipText(eventType, 120),
    level: clipText(level || 'info', 20),
    actor: ctx.actor,
    ip: ctx.ip,
    country: ctx.country,
    method: ctx.method,
    path: ctx.path,
    host: ctx.host,
    origin: ctx.origin,
    referer: ctx.referer,
    requestId: ctx.requestId,
    userAgent: ctx.userAgent,
    details: sanitizeLogDetails(details)
  };

  console.log('[access-log]', JSON.stringify(payload));

  try {
    await ensureSchema();
    await query(
      `INSERT INTO dashboard_access_logs
       (event_type, level, actor, ip, country, user_agent, method, path, host, origin, referer, request_id, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)`,
      [
        payload.eventType,
        payload.level,
        payload.actor,
        payload.ip,
        payload.country,
        payload.userAgent,
        payload.method,
        payload.path,
        payload.host,
        payload.origin,
        payload.referer,
        payload.requestId,
        JSON.stringify(payload.details || {})
      ]
    );
  } catch (err) {
    console.warn('[access-log] DB write failed:', err && err.message ? err.message : err);
  }
}

function parseCSVEnv(name) {
  return String(process.env[name] || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function isIPv4(ip) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(ip);
}

function ipv4ToInt(ip) {
  return ip.split('.').reduce((acc, part) => ((acc << 8) + Number(part)), 0) >>> 0;
}

function ipMatchesRule(ip, rule) {
  const normalizedRule = String(rule || '').trim();
  if (!normalizedRule) return false;
  if (normalizedRule === ip) return true;

  if (normalizedRule.indexOf('/') > -1 && isIPv4(ip)) {
    const pieces = normalizedRule.split('/');
    const baseIp = pieces[0];
    const maskLength = Number(pieces[1]);
    if (!isIPv4(baseIp) || !Number.isInteger(maskLength) || maskLength < 0 || maskLength > 32) return false;

    const mask = maskLength === 0 ? 0 : ((0xFFFFFFFF << (32 - maskLength)) >>> 0);
    return (ipv4ToInt(ip) & mask) === (ipv4ToInt(baseIp) & mask);
  }

  return false;
}

function evaluateNetworkPolicy(headers) {
  const ip = getClientIP(headers);
  const country = getClientCountry(headers);
  const allowedIPs = parseCSVEnv('AUTH_ALLOWED_IPS');
  const blockedIPs = parseCSVEnv('AUTH_BLOCKED_IPS');
  const allowedCountries = parseCSVEnv('AUTH_ALLOWED_COUNTRIES').map((item) => item.toUpperCase());
  const blockedCountries = parseCSVEnv('AUTH_BLOCKED_COUNTRIES').map((item) => item.toUpperCase());

  if (blockedIPs.some((rule) => ipMatchesRule(ip, rule))) {
    return { allowed: false, reason: 'ip_blocked' };
  }

  if (allowedIPs.length > 0 && !allowedIPs.some((rule) => ipMatchesRule(ip, rule))) {
    return { allowed: false, reason: 'ip_not_allowed' };
  }

  if (country) {
    if (blockedCountries.includes(country)) {
      return { allowed: false, reason: 'country_blocked' };
    }
    if (allowedCountries.length > 0 && !allowedCountries.includes(country)) {
      return { allowed: false, reason: 'country_not_allowed' };
    }
  }

  return { allowed: true, reason: '' };
}

function looksLikeBot(headers) {
  const userAgent = getUserAgent(headers).toLowerCase();
  const acceptLanguage = getAcceptLanguage(headers);

  if (!userAgent || !acceptLanguage) return true;

  return /(bot|spider|crawler|headless|curl|wget|python|httpclient|postman|insomnia|powershell|axios|node-fetch|go-http-client|libwww-perl)/i.test(userAgent);
}

function cleanupLoginAttempts(now) {
  for (const [key, entry] of loginAttempts.entries()) {
    if (!entry) {
      loginAttempts.delete(key);
      continue;
    }
    if ((entry.blockedUntil && entry.blockedUntil < now) && (entry.lastAttemptAt + LOGIN_WINDOW_MS < now)) {
      loginAttempts.delete(key);
      continue;
    }
    if (!entry.blockedUntil && (entry.lastAttemptAt + LOGIN_WINDOW_MS < now)) {
      loginAttempts.delete(key);
    }
  }
}

function getLoginThrottleState(headers, username) {
  const now = Date.now();
  cleanupLoginAttempts(now);
  const key = sha256(getClientIP(headers) + '|' + String(username || '').toLowerCase());
  const entry = loginAttempts.get(key);
  if (!entry) {
    return { key, blocked: false, retryAfterMs: 0 };
  }
  if (entry.blockedUntil && entry.blockedUntil > now) {
    return { key, blocked: true, retryAfterMs: entry.blockedUntil - now };
  }
  return { key, blocked: false, retryAfterMs: 0 };
}

function markLoginFailure(throttleKey) {
  const now = Date.now();
  const current = loginAttempts.get(throttleKey);
  const fresh = !current || ((current.firstAttemptAt + LOGIN_WINDOW_MS) < now);
  const next = fresh ? {
    count: 1,
    firstAttemptAt: now,
    lastAttemptAt: now,
    blockedUntil: 0
  } : {
    count: current.count + 1,
    firstAttemptAt: current.firstAttemptAt,
    lastAttemptAt: now,
    blockedUntil: 0
  };

  if (next.count >= LOGIN_MAX_ATTEMPTS) {
    next.blockedUntil = now + LOGIN_LOCK_MS;
  }

  loginAttempts.set(throttleKey, next);
  return next;
}

function clearLoginFailures(headers, username) {
  const key = sha256(getClientIP(headers) + '|' + String(username || '').toLowerCase());
  loginAttempts.delete(key);
}

function getPersistentThrottleKey(headers, username) {
  return sha256(
    getClientIP(headers) + '|' +
    getUserAgent(headers).toLowerCase() + '|' +
    String(username || '').toLowerCase()
  );
}

async function getPersistentLoginThrottleState(headers, username) {
  const now = Date.now();
  const key = getPersistentThrottleKey(headers, username);
  await ensureSchema();
  const result = await query(
    `SELECT failure_count, first_attempt_at AS "firstAttemptAt", last_attempt_at AS "lastAttemptAt",
            blocked_until AS "blockedUntil"
       FROM dashboard_login_attempts
      WHERE throttle_key = $1
      LIMIT 1`,
    [key]
  );
  const row = result.rows[0];
  if (!row) return { key, blocked: false, retryAfterMs: 0 };
  const blockedUntilMs = row.blockedUntil ? new Date(row.blockedUntil).getTime() : 0;
  if (blockedUntilMs > now) {
    return { key, blocked: true, retryAfterMs: blockedUntilMs - now };
  }
  return { key, blocked: false, retryAfterMs: 0 };
}

async function markPersistentLoginFailure(headers, username) {
  const now = Date.now();
  const throttleKey = getPersistentThrottleKey(headers, username);
  const ipHash = sha256(getClientIP(headers));
  const userAgentHash = sha256(getUserAgent(headers).toLowerCase());
  const usernameHint = clipText(String(username || '').toLowerCase(), 120);
  await ensureSchema();

  const currentResult = await query(
    `SELECT failure_count, first_attempt_at AS "firstAttemptAt"
       FROM dashboard_login_attempts
      WHERE throttle_key = $1
      LIMIT 1`,
    [throttleKey]
  );

  const current = currentResult.rows[0];
  const freshWindow = !current || ((new Date(current.firstAttemptAt).getTime() + LOGIN_WINDOW_MS) < now);
  const failureCount = freshWindow ? 1 : (Number(current.failureCount || 0) + 1);
  const firstAttemptAt = freshWindow ? new Date(now) : new Date(current.firstAttemptAt);
  const blockedUntil = failureCount >= LOGIN_MAX_ATTEMPTS ? new Date(now + LOGIN_LOCK_MS) : null;

  await query(
    `INSERT INTO dashboard_login_attempts
      (throttle_key, username_hint, ip_hash, user_agent_hash, failure_count, first_attempt_at, last_attempt_at, blocked_until)
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)
     ON CONFLICT (throttle_key)
     DO UPDATE SET
       username_hint = EXCLUDED.username_hint,
       ip_hash = EXCLUDED.ip_hash,
       user_agent_hash = EXCLUDED.user_agent_hash,
       failure_count = EXCLUDED.failure_count,
       first_attempt_at = EXCLUDED.first_attempt_at,
       last_attempt_at = NOW(),
       blocked_until = EXCLUDED.blocked_until`,
    [throttleKey, usernameHint, ipHash, userAgentHash, failureCount, firstAttemptAt.toISOString(), blockedUntil ? blockedUntil.toISOString() : null]
  );

  return {
    count: failureCount,
    blockedUntil: blockedUntil ? blockedUntil.getTime() : 0
  };
}

async function clearPersistentLoginFailures(headers, username) {
  const throttleKey = getPersistentThrottleKey(headers, username);
  await ensureSchema();
  await query(`DELETE FROM dashboard_login_attempts WHERE throttle_key = $1`, [throttleKey]);
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
  buildAccessContext,
  clearLoginFailures,
  clearSessionCookie,
  createLoginChallengeToken,
  createSessionToken,
  evaluateNetworkPolicy,
  getSessionPayload,
  getLoginThrottleState,
  getPersistentLoginThrottleState,
  getUserAgent,
  isSameOrigin,
  jsonResponse,
  logAccess,
  looksLikeBot,
  markLoginFailure,
  markPersistentLoginFailure,
  readRequestBody,
  verifyLoginChallengeToken,
  verifyPassword,
  clearPersistentLoginFailures
};
