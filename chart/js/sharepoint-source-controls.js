(function() {
  'use strict';

  function qs(id) { return document.getElementById(id); }

  async function fetchJson(url, options) {
    var response = await fetch(url, Object.assign({
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Accept': 'application/json' }
    }, options || {}));
    var data = await response.json();
    if (!response.ok) {
      throw new Error(data && data.error ? data.error : ('HTTP ' + response.status));
    }
    return data;
  }

  function setButtonsVisible(isVisible) {
    var refresh = qs('btn-sharepoint-refresh');
    var source = qs('btn-sharepoint-source');
    if (refresh) refresh.style.display = isVisible ? 'inline-flex' : 'none';
    if (source) source.style.display = isVisible ? 'inline-flex' : 'none';
  }

  async function refreshSharePoint(button) {
    if (!button) return;
    var original = button.textContent;
    button.disabled = true;
    button.textContent = '⏳ Refresh...';
    try {
      var data = await fetchJson('/.netlify/functions/sharepoint-source-admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ action: 'trigger_sync' })
      });
      button.textContent = '✅ Sync OK';
      setTimeout(function() {
        button.textContent = original;
        button.disabled = false;
      }, 1600);

      if (window.AE && typeof window.AE.init === 'function') {
        try { await window.AE.init(); } catch (_) {}
      }
      if (window.BusinessChartsDashboard && typeof window.BusinessChartsDashboard.render === 'function') {
        try { window.BusinessChartsDashboard.render(); } catch (_) {}
      }
      if (typeof window.update === 'function') {
        try { window.update(); } catch (_) {}
      }

      var count = data && data.syncResult && data.syncResult.rowCount ? data.syncResult.rowCount : null;
      window.alert('Synchronisation SharePoint terminée' + (count ? ' : ' + count + ' projet(s)' : '') + '.');
    } catch (err) {
      button.textContent = '❌ Échec';
      setTimeout(function() {
        button.textContent = original;
        button.disabled = false;
      }, 2200);
      window.alert('Synchronisation SharePoint impossible : ' + (err && err.message ? err.message : 'erreur inconnue'));
    }
  }

  function bindControls() {
    var refresh = qs('btn-sharepoint-refresh');
    if (refresh && !refresh._sharepointBound) {
      refresh._sharepointBound = true;
      refresh.addEventListener('click', function() {
        refreshSharePoint(refresh);
      });
    }
  }

  async function initFromStatus() {
    if (!window.AuthClient || typeof window.AuthClient.status !== 'function') return;
    try {
      var auth = await window.AuthClient.status();
      var isAdmin = !!(auth && auth.ok && auth.data && auth.data.authenticated && auth.data.isAdmin);
      setButtonsVisible(isAdmin);
    } catch (_) {
      setButtonsVisible(false);
    }
  }

  document.addEventListener('dashboard-auth-ready', function(event) {
    setButtonsVisible(!!(event && event.detail && event.detail.isAdmin));
    bindControls();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      bindControls();
      initFromStatus();
    }, { once: true });
  } else {
    bindControls();
    initFromStatus();
  }
})();
