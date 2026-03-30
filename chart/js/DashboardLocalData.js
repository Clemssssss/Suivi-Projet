if (!window.DashboardLocalData) {
window.DashboardLocalData = (function() {
  'use strict';

  var DB_NAME = 'analytics-dashboard-user-data';
  var STORE_NAME = 'datasets';
  var PAGE_KEY = 'chart';
  var _dbPromise = null;
  var _status = { loaded: false, rowCount: 0, updatedAt: '' };

  function _userKey() {
    var user = (window.AuthClient && typeof window.AuthClient.getCurrentUser === 'function')
      ? window.AuthClient.getCurrentUser()
      : '';
    return user ? (PAGE_KEY + '::' + user) : '';
  }

  function _fmtDate(value) {
    if (!value) return '';
    try {
      return new Date(value).toLocaleString('fr-FR', {
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
      });
    } catch (err) {
      return String(value);
    }
  }

  function _syncUi() {
    var button = document.getElementById('btn-clear-local-data');
    if (button) {
      button.disabled = !_status.loaded;
      button.style.opacity = _status.loaded ? '1' : '.55';
      button.title = _status.loaded
        ? ('Supprimer le dataset local de ' + _status.rowCount + ' lignes'
          + (_status.updatedAt ? ' (' + _fmtDate(_status.updatedAt) + ')' : ''))
        : 'Aucune donnée locale enregistrée';
    }

    var pill = document.getElementById('local-data-status');
    if (pill) {
      if (_status.loaded) {
        pill.style.display = 'inline-flex';
        pill.textContent = '💾 ' + _status.rowCount + ' lignes locales';
        pill.title = _status.updatedAt ? ('Dernière mise à jour locale : ' + _fmtDate(_status.updatedAt)) : 'Dataset local chargé';
      } else {
        pill.style.display = 'none';
        pill.textContent = '';
        pill.title = '';
      }
    }
  }

  function _openDb() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise(function(resolve, reject) {
      if (!('indexedDB' in window)) {
        reject(new Error('IndexedDB indisponible'));
        return;
      }
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function(event) {
        var db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      };
      req.onsuccess = function(event) { resolve(event.target.result); };
      req.onerror = function() { reject(req.error || new Error('Impossible d’ouvrir IndexedDB')); };
    });
    return _dbPromise;
  }

  async function _getStore(mode) {
    var db = await _openDb();
    return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
  }

  async function loadForCurrentUser() {
    var key = _userKey();
    if (!key) {
      _status = { loaded: false, rowCount: 0, updatedAt: '' };
      _syncUi();
      return null;
    }
    try {
      var store = await _getStore('readonly');
      return await new Promise(function(resolve, reject) {
        var req = store.get(key);
        req.onsuccess = function() {
          var record = req.result || null;
          _status.loaded = !!(record && Array.isArray(record.data) && record.data.length);
          _status.rowCount = record && Array.isArray(record.data) ? record.data.length : 0;
          _status.updatedAt = record && record.updatedAt ? record.updatedAt : '';
          _syncUi();
          resolve(record);
        };
        req.onerror = function() { reject(req.error); };
      });
    } catch (err) {
      console.warn('[DashboardLocalData] Lecture locale impossible', err);
      _status = { loaded: false, rowCount: 0, updatedAt: '' };
      _syncUi();
      return null;
    }
  }

  async function saveImportedDataset(data, meta) {
    var key = _userKey();
    if (!key || !Array.isArray(data)) return false;
    var record = {
      key: key,
      pageKey: PAGE_KEY,
      user: key.split('::')[1],
      data: data.map(function(item) { return Object.assign({}, item); }),
      rowCount: data.length,
      updatedAt: new Date().toISOString(),
      source: meta && meta.source ? meta.source : 'import'
    };
    try {
      var store = await _getStore('readwrite');
      await new Promise(function(resolve, reject) {
        var req = store.put(record);
        req.onsuccess = function() { resolve(true); };
        req.onerror = function() { reject(req.error); };
      });
      _status.loaded = true;
      _status.rowCount = record.rowCount;
      _status.updatedAt = record.updatedAt;
      _syncUi();
      return true;
    } catch (err) {
      console.warn('[DashboardLocalData] Sauvegarde locale impossible', err);
      return false;
    }
  }

  async function clearCurrentUserData() {
    var key = _userKey();
    if (!key) return false;
    try {
      var store = await _getStore('readwrite');
      await new Promise(function(resolve, reject) {
        var req = store.delete(key);
        req.onsuccess = function() { resolve(true); };
        req.onerror = function() { reject(req.error); };
      });
      _status = { loaded: false, rowCount: 0, updatedAt: '' };
      _syncUi();
      return true;
    } catch (err) {
      console.warn('[DashboardLocalData] Suppression locale impossible', err);
      return false;
    }
  }

  async function hydrateDashboard() {
    var record = await loadForCurrentUser();
    if (!record || !Array.isArray(record.data) || !record.data.length) return null;
    if (typeof window.setDashboardData === 'function') {
      window.setDashboardData(record.data, { initializeDataFilterEngine: true, skipUpdate: true });
    } else {
      window.DATA = record.data.map(function(item) { return Object.assign({}, item); });
    }
    return record;
  }

  function bindUi() {
    var button = document.getElementById('btn-clear-local-data');
    if (button && !button._localDataBound) {
      button._localDataBound = true;
      button.addEventListener('click', async function() {
        var ok = await clearCurrentUserData();
        if (ok && typeof notify === 'function') {
          notify('Données locales supprimées', 'Le dataset local de cet utilisateur a été effacé', 'success', 2600);
        } else if (!ok && typeof notify === 'function') {
          notify('Suppression impossible', 'Impossible d’effacer les données locales', 'error', 2600);
        }
      });
    }
    _syncUi();
  }

  return {
    bindUi: bindUi,
    clearCurrentUserData: clearCurrentUserData,
    hydrateDashboard: hydrateDashboard,
    loadForCurrentUser: loadForCurrentUser,
    saveImportedDataset: saveImportedDataset
  };
})();
}
