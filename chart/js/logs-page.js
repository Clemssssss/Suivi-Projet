(function() {
  'use strict';

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
    if (!value) return '';
    try {
      return new Date(value).toLocaleString('fr-FR');
    } catch (_) {
      return String(value);
    }
  }

  function renderRows(logs) {
    var tbody = qs('logs-tbody');
    if (!tbody) return;
    if (!Array.isArray(logs) || !logs.length) {
      tbody.innerHTML = '<tr><td colspan="8" style="padding:1rem;color:#9fb3c8;">Aucun log trouvé.</td></tr>';
      return;
    }
    tbody.innerHTML = logs.map(function(log) {
      return '<tr>'
        + '<td>' + escapeHtml(formatDate(log.createdAt)) + '</td>'
        + '<td>' + escapeHtml(log.level || '') + '</td>'
        + '<td>' + escapeHtml(log.eventType || '') + '</td>'
        + '<td>' + escapeHtml(log.actor || '') + '</td>'
        + '<td>' + escapeHtml(log.ip || '') + '</td>'
        + '<td>' + escapeHtml(log.country || '') + '</td>'
        + '<td>' + escapeHtml(log.path || '') + '</td>'
        + '<td><details><summary>Voir</summary><pre style="white-space:pre-wrap;">'
        + escapeHtml(JSON.stringify(log.details || {}, null, 2))
        + '</pre></details></td>'
        + '</tr>';
    }).join('');
  }

  async function loadLogs() {
    var status = qs('logs-status');
    var params = new URLSearchParams();
    params.set('limit', qs('logs-limit').value || '100');
    if (qs('logs-level').value) params.set('level', qs('logs-level').value);
    if (qs('logs-type').value.trim()) params.set('eventType', qs('logs-type').value.trim());
    if (qs('logs-search').value.trim()) params.set('search', qs('logs-search').value.trim());

    status.textContent = 'Chargement...';
    try {
      var response = await fetch('/.netlify/functions/access-logs?' + params.toString(), {
        credentials: 'same-origin',
        headers: { 'Accept': 'application/json' }
      });
      var data = await response.json();
      if (!response.ok) throw new Error(data && data.error ? data.error : ('HTTP ' + response.status));
      renderRows(data.logs || []);
      status.textContent = (data.logs || []).length + ' log(s)';
    } catch (err) {
      renderRows([]);
      status.textContent = 'Erreur : ' + (err && err.message ? err.message : 'chargement impossible');
    }
  }

  async function init() {
    if (window.AuthClient && typeof window.AuthClient.status === 'function') {
      var auth = await window.AuthClient.status();
      if (!(auth.ok && auth.data && auth.data.authenticated)) {
        window.location.replace('/chart/login.html?next=' + encodeURIComponent('/chart/logs.html'));
        return;
      }
    }
    qs('logs-refresh').addEventListener('click', loadLogs);
    qs('logs-form').addEventListener('submit', function(e) {
      e.preventDefault();
      loadLogs();
    });
    loadLogs();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
