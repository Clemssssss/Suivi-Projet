(function() {
  'use strict';

  var state = {
    currentUser: '',
    source: null
  };

  function qs(id) { return document.getElementById(id); }

  function formatDate(value) {
    if (!value) return '—';
    try { return new Date(value).toLocaleString('fr-FR'); } catch (_) { return String(value); }
  }

  async function fetchJson(url, options) {
    var response = await fetch(url, Object.assign({
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Accept': 'application/json' }
    }, options || {}));
    var data = await response.json();
    if (!response.ok) throw new Error(data && data.error ? data.error : ('HTTP ' + response.status));
    return data;
  }

  function setStatus(message, className) {
    var el = qs('source-status');
    if (!el) return;
    el.className = 'status' + (className ? (' ' + className) : '');
    el.textContent = message;
  }

  function updateHeaderUser() {
    var el = qs('auth-user-label');
    if (el) el.textContent = state.currentUser ? ('🔒 ' + state.currentUser) : '🔒 Session';
  }

  function applySource(source) {
    state.source = source || null;
    qs('sp-file-url').value = source && source.config ? (source.config.fileUrl || '') : '';
    qs('sp-source-name').value = source ? (source.sourceName || '') : '';
    qs('sp-dataset-key').value = source ? (source.datasetKey || 'saip-main') : 'saip-main';
    qs('sp-auth-mode').value = source && source.config ? (source.config.authMode || 'none') : 'none';
    qs('sp-bearer-token').value = '';
    qs('sp-enabled').value = source && source.isEnabled ? 'true' : 'false';

    var rows = [
      ['Source', source && source.config ? (source.config.fileUrl || '—') : '—'],
      ['Dataset', source ? (source.datasetKey || '—') : '—'],
      ['Authentification', source && source.config ? (source.config.authMode || 'none') : '—'],
      ['Token', source && source.config && source.config.hasBearerToken ? 'Configuré' : 'Non configuré'],
      ['Dernier statut', source ? (source.lastSyncStatus || 'never') : '—'],
      ['Dernière sync', source ? formatDate(source.lastSyncAt) : '—'],
      ['Nb lignes', source ? String(source.lastRowCount || 0) : '—'],
      ['Mis à jour par', source ? (source.updatedBy || '—') : '—']
    ];
    qs('source-snapshot').innerHTML = rows.map(function(row) {
      return '<div>' + row[0] + '</div><div>' + row[1] + '</div>';
    }).join('');
  }

  async function loadSource() {
    setStatus('Chargement…');
    var data = await fetchJson('/.netlify/functions/sharepoint-source-admin');
    applySource(data.source || null);
    setStatus('Configuration chargée.', 'ok');
  }

  async function saveSource(event) {
    event.preventDefault();
    var payload = {
      action: 'save_settings',
      fileUrl: qs('sp-file-url').value.trim(),
      sourceName: qs('sp-source-name').value.trim(),
      datasetKey: qs('sp-dataset-key').value.trim(),
      authMode: qs('sp-auth-mode').value,
      bearerToken: qs('sp-bearer-token').value.trim(),
      isEnabled: qs('sp-enabled').value === 'true'
    };
    setStatus('Sauvegarde en cours…');
    var data = await fetchJson('/.netlify/functions/sharepoint-source-admin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    applySource(data.source || null);
    qs('sp-bearer-token').value = '';
    setStatus('Configuration sauvegardée.', 'ok');
  }

  async function syncSource() {
    setStatus('Synchronisation en cours…');
    var data = await fetchJson('/.netlify/functions/sharepoint-source-admin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ action: 'trigger_sync' })
    });
    applySource(data.source || null);
    var count = data && data.syncResult ? data.syncResult.rowCount : 0;
    setStatus('Synchronisation terminée : ' + count + ' projet(s).', 'ok');
  }

  async function testSource() {
    setStatus('Test de la source en cours…');
    var payload = {
      action: 'test_source',
      fileUrl: qs('sp-file-url').value.trim(),
      sourceName: qs('sp-source-name').value.trim(),
      datasetKey: qs('sp-dataset-key').value.trim(),
      authMode: qs('sp-auth-mode').value,
      bearerToken: qs('sp-bearer-token').value.trim(),
      isEnabled: qs('sp-enabled').value === 'true'
    };
    try {
      var data = await fetchJson('/.netlify/functions/sharepoint-source-admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      applySource(data.source || null);
      var test = data.testResult || {};
      if (!test.ok) {
        setStatus('Test KO : ' + (test.message || 'source non exploitable'), 'err');
        return;
      }
      setStatus(
        'Test OK — type: ' + (test.kind || 'unknown')
        + ' • lignes: ' + String(test.rowCount || 0)
        + (test.sheetName ? (' • feuille: ' + test.sheetName) : '')
        + (test.resolver ? (' • mode: ' + test.resolver) : '')
        + (test.graphItemName ? (' • fichier: ' + test.graphItemName) : '')
        + (test.finalUrl ? (' • URL finale: ' + test.finalUrl) : ''),
        'ok'
      );
    } catch (err) {
      setStatus('Test KO : ' + (err && err.message ? err.message : 'source non exploitable'), 'err');
    }
  }

  async function initAuth() {
    if (!window.AuthClient || typeof window.AuthClient.status !== 'function') {
      window.location.replace('/chart/login.html?next=' + encodeURIComponent('/chart/source-sync.html'));
      return false;
    }
    var auth = await window.AuthClient.status();
    if (!(auth.ok && auth.data && auth.data.authenticated)) {
      window.location.replace('/chart/login.html?next=' + encodeURIComponent('/chart/source-sync.html'));
      return false;
    }
    if (!(auth.data && auth.data.isAdmin)) {
      window.location.replace('/chart/chart.html');
      return false;
    }
    state.currentUser = typeof auth.data.user === 'string' ? auth.data.user : '';
    updateHeaderUser();
    return true;
  }

  function bindLogout() {
    var button = qs('btn-logout');
    if (!button || button._logoutBound) return;
    button._logoutBound = true;
    button.addEventListener('click', async function() {
      button.disabled = true;
      try { await window.AuthClient.logout(); } catch (_) {}
      window.location.replace('/chart/login.html');
    });
  }

  function bindActions() {
    var form = qs('source-form');
    if (form && !form._bound) {
      form._bound = true;
      form.addEventListener('submit', function(event) {
        saveSource(event).catch(function(err) {
          setStatus('Erreur : ' + (err && err.message ? err.message : 'sauvegarde impossible'), 'err');
        });
      });
    }
    var syncBtn = qs('btn-sync-source');
    if (syncBtn && !syncBtn._bound) {
      syncBtn._bound = true;
      syncBtn.addEventListener('click', function() {
        syncBtn.disabled = true;
        syncSource().catch(function(err) {
          setStatus('Erreur : ' + (err && err.message ? err.message : 'synchronisation impossible'), 'err');
        }).finally(function() {
          syncBtn.disabled = false;
        });
      });
    }
    var testBtn = qs('btn-test-source');
    if (testBtn && !testBtn._bound) {
      testBtn._bound = true;
      testBtn.addEventListener('click', function() {
        testBtn.disabled = true;
        testSource().finally(function() {
          testBtn.disabled = false;
        });
      });
    }
  }

  async function init() {
    bindLogout();
    bindActions();
    var ok = await initAuth();
    if (!ok) return;
    await loadSource();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
