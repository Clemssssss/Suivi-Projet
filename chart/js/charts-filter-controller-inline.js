if (!window.ChartFilterController) {
  window.ChartFilterController = (() => {
  'use strict';

  // Map complète chartId → filterType
  const FILTER_TYPE_MAP = {
    'chart-perdu':           'Client',
    'chart-obtenu':          'Client',
    'chart-obtenu-zone':     'Zone Géographique',
    'chart-ca-company':      'Client',
    'chart-ca-status':       'Statut',
    'chart-machines-zone':   'Zone Géographique',
    'chart-offer-type':      'Type de projet (Activité)',
    'chart-power-status':    'Statut',
    'chart-ca-compare':      'Client',
    'chart-ca-client':       'Client',
    'chart-ca-zone':         'Zone Géographique',
    'chart-ca-year':         '_annee',
    'chart-ca-by-year-v2':   '_annee',
    'chart-status-zone':     'Zone Géographique',
    'chart-win-rate':        'Client',
    'chart-monthly':         '_annee',
    'chart-ca-trend':        '_annee',
            'chart-status':          'Statut',
    'chart-montant':         'Client',
    'chart-montant-statut':  'Statut',
    'chart-funnel':          'Statut',
    'chart-win-rate-client': 'Client',
    'chart-ca-zone-v2':      'Zone Géographique',
    'chart-win-rate-zone':   'Zone Géographique',
  };

  const INVALID_VALS = new Set(['', 'null', 'undefined', 'non spécifié', 'non specifie',
    'non défini', 'non defini', 'n/a', 'na', '-', '?', 'inconnu', 'unknown', 'none', 'aucun']);

  const _registry = {}; // { chartId: { chart, config, listener } }

  function _cleanValue(v) {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    return INVALID_VALS.has(s.toLowerCase()) ? null : s;
  }

  function init() {
    // Souscrire au FilterManager pour re-render
    if (typeof FilterManager !== 'undefined') {
      FilterManager.subscribe(() => {
        _syncWithAE();
        _updateAllVisualStates();
      });
    }
  }

  function _syncWithAE() {
    if (typeof AE === 'undefined') return;
    const fmFilters = (typeof FilterManager !== 'undefined') ? FilterManager.getFilters() : [];
    const aeFilters = AE.getFilters();
    // Supprimer filtres AE absents de FM
    Object.keys(aeFilters).forEach(k => {
      if (!fmFilters.some(f => f.type === k)) {
        AE.removeFilter(k);
      }
    });
    // Ajouter/sync FM → AE
    fmFilters.forEach(f => {
      if (AE.getFilters()[f.type] !== f.value) {
        if (AE.getFilters()[f.type] != null) AE.removeFilter(f.type);
        if (AE.getFilters()[f.type] !== f.value) AE.toggleFilter(f.type, f.value);
      }
    });
  }

  function registerChart(chartId, chartInstance, config = {}) {
    let filterType = config.filterType || FILTER_TYPE_MAP[chartId];
    if (!filterType) {
      console.warn(`⚠️ [CFC] filterType est NULL pour ${chartId} — ajoutez dans FILTER_TYPE_MAP`);
      return;
    }

    // Cleanup listener existant
    if (_registry[chartId] && _registry[chartId].listener) {
      const cv = document.getElementById(chartId);
      if (cv) cv.removeEventListener('click', _registry[chartId].listener);
    }

    const listener = (e) => _handleClick(e, chartId, chartInstance, filterType);
    const cv = document.getElementById(chartId);
    if (cv) {
      cv.addEventListener('click', listener);
      cv.style.cursor = 'pointer';
    }

    _registry[chartId] = { chart: chartInstance, config, listener, filterType };
    _updateVisualState(chartId, filterType);
  }

  function unregisterChart(chartId) {
    var entry = _registry[chartId];
    if (!entry) return false;
    var cv = document.getElementById(chartId);
    if (cv && entry.listener) {
      cv.removeEventListener('click', entry.listener);
    }
    delete _registry[chartId];
    return true;
  }

  function getRegisteredCharts() {
    return Object.keys(_registry);
  }

  function _handleClick(e, chartId, chartInstance, filterType) {
    const els = chartInstance.getElementsAtEventForMode(e, 'nearest', { intersect: true }, true);
    if (!els.length) return;

    const idx = els[0].index;
    const raw = chartInstance.data.labels ? chartInstance.data.labels[idx] : null;
    const fv = _cleanValue(raw);
    if (fv == null) return;

    // Sync AE AVANT FilterManager
    if (typeof AE !== 'undefined') AE.toggleFilter(filterType, fv);
    if (typeof FilterManager !== 'undefined') {
      if (FilterManager.hasFilter(filterType, fv)) {
        FilterManager.removeFilter(filterType);
      } else {
        FilterManager.setFilter(filterType, fv, fv);
      }
    }

    // DrillDown après flush DOM
    setTimeout(() => {
      if (typeof ChartDrillDown !== 'undefined') {
        var _ef2 = (typeof EXTRA_FILTERS_MAP !== 'undefined' && EXTRA_FILTERS_MAP[chartId]) ? { extraFilters: EXTRA_FILTERS_MAP[chartId] } : undefined;
        ChartDrillDown.show(chartId, filterType, fv, fv, _ef2);
      }
    }, 0);

    _updateAllVisualStates();
  }

  function _updateVisualState(chartId, filterType) {
    const ch = _registry[chartId];
    if (!ch) return;
    const activeVal = (typeof AE !== 'undefined') ? AE.getFilters()[filterType] : null;
    const chart = ch.chart;
    if (!chart || !chart.data || !chart.data.datasets) return;
    chart.data.datasets.forEach(ds => {
      if (!ds._originalBG) ds._originalBG = Array.isArray(ds.backgroundColor)
        ? [...ds.backgroundColor] : ds.backgroundColor;
      if (activeVal && chart.data.labels) {
        ds.backgroundColor = chart.data.labels.map((l, i) => {
          const orig = Array.isArray(ds._originalBG) ? ds._originalBG[i] : ds._originalBG;
          return String(l) === String(activeVal) ? orig : _dim(orig);
        });
      } else {
        ds.backgroundColor = ds._originalBG;
      }
    });
    try { chart.update('none'); } catch(e) {}
  }

  function _updateAllVisualStates() {
    Object.keys(_registry).forEach(id => {
      _updateVisualState(id, _registry[id].filterType);
    });
  }

  function _dim(c) {
    if (!c || typeof c !== 'string') return c;
    return c.replace(/[\d.]+\)$/, '0.16)');
  }

  return { init, registerChart, unregisterChart, getRegisteredCharts, FILTER_TYPE_MAP };
})();
}
