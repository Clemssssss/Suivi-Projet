if (!window.AuthClient) {
window.AuthClient = (function() {
  'use strict';

  var DEFAULT_NEXT = '/chart/chart.html';

  function parseJSONSafe(text) {
    try {
      return JSON.parse(text);
    } catch (err) {
      return {};
    }
  }

  function sanitizeNext(nextValue) {
    if (typeof nextValue !== 'string' || !nextValue.trim()) return DEFAULT_NEXT;

    try {
      var candidate = nextValue.trim();
      var parsed = new URL(candidate, window.location.origin);
      if (parsed.origin !== window.location.origin) return DEFAULT_NEXT;
      if (!parsed.pathname.startsWith('/')) return DEFAULT_NEXT;
      if (parsed.pathname.indexOf('/.netlify/') === 0) return DEFAULT_NEXT;
      if (parsed.pathname.indexOf('/chart/login.html') === 0) return DEFAULT_NEXT;
      return parsed.pathname + parsed.search + parsed.hash;
    } catch (err) {
      return DEFAULT_NEXT;
    }
  }

  async function request(path, options) {
    var response = await fetch(path, Object.assign({
      credentials: 'same-origin',
      cache: 'no-store'
    }, options || {}));

    var text = await response.text();
    var data = parseJSONSafe(text);

    return {
      ok: response.ok,
      status: response.status,
      data: data
    };
  }

  async function status() {
    return request('/.netlify/functions/auth-status', {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });
  }

  async function login(payload) {
    return request('/.netlify/functions/auth-login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        username: typeof payload.username === 'string' ? payload.username : '',
        password: typeof payload.password === 'string' ? payload.password : ''
      })
    });
  }

  async function logout() {
    return request('/.netlify/functions/auth-logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: '{}'
    });
  }

  function setDocumentAuthenticated(isAuthenticated) {
    document.documentElement.classList.toggle('auth-pending', !isAuthenticated);
    document.documentElement.classList.toggle('auth-ready', !!isAuthenticated);
  }

  return {
    DEFAULT_NEXT: DEFAULT_NEXT,
    sanitizeNext: sanitizeNext,
    status: status,
    login: login,
    logout: logout,
    setDocumentAuthenticated: setDocumentAuthenticated
  };
})();
}
