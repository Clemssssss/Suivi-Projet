(function() {
  'use strict';

  var state = {
    requests: [],
    whitelist: [],
    currentUser: '',
    role: '',
    isAdmin: false
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
    try {
      return new Date(value).toLocaleString('fr-FR');
    } catch (_) {
      return String(value);
    }
  }

  function setStatus(id, message) {
    var el = qs(id);
    if (el) el.textContent = message;
  }

  function updateHeaderUser() {
    var el = qs('auth-user-label');
    if (el) {
      el.textContent = state.currentUser ? ('🔒 ' + state.currentUser + ' · ' + (state.role || 'user')) : '🔒 Session';
    }
  }

  function statusTag(status) {
    var normalized = String(status || '').toLowerCase();
    if (normalized === 'approved') return '<span class="tag tag-approved">approved</span>';
    if (normalized === 'rejected') return '<span class="tag tag-rejected">rejected</span>';
    if (normalized === 'active') return '<span class="tag tag-active">active</span>';
    if (normalized === 'inactive') return '<span class="tag tag-inactive">inactive</span>';
    return '<span class="tag tag-pending">' + escapeHtml(normalized || 'pending') + '</span>';
  }

  function requestActionButtons(request) {
    if (String(request.status || '') !== 'pending') {
      return '<span class="muted">Traité</span>';
    }
    return '<div class="row-actions">'
      + '<button class="approve" type="button" data-action="approve_request" data-request-id="' + escapeHtml(request.id) + '">Approuver</button>'
      + '<button class="reject" type="button" data-action="reject_request" data-request-id="' + escapeHtml(request.id) + '">Refuser</button>'
      + '</div>';
  }

  function whitelistActionButtons(entry) {
    var action = entry.isActive ? 'deactivate_whitelist_entry' : 'activate_whitelist_entry';
    var label = entry.isActive ? 'Désactiver' : 'Activer';
    return '<div class="row-actions">'
      + '<button class="toggle" type="button" data-action="' + action + '" data-ip-rule="' + escapeHtml(entry.ipRule || '') + '">' + label + '</button>'
      + '</div>';
  }

  function renderRequests() {
    var tbody = qs('requests-tbody');
    if (!tbody) return;
    if (!Array.isArray(state.requests) || !state.requests.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="padding:1rem;color:#9fb3c8;">Aucune demande pour le moment.</td></tr>';
      setStatus('whitelist-requests-status', '0 demande');
      return;
    }

    tbody.innerHTML = state.requests.map(function(request) {
      return '<tr>'
        + '<td>' + statusTag(request.status) + '</td>'
        + '<td><div class="mono">' + escapeHtml(request.requestedIp || '') + '</div><div class="muted">' + escapeHtml(request.requestedLabel || '') + '</div></td>'
        + '<td>'
        + '<div>' + escapeHtml(request.requestedBy || '—') + '</div>'
        + '<div class="muted">' + escapeHtml(request.requestedEmail || '—') + '</div>'
        + '</td>'
        + '<td>'
        + '<div>' + escapeHtml(request.requestReason || '—') + '</div>'
        + '<div class="muted">Revue: ' + escapeHtml(request.reviewNotes || '—') + '</div>'
        + '</td>'
        + '<td>'
        + '<div>' + escapeHtml(request.country || '—') + '</div>'
        + '<div class="muted">' + escapeHtml(formatDate(request.createdAt)) + '</div>'
        + '</td>'
        + '<td>' + requestActionButtons(request) + '</td>'
        + '</tr>';
    }).join('');

    setStatus('whitelist-requests-status', state.requests.length + ' demande(s)');
  }

  function renderWhitelist() {
    var tbody = qs('whitelist-tbody');
    if (!tbody) return;
    if (!Array.isArray(state.whitelist) || !state.whitelist.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="padding:1rem;color:#9fb3c8;">Aucune IP whitelistée.</td></tr>';
      setStatus('whitelist-status', '0 entrée');
      return;
    }

    tbody.innerHTML = state.whitelist.map(function(entry) {
      return '<tr>'
        + '<td>' + statusTag(entry.isActive ? 'active' : 'inactive') + '</td>'
        + '<td class="mono">' + escapeHtml(entry.ipRule || '') + '</td>'
        + '<td>' + escapeHtml(entry.label || '—') + '</td>'
        + '<td>' + escapeHtml(entry.notes || '—') + '</td>'
        + '<td><div>' + escapeHtml(entry.addedBy || '—') + '</div><div class="muted">' + escapeHtml(formatDate(entry.updatedAt)) + '</div></td>'
        + '<td>' + whitelistActionButtons(entry) + '</td>'
        + '</tr>';
    }).join('');

    setStatus('whitelist-status', state.whitelist.length + ' entrée(s)');
  }

  function applySnapshot(data) {
    state.requests = Array.isArray(data && data.requests) ? data.requests : [];
    state.whitelist = Array.isArray(data && data.whitelist) ? data.whitelist : [];
    renderRequests();
    renderWhitelist();
  }

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

  async function loadAdminData() {
    setStatus('whitelist-requests-status', 'Chargement...');
    setStatus('whitelist-status', 'Chargement...');
    var data = await fetchJson('/.netlify/functions/ip-whitelist-admin');
    applySnapshot(data);
  }

  async function postAction(payload) {
    return fetchJson('/.netlify/functions/ip-whitelist-admin', {
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
    if (!action) return;

    var payload = { action: action };
    if (button.hasAttribute('data-request-id')) {
      payload.requestId = Number(button.getAttribute('data-request-id'));
      if (action === 'approve_request') {
        payload.reviewNotes = 'Accès validé via interface admin';
      } else if (action === 'reject_request') {
        payload.reviewNotes = 'Accès refusé via interface admin';
      }
    }
    if (button.hasAttribute('data-ip-rule')) {
      payload.ipRule = button.getAttribute('data-ip-rule');
      payload.reviewNotes = action === 'deactivate_whitelist_entry'
        ? 'Désactivation via interface admin'
        : 'Réactivation via interface admin';
    }

    button.disabled = true;
    setStatus('whitelist-requests-status', 'Mise à jour...');
    setStatus('whitelist-status', 'Mise à jour...');
    try {
      var data = await postAction(payload);
      applySnapshot(data);
    } catch (err) {
      setStatus('whitelist-requests-status', 'Erreur : ' + (err && err.message ? err.message : 'mise à jour impossible'));
      setStatus('whitelist-status', 'Erreur : ' + (err && err.message ? err.message : 'mise à jour impossible'));
    } finally {
      button.disabled = false;
    }
  }

  async function handleManualAdd(event) {
    event.preventDefault();
    var ipRule = qs('manual-ip-rule').value.trim();
    var label = qs('manual-ip-label').value.trim();
    var notes = qs('manual-ip-notes').value.trim();
    if (!ipRule) {
      setStatus('manual-whitelist-status', 'IP ou règle requise.');
      return;
    }

    var submit = qs('manual-ip-submit');
    submit.disabled = true;
    setStatus('manual-whitelist-status', 'Ajout en cours...');
    try {
      var data = await postAction({
        action: 'add_whitelist_entry',
        ipRule: ipRule,
        label: label,
        notes: notes
      });
      qs('manual-whitelist-form').reset();
      setStatus('manual-whitelist-status', 'IP ajoutée.');
      applySnapshot(data);
    } catch (err) {
      setStatus('manual-whitelist-status', 'Erreur : ' + (err && err.message ? err.message : 'ajout impossible'));
    } finally {
      submit.disabled = false;
    }
  }

  async function initAuth() {
    if (!window.AuthClient || typeof window.AuthClient.status !== 'function') {
      window.location.replace('/chart/login.html?next=' + encodeURIComponent('/chart/whitelist.html'));
      return false;
    }

    var auth = await window.AuthClient.status();
    if (!(auth.ok && auth.data && auth.data.authenticated)) {
      window.location.replace('/chart/login.html?next=' + encodeURIComponent('/chart/whitelist.html'));
      return false;
    }
    if (!(auth.data && auth.data.isAdmin)) {
      window.location.replace('/chart/chart.html');
      return false;
    }

    state.currentUser = typeof auth.data.user === 'string' ? auth.data.user : '';
    state.role = typeof auth.data.role === 'string' ? auth.data.role : (auth.data.isAdmin ? 'admin' : 'user');
    state.isAdmin = !!auth.data.isAdmin;
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
    try {
      var ready = await initAuth();
      if (!ready) return;
      bindLogout();
      qs('manual-whitelist-form').addEventListener('submit', handleManualAdd);
      document.addEventListener('click', function(event) {
        var button = event.target.closest('button[data-action]');
        if (!button) return;
        handleRowAction(button);
      });
      await loadAdminData();
    } catch (err) {
      setStatus('whitelist-requests-status', 'Erreur : ' + (err && err.message ? err.message : 'chargement impossible'));
      setStatus('whitelist-status', 'Erreur : ' + (err && err.message ? err.message : 'chargement impossible'));
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
