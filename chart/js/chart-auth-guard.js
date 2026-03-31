if (!window.DashboardAuthGuard) {
window.DashboardAuthGuard = (function() {
  'use strict';

  var state = {
    checked: false,
    authenticated: false,
    user: '',
    role: '',
    isAdmin: false
  };

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
      userEl.textContent = state.user ? ('🔒 ' + state.user + ' · ' + (state.isAdmin ? 'admin' : 'user')) : '🔒 Session';
    }
  }

  function updateRoleVisibility() {
    var adminOnlyNodes = document.querySelectorAll('[data-admin-only="1"]');
    adminOnlyNodes.forEach(function(node) {
      node.style.display = state.isAdmin ? '' : 'none';
    });
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

      if (!state.authenticated) {
        await redirectToLogin();
        return false;
      }

      updateHeaderUser();
      updateRoleVisibility();
      bindLogout();
      window.AuthClient.setDocumentAuthenticated(true);
      document.dispatchEvent(new CustomEvent('dashboard-auth-ready', {
        detail: { user: state.user, isAdmin: state.isAdmin }
      }));
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
    isAdmin: function() { return !!state.isAdmin; }
  };
})();
}
