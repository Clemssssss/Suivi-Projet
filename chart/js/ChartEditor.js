/**
 * ════════════════════════════════════════════════════════════════
 *  CHART EDITOR v1.0 — Éditeur/Créateur de graphiques intégré
 * ════════════════════════════════════════════════════════════════
 *
 *  Fonctionnalités :
 *   ✅ Créer un nouveau graphique dynamiquement
 *   ✅ Modifier un graphique existant
 *   ✅ Supprimer un graphique
 *   ✅ Configurer : axe X, métrique, filtre statut, type de chart
 *   ✅ Options : tri, couleurs, labels
 *   ✅ Sauvegarde des configs dans localStorage
 *   ✅ Bouton "Nouveau graphique" ajouté au dashboard
 *
 *  Usage :
 *   ChartEditor.init()              — injecter le bouton + CSS
 *   ChartEditor.openNew()           — ouvrir le formulaire nouveau
 *   ChartEditor.openEdit(chartId)   — modifier un existant
 *   ChartEditor.deleteChart(chartId)— supprimer un graphique custom
 *
 *  Dépendances :
 *   - Chart.js, Analytics, DataFilterEngine, ProjectUtils
 * ════════════════════════════════════════════════════════════════
 */
if (!window.ChartEditor) {
window.ChartEditor = (() => {
  'use strict';

  const STORAGE_KEY = 'cahors_custom_charts';

  // Axes X disponibles
  const AXE_OPTIONS = [
    { key: 'Client',                    label: 'Client / Société' },
    { key: 'Zone Géographique',         label: 'Zone Géographique' },
    { key: '_annee',                    label: 'Année' },
    { key: 'Statut',                    label: 'Statut' },
    { key: 'Type de projet (Activité)', label: 'Type de projet' },
    { key: 'partenaire_gc',             label: 'Partenaire GC' },
  ];

  // Métriques disponibles
  const METRIC_OPTIONS = [
    { key: 'ca_etudie', label: 'CA Étudié (Budget)' },
    { key: 'ca_gagne',  label: 'CA Gagné' },
    { key: 'pipeline',  label: 'Pipeline Pondéré' },
    { key: 'count',     label: 'Nombre de projets' },
  ];

  // Filtres statut
  const STATUS_OPTIONS = [
    { key: 'tous',   label: 'Tous les statuts' },
    { key: 'obtenu', label: 'Obtenus uniquement' },
    { key: 'perdu',  label: 'Perdus uniquement' },
    { key: 'offre',  label: 'Offres uniquement' },
  ];

  // Types de graphiques
  const CHART_TYPES = [
    { key: 'bar',      label: '📊 Barres' },
    { key: 'horizontalBar', label: '📊 Barres horizontales' },
    { key: 'line',     label: '📈 Ligne' },
    { key: 'pie',      label: '🥧 Camembert' },
    { key: 'doughnut', label: '🍩 Doughnut' },
  ];

  const SORT_OPTIONS = [
    { key: 'desc',  label: 'Décroissant' },
    { key: 'asc',   label: 'Croissant' },
    { key: 'alpha', label: 'Alphabétique' },
    { key: 'none',  label: 'Aucun' },
  ];

  const PALETTE = [
    '#00d4aa', '#0099ff', '#8b78f8', '#f5b740', '#ff4d6d',
    '#10b981', '#f97316', '#06b6d4', '#ec4899', '#84cc16',
  ];

  let _isInit = false;
  let _customCharts = {}; // id → { config, instance }

  /* ── Charger les configs sauvegardées ─────────────────── */
  function _loadSaved() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }

  function _saveTo(configs) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(configs)); }
    catch (e) { console.warn('[ChartEditor] localStorage save failed:', e); }
  }

  /* ── Obtenir les données filtrées ────────────────────── */
  function _getData() {
    if (typeof DataFilterEngine !== 'undefined' && DataFilterEngine.getFilteredData)
      return DataFilterEngine.getFilteredData();
    return (typeof window !== 'undefined' && window.DATA) ? window.DATA : [];
  }

  function _getStatus(p) {
    return (typeof ProjectUtils !== 'undefined' && ProjectUtils.getStatus)
      ? ProjectUtils.getStatus(p)
      : (p['Statut'] || 'autre').toLowerCase();
  }

  function _getCA(p, mode) {
    if (typeof Analytics !== 'undefined' && Analytics.getCAValue)
      return Analytics.getCAValue(p, mode || 'ca_etudie');
    return parseFloat(p['Bud']) || 0;
  }

  function _fmt(v) {
    if (typeof ProjectUtils !== 'undefined' && ProjectUtils.formatMontant)
      return ProjectUtils.formatMontant(v, true);
    if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(2) + 'M\u20AC';
    if (Math.abs(v) >= 1e3) return Math.round(v / 1e3) + 'k\u20AC';
    return Math.round(v) + '\u20AC';
  }

  /* ── Calculer les données pour un graphique ──────────── */
  function _computeChartData(config) {
    let data = _getData();

    // Filtrer par statut
    if (config.statut && config.statut !== 'tous') {
      data = data.filter(p => _getStatus(p) === config.statut);
    }

    // Grouper par axe X
    const groups = {};
    data.forEach(p => {
      let key;
      if (config.axeX === '_annee') {
        key = p._annee ? String(p._annee) : null;
      } else if (config.axeX === 'Statut') {
        key = _getStatus(p);
      } else {
        key = (p[config.axeX] || '').trim() || null;
      }
      if (!key) return;
      if (!groups[key]) groups[key] = [];
      groups[key].push(p);
    });

    // Calculer la métrique pour chaque groupe
    let entries = Object.entries(groups).map(([label, projects]) => {
      let value;
      switch (config.metric) {
        case 'count':     value = projects.length; break;
        case 'ca_gagne':  value = projects.reduce((s, p) => s + _getCA(p, 'ca_gagne'), 0); break;
        case 'pipeline':  value = projects.reduce((s, p) => s + _getCA(p, 'pipeline'), 0); break;
        case 'ca_etudie':
        default:          value = projects.reduce((s, p) => s + _getCA(p, 'ca_etudie'), 0); break;
      }
      return { label, value };
    });

    // Tri
    switch (config.sort || 'desc') {
      case 'desc':  entries.sort((a, b) => b.value - a.value); break;
      case 'asc':   entries.sort((a, b) => a.value - b.value); break;
      case 'alpha': entries.sort((a, b) => a.label.localeCompare(b.label)); break;
    }

    // Limiter à top N
    const limit = config.topN || 15;
    entries = entries.slice(0, limit);

    return {
      labels: entries.map(e => e.label),
      values: entries.map(e => e.value),
    };
  }

  /* ── Créer/mettre à jour un graphique ────────────────── */
  function _renderChart(chartId, config) {
    const computed = _computeChartData(config);
    if (!computed.labels.length) return null;

    let canvas = document.getElementById(chartId);
    if (!canvas) {
      // Créer la card + canvas dans le container custom
      const container = document.getElementById('custom-charts-grid');
      if (!container) return null;

      const card = document.createElement('div');
      card.className = 'chart-card';
      card.dataset.chartId = chartId;
      card.dataset.custom = 'true';
      card.innerHTML = `
        <div class="chart-header">
          <div class="chart-title">${config.icon || '\u2728'} ${config.title || 'Graphique personnalis\u00E9'}</div>
          <div class="chart-title-actions">
            <button class="chart-edit-custom-btn" data-chart="${chartId}" title="Modifier">\u270F\uFE0F</button>
            <button class="chart-delete-custom-btn" data-chart="${chartId}" title="Supprimer">\uD83D\uDDD1\uFE0F</button>
            <button class="chart-toggle-btn active" data-chart="${chartId}">\uD83D\uDC41</button>
          </div>
        </div>
        <div class="chart-hint">${_buildHint(config)}</div>
        <div class="chart-container" style="height:280px"><canvas id="${chartId}"></canvas></div>
      `;
      container.appendChild(card);
      canvas = document.getElementById(chartId);

      // Bind edit/delete buttons
      card.querySelector('.chart-edit-custom-btn').addEventListener('click', () => openEdit(chartId));
      card.querySelector('.chart-delete-custom-btn').addEventListener('click', () => deleteChart(chartId));
    }

    // Destroy existing instance
    if (_customCharts[chartId] && _customCharts[chartId].instance) {
      try { _customCharts[chartId].instance.destroy(); } catch (e) {}
    }

    const isHorizontal = config.chartType === 'horizontalBar';
    const isPie = config.chartType === 'pie' || config.chartType === 'doughnut';
    const actualType = isHorizontal ? 'bar' : config.chartType;
    const isMoney = config.metric !== 'count';

    const colors = computed.labels.map((_, i) => PALETTE[i % PALETTE.length]);

    const chartConfig = {
      type: actualType,
      data: {
        labels: computed.labels,
        datasets: [{
          label: METRIC_OPTIONS.find(m => m.key === config.metric)?.label || config.metric,
          data: computed.values,
          backgroundColor: colors.map(c => c + (isPie ? 'cc' : 'bb')),
          borderColor: colors,
          borderWidth: isPie ? 1.5 : 2,
          borderRadius: isPie ? 0 : 6,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: isHorizontal ? 'y' : 'x',
        plugins: {
          legend: { display: isPie, labels: { color: '#9fb3c8', font: { size: 11 } } },
          tooltip: {
            backgroundColor: 'rgba(6,12,20,.95)',
            titleColor: '#dce8f5',
            bodyColor: '#9fb3c8',
            borderColor: 'rgba(0,212,170,.3)',
            borderWidth: 1,
            callbacks: {
              label: ctx => isMoney ? ' ' + _fmt(ctx.raw) : ' ' + ctx.raw + ' projets'
            }
          }
        },
        ...(isPie ? { cutout: config.chartType === 'doughnut' ? '55%' : 0 } : {}),
        ...(!isPie ? {
          scales: {
            x: { grid: { color: 'rgba(255,255,255,.04)' }, ticks: { color: '#9fb3c8', callback: v => (!isHorizontal && isMoney) ? _fmt(v) : v } },
            y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,.04)' }, ticks: { color: '#9fb3c8', callback: v => (isHorizontal && isMoney) ? _fmt(v) : v } },
          }
        } : {}),
      }
    };

    const inst = new Chart(canvas, chartConfig);
    _customCharts[chartId] = { config, instance: inst };

    // Register in ChartFilterController
    if (typeof ChartFilterController !== 'undefined') {
      ChartFilterController.registerChart(chartId, inst, {
        filterType: config.axeX,
        clickable: true,
        highlightOnFilter: true,
        reRenderOnFilter: true,
      });
    }

    return inst;
  }

  function _buildHint(config) {
    const ax = AXE_OPTIONS.find(a => a.key === config.axeX)?.label || config.axeX;
    const mt = METRIC_OPTIONS.find(m => m.key === config.metric)?.label || config.metric;
    const st = STATUS_OPTIONS.find(s => s.key === config.statut)?.label || 'Tous';
    return `${mt} par ${ax} \u2014 ${st}`;
  }

  /* ── Interface modal ─────────────────────────────────── */
  function _openModal(chartId, existingConfig) {
    // Close existing modal
    const existing = document.getElementById('ce-modal');
    if (existing) existing.remove();
    const existingOverlay = document.getElementById('ce-overlay');
    if (existingOverlay) existingOverlay.remove();

    const isNew = !existingConfig;
    const config = existingConfig || {
      title: '',
      axeX: 'Client',
      metric: 'ca_etudie',
      statut: 'tous',
      chartType: 'bar',
      sort: 'desc',
      topN: 15,
      icon: '\u2728',
    };

    const overlay = document.createElement('div');
    overlay.id = 'ce-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,.6);backdrop-filter:blur(3px);';

    const modal = document.createElement('div');
    modal.id = 'ce-modal';
    modal.style.cssText = `
      position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:9999;
      background:#0f1723;border:1px solid rgba(0,212,170,.3);border-radius:14px;
      padding:1.5rem;min-width:400px;max-width:520px;width:90vw;
      box-shadow:0 16px 48px rgba(0,0,0,.7);font-family:system-ui,sans-serif;
      max-height:85vh;overflow-y:auto;
    `;

    const _select = (name, options, current) => {
      return `<select name="${name}" style="
        width:100%;padding:.4rem .6rem;background:#1a2438;border:1px solid rgba(255,255,255,.1);
        border-radius:8px;color:#dce8f5;font-size:.8rem;font-family:inherit;
      ">${options.map(o => `<option value="${o.key}" ${o.key === current ? 'selected' : ''}>${o.label}</option>`).join('')}</select>`;
    };

    const _field = (label, content) => `
      <div style="margin-bottom:.85rem;">
        <label style="display:block;font-size:.68rem;color:#9fb3c8;text-transform:uppercase;letter-spacing:.06em;margin-bottom:.35rem;">${label}</label>
        ${content}
      </div>`;

    modal.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.2rem;">
        <span style="font-size:.95rem;font-weight:700;color:#dce8f5;">${isNew ? '\u2728 Nouveau graphique' : '\u270F\uFE0F Modifier le graphique'}</span>
        <button id="ce-close" style="background:rgba(255,77,109,.12);border:1px solid rgba(255,77,109,.25);color:#ff4d6d;border-radius:6px;width:28px;height:28px;font-size:.8rem;cursor:pointer;">\u2715</button>
      </div>
      ${_field('Titre du graphique', `<input name="title" value="${config.title || ''}" placeholder="Ex: CA par client obtenus" style="width:100%;padding:.4rem .6rem;background:#1a2438;border:1px solid rgba(255,255,255,.1);border-radius:8px;color:#dce8f5;font-size:.8rem;font-family:inherit;">`)}
      ${_field('Axe X (regroupement)', _select('axeX', AXE_OPTIONS, config.axeX))}
      ${_field('M\u00E9trique (valeur)', _select('metric', METRIC_OPTIONS, config.metric))}
      ${_field('Filtre statut', _select('statut', STATUS_OPTIONS, config.statut))}
      ${_field('Type de graphique', _select('chartType', CHART_TYPES, config.chartType))}
      ${_field('Tri des valeurs', _select('sort', SORT_OPTIONS, config.sort || 'desc'))}
      ${_field('Nombre max. d\u2019\u00E9l\u00E9ments', `<input type="number" name="topN" value="${config.topN || 15}" min="3" max="50" style="width:80px;padding:.4rem .6rem;background:#1a2438;border:1px solid rgba(255,255,255,.1);border-radius:8px;color:#dce8f5;font-size:.8rem;">`)}
      <div style="display:flex;gap:.6rem;justify-content:flex-end;margin-top:1.2rem;">
        <button id="ce-cancel" style="padding:.4rem .9rem;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:8px;color:#9fb3c8;font-size:.78rem;cursor:pointer;">Annuler</button>
        <button id="ce-apply" style="padding:.4rem .9rem;background:rgba(0,212,170,.18);border:1px solid rgba(0,212,170,.45);border-radius:8px;color:#00d4aa;font-size:.78rem;cursor:pointer;font-weight:600;">\u2705 ${isNew ? 'Cr\u00E9er' : 'Appliquer'}</button>
      </div>
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(modal);

    overlay.addEventListener('click', () => { modal.remove(); overlay.remove(); });
    modal.querySelector('#ce-close').addEventListener('click', () => { modal.remove(); overlay.remove(); });
    modal.querySelector('#ce-cancel').addEventListener('click', () => { modal.remove(); overlay.remove(); });

    modal.querySelector('#ce-apply').addEventListener('click', () => {
      const newConfig = {
        title:     modal.querySelector('[name="title"]').value.trim() || 'Graphique personnalis\u00E9',
        axeX:      modal.querySelector('[name="axeX"]').value,
        metric:    modal.querySelector('[name="metric"]').value,
        statut:    modal.querySelector('[name="statut"]').value,
        chartType: modal.querySelector('[name="chartType"]').value,
        sort:      modal.querySelector('[name="sort"]').value,
        topN:      parseInt(modal.querySelector('[name="topN"]').value, 10) || 15,
        icon:      config.icon || '\u2728',
      };

      const id = chartId || ('custom-chart-' + Date.now());

      // Save config
      const saved = _loadSaved();
      saved[id] = newConfig;
      _saveTo(saved);

      // Render
      _renderChart(id, newConfig);

      modal.remove();
      overlay.remove();

      console.log(`[ChartEditor] ${isNew ? 'Cr\u00E9\u00E9' : 'Modifi\u00E9'} : "${id}"`, newConfig);
    });
  }

  /* ── API publique ────────────────────────────────────── */
  function openNew() { _openModal(null, null); }

  function openEdit(chartId) {
    const saved = _loadSaved();
    const config = saved[chartId] || (_customCharts[chartId] && _customCharts[chartId].config);
    if (!config) {
      console.warn(`[ChartEditor] Pas de config pour "${chartId}"`);
      return;
    }
    _openModal(chartId, config);
  }

  function deleteChart(chartId) {
    if (!confirm('Supprimer ce graphique personnalis\u00E9 ?')) return;
    // Destroy instance
    if (_customCharts[chartId] && _customCharts[chartId].instance) {
      try { _customCharts[chartId].instance.destroy(); } catch (e) {}
    }
    if (typeof ChartFilterController !== 'undefined' && ChartFilterController.unregisterChart) {
      ChartFilterController.unregisterChart(chartId);
    }
    delete _customCharts[chartId];

    // Remove from DOM
    const card = document.querySelector(`[data-chart-id="${chartId}"][data-custom="true"]`);
    if (card) card.remove();

    // Remove from storage
    const saved = _loadSaved();
    delete saved[chartId];
    _saveTo(saved);

    console.log(`[ChartEditor] Supprim\u00E9 : "${chartId}"`);
  }

  /* ── Re-render tous les customs (après changement de filtre) ── */
  function refreshAll() {
    const saved = _loadSaved();
    Object.entries(saved).forEach(([id, config]) => {
      _renderChart(id, config);
    });
  }

  /* ── Injection CSS + bouton ──────────────────────────── */
  function _injectCSS() {
    if (document.getElementById('ce-styles')) return;
    const style = document.createElement('style');
    style.id = 'ce-styles';
    style.textContent = `
      #ce-new-chart-btn {
        display: inline-flex; align-items: center; gap: .4rem;
        background: rgba(0,212,170,.1); border: 1px solid rgba(0,212,170,.3);
        color: #00d4aa; border-radius: 10px; padding: .5rem 1rem;
        font-family: system-ui, sans-serif; font-size: .82rem; font-weight: 600;
        cursor: pointer; transition: all .18s; margin: .5rem 0;
      }
      #ce-new-chart-btn:hover {
        background: rgba(0,212,170,.2); border-color: rgba(0,212,170,.5);
        transform: translateY(-1px); box-shadow: 0 4px 16px rgba(0,212,170,.15);
      }
      .chart-edit-custom-btn, .chart-delete-custom-btn {
        background: transparent; border: 1px solid rgba(255,255,255,.08);
        color: #9fb3c8; border-radius: 6px; width: 28px; height: 28px;
        font-size: .75rem; cursor: pointer; transition: all .15s;
        display: inline-flex; align-items: center; justify-content: center;
      }
      .chart-edit-custom-btn:hover { border-color: rgba(0,212,170,.4); color: #00d4aa; }
      .chart-delete-custom-btn:hover { border-color: rgba(255,77,109,.4); color: #ff4d6d; }
      #custom-charts-grid {
        display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
        gap: 1.25rem; padding: 0 2.5rem 1.5rem;
      }
      #custom-charts-section { margin-top: 1rem; }
    `;
    document.head.appendChild(style);
  }

  function _injectButton() {
    // Find insertion point - after the main chart-grid or at the end of sections
    const gridsEnd = document.querySelector('#custom-charts-section');
    if (gridsEnd) return; // Already injected

    const shell = document.querySelector('.charts-grid, .shell') || document.body;

    // Create the section
    const section = document.createElement('div');
    section.id = 'custom-charts-section';
    section.innerHTML = `
      <div class="section-div" style="margin:0 2.5rem .8rem;">
        <span class="section-lbl">\u2728 Graphiques personnalis\u00E9s</span>
      </div>
      <div style="margin:0 2.5rem .8rem;">
        <button id="ce-new-chart-btn">\u2795 Nouveau graphique</button>
      </div>
      <div id="custom-charts-grid"></div>
    `;

    // Insert before the share-toast or at end of shell
    const shareToast = document.querySelector('.share-toast');
    if (shareToast && shareToast.parentElement) {
      shareToast.parentElement.insertBefore(section, shareToast);
    } else {
      shell.appendChild(section);
    }

    section.querySelector('#ce-new-chart-btn').addEventListener('click', openNew);
  }

  function init() {
    if (_isInit) return;
    _isInit = true;

    _injectCSS();

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        _injectButton();
        refreshAll();
      });
    } else {
      setTimeout(() => {
        _injectButton();
        refreshAll();
      }, 200);
    }

    // Subscribe to filter changes to refresh custom charts
    if (typeof FilterManager !== 'undefined' && FilterManager.subscribe) {
      FilterManager.subscribe(() => refreshAll());
    }
    if (typeof AE !== 'undefined' && AE.subscribe) {
      AE.subscribe(() => refreshAll());
    }

    console.log('[ChartEditor] \u2705 Pr\u00EAt (v1.0)');
  }

  return { init, openNew, openEdit, deleteChart, refreshAll };
})();
}
