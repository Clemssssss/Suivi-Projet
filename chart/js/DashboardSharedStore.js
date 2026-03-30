if (!window.DashboardSharedStore) {
window.DashboardSharedStore = (function() {
  'use strict';

  var ENDPOINT = '/.netlify/functions/shared-state';

  function _sanitizeToken(value, fallback) {
    return String(value || fallback || 'global')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9:_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || String(fallback || 'global');
  }

  async function _request(method, path, payload) {
    var response = await fetch(ENDPOINT + path, {
      method: method,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: payload ? JSON.stringify(payload) : undefined
    });
    var text = await response.text();
    var data = {};
    try { data = text ? JSON.parse(text) : {}; } catch (_) {}
    if (!response.ok) {
      var err = new Error(data && data.error ? data.error : ('HTTP ' + response.status));
      err.status = response.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  async function get(docType, docKey, scope) {
    var query = '?docType=' + encodeURIComponent(_sanitizeToken(docType, ''))
      + '&docKey=' + encodeURIComponent(String(docKey || ''))
      + '&scope=' + encodeURIComponent(_sanitizeToken(scope, 'global'));
    var result = await _request('GET', query);
    return result.document || null;
  }

  async function list(docType, scope) {
    var query = '?docType=' + encodeURIComponent(_sanitizeToken(docType, ''))
      + '&scope=' + encodeURIComponent(_sanitizeToken(scope, 'global'));
    var result = await _request('GET', query);
    return Array.isArray(result.documents) ? result.documents : [];
  }

  async function upsert(docType, docKey, payload, scope) {
    var result = await _request('PUT', '', {
      docType: _sanitizeToken(docType, ''),
      docKey: String(docKey || ''),
      scope: _sanitizeToken(scope, 'global'),
      payload: payload || {}
    });
    return result.document || null;
  }

  async function remove(docType, docKey, scope) {
    return _request('DELETE', '', {
      docType: _sanitizeToken(docType, ''),
      docKey: String(docKey || ''),
      scope: _sanitizeToken(scope, 'global')
    });
  }

  return {
    get: get,
    list: list,
    upsert: upsert,
    remove: remove
  };
})();
}
