/**
 * ============================================================
 * KPI-UPDATES.JS — Mise à jour des KPIs v2.0
 * ============================================================
 *
 * Source unique pour l'injection des KPIs dans le DOM.
 * Tous les calculs délégués à Analytics.computeAllKPIs().
 * AUCUNE duplication de logique métier.
 *
 * Dépendances :
 *  - analytics.js
 *  - projectUtils.js
 * ============================================================
 */

(function (global) {
  'use strict';

  /* ──────────────────────────────────────────────────────
     HELPERS DOM
  ────────────────────────────────────────────────────── */

  function setEl(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = (value === null || value === undefined || value === '') ? '—' : String(value);
  }

  function setElHTML(id, html) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html || '—';
  }

  function setBorderLeft(id, color) {
    const el = document.getElementById(id);
    if (el) el.style.borderLeft = color ? `3px solid ${color}` : '';
  }

  /* ──────────────────────────────────────────────────────
     MISE À JOUR PRINCIPALE
  ────────────────────────────────────────────────────── */

  /**
   * Mettre à jour tous les KPIs dans le DOM.
   *
   * @param {Array}  projects  — liste de projets déjà filtrés
   * @param {string} caMode    — 'ca_gagne' | 'ca_etudie'
   */
  function updateAllKPIs(projects, caMode = 'ca_gagne') {
    if (!Array.isArray(projects) || typeof Analytics === 'undefined') return;

    // ── Calcul centralisé ──
    const kpi = Analytics.computeAllKPIs(projects, {}, caMode);

    // ── Comptes statuts ──
    setEl('stat-total',  kpi.total);
    setEl('stat-obtenu', kpi.obtenu);
    setEl('stat-perdu',  kpi.perdu);
    setEl('stat-offre',  kpi.offre);

    // Pourcentages
    const pct = (n) => kpi.total > 0 ? Math.round((n / kpi.total) * 100) + '%' : '';
    setEl('stat-obtenu-pct', pct(kpi.obtenu));
    setEl('stat-perdu-pct',  pct(kpi.perdu));
    setEl('stat-offre-pct',  pct(kpi.offre));

    // ── CA total ──
    setEl('stat-ca-total', ProjectUtils.formatMontant(kpi.caTotal));

    // ── KPIs de conversion ──
    setEl('kpi-conv-rate', kpi.tauxConversion !== null ? kpi.tauxConversion + '%' : '—');
    setEl('kpi-ca-avg',    kpi.caAvg  > 0 ? ProjectUtils.formatMontant(kpi.caAvg, true)  : '—');
    setEl('kpi-avg-delay', kpi.avgDelay !== null ? kpi.avgDelay + ' j' : '—');

    // ── Projets en retard ──
    setEl('kpi-overdue', kpi.overdueCount);
    setBorderLeft('kpi-overdue-card', kpi.overdueCount > 0 ? '#ef4444' : null);

    // ── Pipeline ──
    setEl('kpi-ca-pipeline',    kpi.caPipeline > 0 ? ProjectUtils.formatMontant(kpi.caPipeline, true) : '—');
    setEl('kpi-top-client',     kpi.topClient ? `${kpi.topClient.client} (${kpi.topClient.count})` : '—');
    setEl('kpi-decision-time',  kpi.decisionTime !== null ? kpi.decisionTime + ' j' : '—');
    setEl('kpi-avg-power',      kpi.avgPower ? kpi.avgPower + ' MW' : '—');
    setEl('kpi-total-machines', kpi.totalMachines > 0 ? kpi.totalMachines : '—');
    setEl('kpi-response-rate',  kpi.tauxReponse + '%');

    // ── Insights / anomalies (si panel présent) ──
    _updateInsightsPanel(projects);
    _updateHealthScore(projects);
  }

  /* ──────────────────────────────────────────────────────
     INSIGHTS
  ────────────────────────────────────────────────────── */

  function _updateInsightsPanel(projects) {
    const panel = document.getElementById('insights-panel');
    const list  = document.getElementById('insights-list');
    if (!panel || !list) return;

    const anomalies = Analytics.insights.detectAnomalies(projects);
    const trend     = Analytics.insights.trendAnalysis(projects);

    const items = [];

    // Trend annuel
    if (trend) {
      items.push({
        icon:    trend.direction === 'hausse' ? '📈' : '📉',
        message: `CA gagné ${trend.years.last} : <strong>${trend.caGagneTrend}</strong> vs ${trend.years.prev}`
      });
    }

    // Anomalies (max 3)
    anomalies.slice(0, 3).forEach(a => {
      items.push({ icon: a.icon, message: a.message });
    });

    if (!items.length) {
      panel.style.display = 'none';
      return;
    }

    panel.style.display = '';
    list.innerHTML = items.map(item => `
      <div class="insight-item">
        <span class="insight-icon">${item.icon}</span>
        <span class="insight-text">${item.message}</span>
      </div>
    `).join('');
  }

  function _updateHealthScore(projects) {
    const el = document.getElementById('health-score');
    if (!el) return;

    const health = Analytics.insights.healthScore(projects);
    el.textContent = health.score;
    el.style.color  = health.color;

    const labelEl = document.getElementById('health-label');
    if (labelEl) {
      labelEl.textContent = health.label;
      labelEl.style.color = health.color;
    }
  }

  /* ──────────────────────────────────────────────────────
     HOOK SUR APP
  ────────────────────────────────────────────────────── */

  function _getFilteredProjects() {
    if (window.App && typeof window.App.filters?.getFiltered === 'function') {
      return window.App.filters.getFiltered();
    }
    if (Array.isArray(window.ALL) && window.ALL.length > 0) return window.ALL;
    if (Array.isArray(window.DATA)) return window.DATA;
    return [];
  }

  function runKPIs() {
    updateAllKPIs(_getFilteredProjects());
  }

  // S'abonner à App.on('change')
  function _hookApp() {
    if (window.App && typeof window.App.on === 'function') {
      window.App.on('change', runKPIs);
    }

    // Patch updateStats() pour appel en cascade
    const _orig = window.updateStats;
    window.updateStats = function () {
      if (typeof _orig === 'function') _orig.apply(this, arguments);
      runKPIs();
    };

    // Patch refresh()
    const _origRefresh = window.refresh;
    window.refresh = function () {
      if (typeof _origRefresh === 'function') _origRefresh.apply(this, arguments);
      runKPIs();
    };
  }

  /* ──────────────────────────────────────────────────────
     EXPORT & INIT
  ────────────────────────────────────────────────────── */

  const KPIUpdates = { updateAllKPIs, runKPIs };
  global.KPIUpdates = KPIUpdates;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      _hookApp();
      setTimeout(runKPIs, 200);
    });
  } else {
    _hookApp();
    setTimeout(runKPIs, 200);
  }

  console.log('%c🔢 KPIUpdates.js v2.0 chargé', 'color:#f5b740;font-weight:700');

})(typeof window !== 'undefined' ? window : global);
