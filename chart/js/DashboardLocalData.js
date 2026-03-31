if (!window.DashboardLocalData) {
window.DashboardLocalData = (function() {
  'use strict';

  var DB_NAME = 'analytics-dashboard-user-data';
  var FALLBACK_PREFIX = 'analytics-dashboard-user-data-fallback';

  function _hideUi() {
    var button = document.getElementById('btn-clear-local-data');
    if (button) {
      button.disabled = true;
      button.style.display = 'none';
    }

    var pill = document.getElementById('local-data-status');
    if (pill) {
      pill.style.display = 'none';
      pill.textContent = '';
      pill.title = '';
    }
  }

  function _clearFallbackStorage() {
    try {
      var keys = [];
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key && key.indexOf(FALLBACK_PREFIX + '::') === 0) keys.push(key);
      }
      keys.forEach(function(key) { localStorage.removeItem(key); });
      return true;
    } catch (err) {
      console.warn('[DashboardLocalData] Suppression localStorage impossible', err);
      return false;
    }
  }

  function _deleteIndexedDb() {
    return new Promise(function(resolve) {
      if (!('indexedDB' in window)) {
        resolve(false);
        return;
      }
      var req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = function() { resolve(true); };
      req.onerror = function() {
        console.warn('[DashboardLocalData] Suppression IndexedDB impossible', req.error);
        resolve(false);
      };
      req.onblocked = function() {
        console.warn('[DashboardLocalData] Suppression IndexedDB bloquée');
        resolve(false);
      };
    });
  }

  async function clearCurrentUserData() {
    var idbOk = await _deleteIndexedDb();
    var fallbackOk = _clearFallbackStorage();
    _hideUi();
    return !!(idbOk || fallbackOk);
  }

  async function purgeAllLocalData() {
    return clearCurrentUserData();
  }

  async function loadForCurrentUser() {
    _hideUi();
    return null;
  }

  async function hydrateDashboard() {
    _hideUi();
    return null;
  }

  async function saveImportedDataset() {
    _hideUi();
    return false;
  }

  function bindUi() {
    _hideUi();
  }

  return {
    bindUi: bindUi,
    clearCurrentUserData: clearCurrentUserData,
    purgeAllLocalData: purgeAllLocalData,
    hydrateDashboard: hydrateDashboard,
    loadForCurrentUser: loadForCurrentUser,
    saveImportedDataset: saveImportedDataset
  };
})();
}
