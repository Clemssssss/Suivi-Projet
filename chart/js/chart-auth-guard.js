if (!window.DashboardAuthGuard) {
window.DashboardAuthGuard = (function() {
  'use strict';

  var state = {
    checked: false,
    authenticated: false,
    user: '',
    role: '',
    isAdmin: false,
    isReadOnly: false
  };

  var lastReadOnlyNoticeAt = 0;
  var domSyncScheduled = false;

  function whenBodyReady(callback) {
    if (document.body) {
      callback();
      return;
    }
    document.addEventListener('DOMContentLoaded', callback, { once: true });
  }

  function syncStateToDOM() {
    if (!document.body || document.readyState === 'loading') {
      if (!domSyncScheduled) {
        domSyncScheduled = true;
        document.addEventListener('DOMContentLoaded', function() {
          domSyncScheduled = false;
          syncStateToDOM();
        }, { once: true });
      }
      return;
    }

    updateHeaderUser();
    updateRoleVisibility();
    updateReadOnlyUI();
    bindLogout();
    bindReadOnlyGuard();
    window.AuthClient.setDocumentAuthenticated(true);
    document.dispatchEvent(new CustomEvent('dashboard-auth-ready', {
      detail: { user: state.user, role: state.role, isAdmin: state.isAdmin, isReadOnly: state.isReadOnly }
    }));
  }

  function getNextURL() {
    return window.AuthClient.sanitizeNext(
      window.location.pathname + window.location.search + window.location.hash
    );
  }

  async function redirectToLogin() {
    try {
      if (window.DashboardLocalData && typeof window.DashboardLocalData.purgeAllLocalData === 'function') {
        await window.DashboardLocalData.purgeAllLocalData();
      }
    } catch (err) {
      console.warn('[AuthGuard] Purge locale impossible avant redirection', err);
    }
    var next = encodeURIComponent(getNextURL());
    window.location.replace('/chart/login.html?next=' + next);
  }

  function updateHeaderUser() {
    var userEl = document.getElementById('auth-user-label');
    if (userEl) {
      userEl.textContent = state.user ? ('🔒 ' + state.user + ' · ' + (state.role || (state.isAdmin ? 'admin' : 'user'))) : '🔒 Session';
    }
  }

  function updateRoleVisibility() {
    var adminOnlyNodes = document.querySelectorAll('[data-admin-only="1"]');
    adminOnlyNodes.forEach(function(node) {
      node.hidden = !state.isAdmin;
      node.setAttribute('aria-hidden', state.isAdmin ? 'false' : 'true');
      if (state.isAdmin) {
        if (node.id === 'csv-import-trigger') node.style.display = 'inline-flex';
        if (node.id === 'btn-data-admin') node.style.display = 'inline-flex';
        if (node.id === 'btn-db-upload') node.style.display = 'inline-flex';
      } else if (node.id === 'csv-import-trigger' || node.id === 'btn-data-admin' || node.id === 'btn-db-upload') {
        node.style.display = 'none';
      }
    });
    whenBodyReady(function() {
      document.body.classList.toggle('role-admin', !!state.isAdmin);
      document.body.classList.toggle('role-user', !state.isAdmin && !state.isReadOnly);
      document.body.classList.toggle('role-consultation', !!state.isReadOnly);
    });
  }

  function updateReadOnlyUI() {
    var hiddenSelectors = [
      '#btn-share',
      '#btn-csv',
      '#btn-excel',
      '#btn-export-json',
      '#btn-email-report',
      '#csv-import-trigger',
      '#btn-sharepoint-refresh',
      '#btn-sharepoint-source',
      '#clear-all-floating',
      '#btn-strategic',
      '#btn-toggle-diagnostics',
      '#btn-toggle-forecast',
      '#btn-toggle-compare',
      '#btn-toggle-analysis',
      '#btn-cols-config',
      '.chart-export-btn',
      '.chart-toggle-btn',
      '.chart-cfg-btn',
      '.chart-pref-btn',
      '.chart-filter-badge',
      '.restore-btn',
      '.business-drill-btn',
      '.cdd-btn-excel'
    ];
    hiddenSelectors.forEach(function(selector) {
      document.querySelectorAll(selector).forEach(function(node) {
        node.hidden = !!state.isReadOnly;
        node.setAttribute('aria-hidden', state.isReadOnly ? 'true' : 'false');
      });
    });

    [
      '#year-filter',
      '#date-field-selector',
      '#ca-mode',
      '#energy-type-filter',
      '#timeline-preset',
      '#timeline-start',
      '#timeline-end',
      '#biz-performance-view',
      '#biz-performance-combo-scope',
      '#biz-performance-status-filter',
      '#biz-pipe-view',
      '#search-input',
      '#search-bar'
    ].forEach(function(selector) {
      document.querySelectorAll(selector).forEach(function(node) {
        if ('disabled' in node) node.disabled = !!state.isReadOnly;
        node.setAttribute('aria-disabled', state.isReadOnly ? 'true' : 'false');
      });
    });
  }

  function showReadOnlyNotice() {
    if (!state.isReadOnly) return;
    var now = Date.now();
    if ((now - lastReadOnlyNoticeAt) < 1600) return;
    lastReadOnlyNoticeAt = now;
    if (typeof window.notify === 'function') {
      window.notify('Mode consultation', 'Ce profil est en lecture seule', 'info', 2000);
    }
  }

  function bindReadOnlyGuard() {
    if (document.documentElement.dataset.readOnlyGuardBound === '1') return;
    document.documentElement.dataset.readOnlyGuardBound = '1';

    function isAllowedTarget(target) {
      if (!target || !target.closest) return false;
      return !!target.closest('#btn-logout, #btn-open-manual, .info-icon, .chart-info-btn, [data-info]');
    }

    function findBlockedTarget(target) {
      if (!target || !target.closest) return null;
      return target.closest(
        'button, a, input, select, textarea, canvas, .filter-badge, .ffb-pill, .business-kpi, .business-drill-btn, .restore-btn, .chart-toggle-btn, .chart-cfg-btn, .chart-pref-btn, .chart-filter-badge, .cdd-btn-excel'
      );
    }

    document.addEventListener('click', function(event) {
      if (!state.isReadOnly) return;
      var blocked = findBlockedTarget(event.target);
      if (!blocked || isAllowedTarget(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      showReadOnlyNotice();
    }, true);

    document.addEventListener('change', function(event) {
      if (!state.isReadOnly) return;
      var blocked = findBlockedTarget(event.target);
      if (!blocked || isAllowedTarget(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      showReadOnlyNotice();
    }, true);
  }

  function bindLogout() {
    var button = document.getElementById('btn-logout');
    if (!button || button._logoutBound) return;
    button._logoutBound = true;
    button.addEventListener('click', async function() {
      button.disabled = true;
      try {
        if (window.DashboardLocalData && typeof window.DashboardLocalData.purgeAllLocalData === 'function') {
          await window.DashboardLocalData.purgeAllLocalData();
        }
        await window.AuthClient.logout();
      } catch (err) {
        console.warn('[AuthGuard] Logout impossible', err);
      } finally {
        window.location.replace('/chart/login.html');
      }
    });
  }

  async function ensureAuthenticated() {
    try {
      var result = await window.AuthClient.status();
      state.checked = true;
      state.authenticated = !!(result.ok && result.data && result.data.authenticated);
      state.user = state.authenticated && typeof result.data.user === 'string'
        ? result.data.user
        : '';
      state.role = state.authenticated && result.data && typeof result.data.role === 'string'
        ? result.data.role
        : '';
      state.isAdmin = !!(state.authenticated && result.data && result.data.isAdmin);
      state.isReadOnly = !!(state.authenticated && result.data && (result.data.isReadOnly || state.role === 'consultation'));

      if (!state.authenticated) {
        await redirectToLogin();
        return false;
      }

      syncStateToDOM();
      return true;
    } catch (err) {
      console.error('[AuthGuard] Vérification session impossible', err);
      await redirectToLogin();
      return false;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindLogout);
  } else {
    bindLogout();
  }

  ensureAuthenticated();

  return {
    ensureAuthenticated: ensureAuthenticated,
    isAuthenticated: function() { return state.authenticated; },
    isReady: function() { return state.checked; },
    getUser: function() { return state.user || ''; },
    getRole: function() { return state.role || ''; },
    isAdmin: function() { return !!state.isAdmin; },
    isReadOnly: function() { return !!state.isReadOnly; }
  };
})();
}
