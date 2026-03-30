function getCookie(request, name) {
  const cookieHeader = request.headers.get('cookie') || '';
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    if (key !== name) continue;
    return trimmed.slice(eqIndex + 1).trim();
  }
  return '';
}

function fromBase64Url(input) {
  const normalized = String(input || '').replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  const binary = atob(normalized + padding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toBase64Url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function signPayload(encodedPayload, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(encodedPayload));
  return toBase64Url(new Uint8Array(signature));
}

function readSecret(context) {
  try {
    if (context && context.env && typeof context.env.get === 'function') {
      const value = context.env.get('AUTH_SESSION_SECRET');
      if (value) return String(value);
    }
  } catch (_) {}

  try {
    if (globalThis.Netlify && globalThis.Netlify.env && typeof globalThis.Netlify.env.get === 'function') {
      const value = globalThis.Netlify.env.get('AUTH_SESSION_SECRET');
      if (value) return String(value);
    }
  } catch (_) {}

  try {
    if (typeof Deno !== 'undefined' && Deno.env && typeof Deno.env.get === 'function') {
      const value = Deno.env.get('AUTH_SESSION_SECRET');
      if (value) return String(value);
    }
  } catch (_) {}

  return '';
}

async function hasValidSession(request, context) {
  const token = getCookie(request, 'sp_dashboard_session');
  if (!token || token.indexOf('.') === -1) return false;

  const secret = readSecret(context);
  if (!secret || secret.length < 32) return false;

  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const encodedPayload = parts[0];
  const signature = parts[1];
  const expectedSignature = await signPayload(encodedPayload, secret);
  if (!timingSafeEqual(signature, expectedSignature)) return false;

  try {
    const payloadText = new TextDecoder().decode(fromBase64Url(encodedPayload));
    const payload = JSON.parse(payloadText);
    return !!(payload && typeof payload.user === 'string' && typeof payload.exp === 'number' && payload.exp > Date.now());
  } catch (_) {
    return false;
  }
}

function buildRedirect(request) {
  const url = new URL(request.url);
  const next = encodeURIComponent(url.pathname + (url.search || ''));
  return Response.redirect(url.origin + '/chart/login.html?next=' + next, 302);
}

export default async (request, context) => {
  if (await hasValidSession(request, context)) {
    return context.next();
  }
  return buildRedirect(request);
};
