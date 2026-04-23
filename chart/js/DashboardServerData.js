if (!window.DashboardServerData) {
window.DashboardServerData = (function() {
  'use strict';

  var ENDPOINT = '/.netlify/functions/dataset-projects';
  var DATASET_KEY = 'saip-main';
  var SESSION_CACHE_PREFIX = 'analytics-dashboard-session-dataset';

  function getCacheKey() {
    var user = '';
    try {
      user = window.AuthClient && typeof window.AuthClient.getCurrentUser === 'function'
        ? (window.AuthClient.getCurrentUser() || 'anonymous')
        : 'anonymous';
    } catch (_) {
      user = 'anonymous';
    }
    return SESSION_CACHE_PREFIX + '::' + user + '::' + DATASET_KEY;
  }

  function readSessionCache() {
    try {
      var raw = sessionStorage.getItem(getCacheKey());
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.data) || !parsed.data.length) return null;
      return parsed;
    } catch (_) {
      return null;
    }
  }

  function writeSessionCache(payload) {
    try {
      if (!payload || !Array.isArray(payload.data) || !payload.data.length) return;
      sessionStorage.setItem(getCacheKey(), JSON.stringify({
        sourceName: payload.sourceName || '',
        rowCount: payload.rowCount || payload.data.length,
        updatedAt: payload.updatedAt || '',
        payloadHash: payload.payloadHash || '',
        data: payload.data
      }));
    } catch (_) {}
  }

  function readBootstrapDataset() {
    var data = Array.isArray(window.DATA) ? window.DATA : [];
    if (!data.length) return null;
    return {
      sourceName: 'Jeu embarque / session courante',
      rowCount: data.length,
      updatedAt: '',
      payloadHash: '',
      data: data.map(function(item) { return Object.assign({}, item); })
    };
  }

  async function request(url) {
    var response = await fetch(url, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Accept': 'application/json' }
    });
    var text = await response.text();
    var data = {};
    try { data = JSON.parse(text); } catch (_) {}
    return {
      ok: response.ok,
      status: response.status,
      data: data
    };
  }

  async function loadDataset() {
    return request(ENDPOINT + '?datasetKey=' + encodeURIComponent(DATASET_KEY));
  }

  async function hydrateDashboard() {
    var bootstrap = readBootstrapDataset();
    if (bootstrap) {
      writeSessionCache(bootstrap);
      if (typeof window.DashboardDataTransparency !== 'undefined'
          && typeof window.DashboardDataTransparency.setDatasetMeta === 'function') {
        window.DashboardDataTransparency.setDatasetMeta({
          datasetKey: DATASET_KEY,
          sourceName: bootstrap.sourceName,
          rowCount: bootstrap.rowCount,
          updatedAt: bootstrap.updatedAt,
          payloadHash: bootstrap.payloadHash,
          storageMode: 'bootstrap',
          sourceType: 'bootstrap'
        });
      }
      return {
        ok: true,
        sourceName: bootstrap.sourceName,
        rowCount: bootstrap.rowCount,
        updatedAt: bootstrap.updatedAt,
        payloadHash: bootstrap.payloadHash,
        storageMode: 'bootstrap'
      };
    }

    var result = await loadDataset();
    if (!result.ok || !result.data || !Array.isArray(result.data.data) || !result.data.data.length) {
      var cached = readSessionCache();
      if (cached) {
        if (typeof window.setDashboardData === 'function') {
          window.setDashboardData(cached.data, { initializeDataFilterEngine: true, skipUpdate: true });
        } else {
          window.DATA = cached.data.map(function(item) { return Object.assign({}, item); });
        }
        if (typeof window.DashboardDataTransparency !== 'undefined'
            && typeof window.DashboardDataTransparency.setDatasetMeta === 'function') {
          window.DashboardDataTransparency.setDatasetMeta({
            datasetKey: DATASET_KEY,
            sourceName: cached.sourceName || 'Cache session',
            rowCount: cached.rowCount || cached.data.length,
            updatedAt: cached.updatedAt || '',
            payloadHash: cached.payloadHash || '',
            storageMode: 'session-cache',
            sourceType: 'server-cache'
          });
        }
        return {
          ok: true,
          sourceName: cached.sourceName || 'Cache session',
          rowCount: cached.rowCount || cached.data.length,
          updatedAt: cached.updatedAt || '',
          payloadHash: cached.payloadHash || '',
          storageMode: 'session-cache'
        };
      }
      return {
        ok: false,
        status: result.status,
        error: result && result.data && result.data.error ? result.data.error : 'dataset_unavailable',
        rowCount: 0
      };
    }

    if (typeof window.setDashboardData === 'function') {
      window.setDashboardData(result.data.data, { initializeDataFilterEngine: true, skipUpdate: true });
    } else {
      window.DATA = result.data.data.map(function(item) { return Object.assign({}, item); });
    }

    writeSessionCache(result.data);
    if (typeof window.DashboardDataTransparency !== 'undefined'
        && typeof window.DashboardDataTransparency.setDatasetMeta === 'function') {
      window.DashboardDataTransparency.setDatasetMeta({
        datasetKey: DATASET_KEY,
        sourceName: result.data.sourceName || '',
        rowCount: result.data.rowCount || result.data.data.length,
        updatedAt: result.data.updatedAt || '',
        payloadHash: result.data.payloadHash || '',
        storageMode: result.data.storageMode || 'plain',
        sourceType: 'server'
      });
    }

    return {
      ok: true,
      sourceName: result.data.sourceName || '',
      rowCount: result.data.rowCount || result.data.data.length,
      updatedAt: result.data.updatedAt || '',
      payloadHash: result.data.payloadHash || '',
      storageMode: result.data.storageMode || 'plain'
    };
  }

  return {
    DATASET_KEY: DATASET_KEY,
    hydrateDashboard: hydrateDashboard,
    loadDataset: loadDataset
  };
})();
}
