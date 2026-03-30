if (!window.DashboardAuthGuard) {
window.DashboardAuthGuard = (function() {
  'use strict';

  var state = {
    checked: false,
    authenticated: false,
    user: ''
  };

  function getNextURL() {
    return window.AuthClient.sanitizeNext(
      window.location.pathname + window.location.search + window.location.hash
    );
  }

  function redirectToLogin() {
    var next = encodeURIComponent(getNextURL());
    window.location.replace('/chart/login.html?next=' + next);
  }

  function updateHeaderUser() {
    var userEl = document.getElementById('auth-user-label');
    if (userEl) {
      userEl.textContent = state.user ? ('🔒 ' + state.user) : '🔒 Session';
    }
  }

  function bindLogout() {
    var button = document.getElementById('btn-logout');
    if (!button || button._logoutBound) return;
    button._logoutBound = true;
    button.addEventListener('click', async function() {
      button.disabled = true;
      try {
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

      if (!state.authenticated) {
        redirectToLogin();
        return false;
      }

      updateHeaderUser();
      bindLogout();
      window.AuthClient.setDocumentAuthenticated(true);
      return true;
    } catch (err) {
      console.error('[AuthGuard] Vérification session impossible', err);
      redirectToLogin();
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
    isReady: function() { return state.checked; }
  };
})();
}
