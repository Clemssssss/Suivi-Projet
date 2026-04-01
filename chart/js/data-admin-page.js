(function() {
  'use strict';

  var DATASET_KEY = 'saip-main';
  var state = {
    currentUser: '',
    role: ''
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

  function setStatus(message, className) {
    var el = qs('admin-status');
    if (!el) return;
    el.className = 'status' + (className ? (' ' + className) : '');
    el.textContent = message;
  }

  function renderKv(targetId, rows) {
    var el = qs(targetId);
    if (!el) return;
    el.innerHTML = rows.map(function(row) {
      return '<div>' + escapeHtml(row[0]) + '</div><div>' + escapeHtml(row[1]) + '</div>';
    }).join('');
  }

  function renderOverview(dataset, source) {
    var badges = qs('overview-badges');
    if (!badges) return;
    var datasetBadge = dataset
      ? 'Dataset ' + (dataset.rowCount || 0) + ' ligne(s)'
      : 'Dataset indisponible';
    var sourceBadge = source && source.source
      ? ((source.source.isEnabled ? 'SharePoint actif' : 'SharePoint désactivé'))
      : 'SharePoint indisponible';
    var syncBadge = source && source.source && source.source.lastSyncStatus
      ? ('Refresh ' + source.source.lastSyncStatus)
      : 'Refresh inconnu';
    badges.innerHTML =
      '<span class="badge">' + escapeHtml(datasetBadge) + '</span>' +
      '<span class="badge alt">' + escapeHtml(sourceBadge) + '</span>' +
      '<span class="badge ' + (/success|ok/i.test(syncBadge) ? '' : (/error|fail/i.test(syncBadge) ? 'err' : 'warn')) + '">' + escapeHtml(syncBadge) + '</span>';
  }

  function updateHeaderUser() {
    var el = qs('auth-user-label');
    if (el) el.textContent = state.currentUser ? ('🔒 ' + state.currentUser + ' · ' + (state.role || 'admin')) : '🔒 Session';
  }

  async function initAuth() {
    if (!window.AuthClient || typeof window.AuthClient.status !== 'function') {
      window.location.replace('/chart/login.html?next=' + encodeURIComponent('/chart/data-admin.html'));
      return false;
    }
    var auth = await window.AuthClient.status();
    if (!(auth.ok && auth.data && auth.data.authenticated)) {
      window.location.replace('/chart/login.html?next=' + encodeURIComponent('/chart/data-admin.html'));
      return false;
    }
    if (!(auth.data && auth.data.isAdmin)) {
      window.location.replace('/chart/chart.html');
      return false;
    }
    state.currentUser = typeof auth.data.user === 'string' ? auth.data.user : '';
    state.role = typeof auth.data.role === 'string' ? auth.data.role : 'admin';
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

  async function loadSnapshots() {
    setStatus('Chargement des snapshots dataset et SharePoint…');
    var results = await Promise.allSettled([
      fetchJson('/.netlify/functions/dataset-projects?datasetKey=' + encodeURIComponent(DATASET_KEY)),
      fetchJson('/.netlify/functions/sharepoint-source-admin')
    ]);

    var dataset = results[0].status === 'fulfilled' ? results[0].value : null;
    var sharepoint = results[1].status === 'fulfilled' ? results[1].value : null;

    renderKv('dataset-snapshot', [
      ['Dataset', dataset ? (dataset.datasetKey || DATASET_KEY) : DATASET_KEY],
      ['Source', dataset ? (dataset.sourceName || '—') : 'Indisponible'],
      ['Nb lignes', dataset ? String(dataset.rowCount || 0) : '—'],
      ['Dernière MAJ', dataset ? formatDate(dataset.updatedAt) : '—'],
      ['Hash payload', dataset && dataset.payloadHash ? String(dataset.payloadHash).slice(0, 16) + '…' : '—']
    ]);

    var source = sharepoint && sharepoint.source ? sharepoint.source : null;
    renderKv('sharepoint-snapshot', [
      ['URL', source && source.config ? (source.config.fileUrl || '—') : 'Indisponible'],
      ['Mode auth', source && source.config ? (source.config.authMode || '—') : '—'],
      ['Activation', source ? (source.isEnabled ? 'Active' : 'Désactivée') : '—'],
      ['Dernier statut', source ? (source.lastSyncStatus || 'never') : '—'],
      ['Dernière sync', source ? formatDate(source.lastSyncAt) : '—']
    ]);

    renderOverview(dataset, sharepoint);

    if (dataset && source) {
      setStatus('Vue admin chargée : dataset et source SharePoint synchronisés.', 'ok');
    } else if (dataset || source) {
      setStatus('Vue admin chargée partiellement : une source d’information manque.', 'err');
    } else {
      setStatus('Impossible de charger les informations admin.', 'err');
    }
  }

  async function init() {
    bindLogout();
    var ok = await initAuth();
    if (!ok) return;
    await loadSnapshots();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
