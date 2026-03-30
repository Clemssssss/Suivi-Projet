if (!window.DashboardServerData) {
window.DashboardServerData = (function() {
  'use strict';

  var ENDPOINT = '/.netlify/functions/dataset-projects';
  var DATASET_KEY = 'saip-main';

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
    var result = await loadDataset();
    if (!result.ok || !result.data || !Array.isArray(result.data.data) || !result.data.data.length) {
      return null;
    }

    if (typeof window.setDashboardData === 'function') {
      window.setDashboardData(result.data.data, { initializeDataFilterEngine: true, skipUpdate: true });
    } else {
      window.DATA = result.data.data.map(function(item) { return Object.assign({}, item); });
    }

    return {
      sourceName: result.data.sourceName || '',
      rowCount: result.data.rowCount || result.data.data.length,
      updatedAt: result.data.updatedAt || '',
      payloadHash: result.data.payloadHash || ''
    };
  }

  return {
    DATASET_KEY: DATASET_KEY,
    hydrateDashboard: hydrateDashboard,
    loadDataset: loadDataset
  };
})();
}
