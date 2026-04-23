(function() {
  'use strict';

  var state = {
    currentUser: '',
    role: '',
    accounts: []
  };

  function qs(id) { return document.getElementById(id); }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

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

  function setStatus(id, message, className) {
    var el = qs(id);
    if (!el) return;
    el.className = 'status' + (className ? (' ' + className) : '');
    el.textContent = message;
  }

  function updateHeaderUser() {
    var el = qs('auth-user-label');
    if (el) el.textContent = state.currentUser ? ('🔒 ' + state.currentUser + ' · ' + (state.role || 'admin')) : '🔒 Session';
  }

  function updateSummary() {
    var total = state.accounts.length;
    var active = state.accounts.filter(function(account) { return !!account.isActive; }).length;
    var inactive = total - active;
    var summary = qs('account-summary');
    if (!summary) return;
    summary.innerHTML =
      '<span class="tag tag-role">Total ' + escapeHtml(String(total)) + '</span>' +
      '<span class="tag tag-ok">Actifs ' + escapeHtml(String(active)) + '</span>' +
      '<span class="tag tag-off">Inactifs ' + escapeHtml(String(inactive)) + '</span>';
  }

  function statusTag(isActive) {
    return isActive
      ? '<span class="tag tag-ok">actif</span>'
      : '<span class="tag tag-off">inactif</span>';
  }

  function actionButtons(account) {
    var action = account.isActive ? 'deactivate_user' : 'activate_user';
    var label = account.isActive ? 'Désactiver' : 'Activer';
    return '<div class="row-actions">'
      + '<button class="toggle" type="button" data-action="' + action + '" data-username="' + escapeHtml(account.username || '') + '">' + label + '</button>'
      + '</div>';
  }

  function renderAccounts() {
    var tbody = qs('accounts-tbody');
    if (!tbody) return;
    if (!Array.isArray(state.accounts) || !state.accounts.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="padding:1rem;color:#9fb3c8;">Aucun compte pour le moment.</td></tr>';
      setStatus('account-list-status', '0 compte');
      updateSummary();
      return;
    }

    tbody.innerHTML = state.accounts.map(function(account) {
      return '<tr>'
        + '<td>' + statusTag(account.isActive) + '</td>'
        + '<td><div class="mono">' + escapeHtml(account.username || '') + '</div><div class="muted">' + escapeHtml(account.createdBy || '—') + '</div></td>'
        + '<td><span class="tag tag-role">' + escapeHtml(account.role || 'user') + '</span></td>'
        + '<td>'
        + '<div class="muted">Créé: ' + escapeHtml(formatDate(account.createdAt)) + '</div>'
        + '<div class="muted">MAJ: ' + escapeHtml(formatDate(account.updatedAt)) + '</div>'
        + '</td>'
        + '<td>' + actionButtons(account) + '</td>'
        + '</tr>';
    }).join('');

    setStatus('account-list-status', state.accounts.length + ' compte(s)');
    updateSummary();
  }

  function applySnapshot(data) {
    state.accounts = Array.isArray(data && data.accounts) ? data.accounts : [];
    renderAccounts();
  }

  async function loadAccounts() {
    setStatus('account-list-status', 'Chargement...');
    var data = await fetchJson('/.netlify/functions/auth-users-admin');
    applySnapshot(data);
  }

  async function postAction(payload) {
    return fetchJson('/.netlify/functions/auth-users-admin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload || {})
    });
  }

  async function handleRowAction(button) {
    if (!button) return;
    var action = String(button.getAttribute('data-action') || '');
    var username = String(button.getAttribute('data-username') || '');
    if (!action || !username) return;

    button.disabled = true;
    setStatus('account-list-status', 'Mise à jour...');
    try {
      var data = await postAction({
        action: action,
        username: username
      });
      applySnapshot(data);
      setStatus('account-form-status', 'Compte mis à jour.', 'ok');
    } catch (err) {
      setStatus('account-list-status', 'Erreur : ' + (err && err.message ? err.message : 'mise à jour impossible'), 'err');
    } finally {
      button.disabled = false;
    }
  }

  async function handleFormSubmit(event) {
    event.preventDefault();
    var username = qs('account-username').value.trim();
    var password = qs('account-password').value;
    var role = qs('account-role').value;
    var isActive = qs('account-active').checked;

    if (!username || !password) {
      setStatus('account-form-status', 'Nom de compte et mot de passe requis.', 'err');
      return;
    }

    var submit = qs('account-submit');
    submit.disabled = true;
    setStatus('account-form-status', 'Enregistrement en cours...');
    try {
      var data = await postAction({
        action: 'create_user',
        username: username,
        password: password,
        role: role,
        isActive: isActive
      });
      qs('account-form').reset();
      qs('account-active').checked = true;
      qs('account-role').value = 'user';
      setStatus('account-form-status', 'Compte enregistré.', 'ok');
      applySnapshot(data);
    } catch (err) {
      setStatus('account-form-status', 'Erreur : ' + (err && err.message ? err.message : 'enregistrement impossible'), 'err');
    } finally {
      submit.disabled = false;
    }
  }

  async function initAuth() {
    if (!window.AuthClient || typeof window.AuthClient.status !== 'function') {
      window.location.replace('/chart/login.html?next=' + encodeURIComponent('/chart/accounts.html'));
      return false;
    }

    var auth = await window.AuthClient.status();
    if (!(auth.ok && auth.data && auth.data.authenticated)) {
      window.location.replace('/chart/login.html?next=' + encodeURIComponent('/chart/accounts.html'));
      return false;
    }
    if (!(auth.data && auth.data.isAdmin)) {
      window.location.replace('/chart/chart.html');
      return false;
    }

    state.currentUser = typeof auth.data.user === 'string' ? auth.data.user : '';
    state.role = typeof auth.data.role === 'string' ? auth.data.role : (auth.data.isAdmin ? 'admin' : 'user');
    updateHeaderUser();
    return true;
  }

  function bindLogout() {
    var button = qs('btn-logout');
    if (!button || button._logoutBound) return;
    button._logoutBound = true;
    button.addEventListener('click', async function() {
      button.disabled = true;
      try {
        await window.AuthClient.logout();
      } catch (_) {}
      window.location.replace('/chart/login.html');
    });
  }

  async function init() {
    var ready = await initAuth();
    if (!ready) return;
    bindLogout();
    qs('account-form').addEventListener('submit', handleFormSubmit);
    document.addEventListener('click', function(event) {
      var button = event.target.closest('button[data-action]');
      if (!button) return;
      handleRowAction(button);
    });
    await loadAccounts();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
