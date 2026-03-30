(function() {
  'use strict';

  if (window.BusinessChartsDashboard) return;

  var MONTHS = ['Jan', 'Fev', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aout', 'Sep', 'Oct', 'Nov', 'Dec'];
  var LEGACY_SECTION_LABELS = [
    'Pipeline de conversion',
    'Analyse métier',
    'Performance zone × statut',
    'Graphiques interactifs — cliquez pour filtrer'
  ];

  function cleanLabel(value) {
    var raw = value == null ? '' : String(value).trim();
    return raw || 'Non renseigne';
  }

  function getStatus(project) {
    return (typeof ProjectUtils !== 'undefined' && ProjectUtils.getStatus)
      ? ProjectUtils.getStatus(project)
      : 'autre';
  }

  function getBud(project) {
    return (typeof ProjectUtils !== 'undefined' && ProjectUtils.parseMontant)
      ? (ProjectUtils.parseMontant(project['Bud']) || 0)
      : (parseFloat(project['Bud']) || 0);
  }

  function getWeighted(project) {
    var direct = (typeof ProjectUtils !== 'undefined' && ProjectUtils.parseMontant)
      ? ProjectUtils.parseMontant(project['CA win proba'])
      : parseFloat(project['CA win proba']);
    if (direct != null && isFinite(direct)) return direct;
    var bud = getBud(project);
    var raw = String(project['Win proba'] || '').replace('%', '').replace(',', '.').trim();
    var prob = parseFloat(raw);
    if (!isFinite(prob)) return 0;
    if (prob > 1) prob = prob / 100;
    return bud * prob;
  }

  function getYear(project) {
    if (typeof Analytics !== 'undefined' && Analytics.getProjectYear) return Analytics.getProjectYear(project);
    var y = parseInt(project._annee, 10);
    return isFinite(y) ? y : null;
  }

  function getDate(project) {
    if (typeof Analytics !== 'undefined' && Analytics.getProjectDate) return Analytics.getProjectDate(project);
    return null;
  }

  function currentSelectedYear() {
    var el = document.getElementById('year-filter');
    var y = el && el.value ? parseInt(el.value, 10) : NaN;
    if (isFinite(y)) return y;

    var raw = (typeof AE !== 'undefined' && AE.getRaw) ? AE.getRaw() : [];
    var years = raw.map(getYear).filter(function(v) { return isFinite(v); });
    if (!years.length) return new Date().getFullYear();
    return Math.max.apply(null, years);
  }

  function applyEngineLikeFilters(projects, opts) {
    opts = opts || {};
    var data = Array.isArray(projects) ? projects.slice() : [];
    var year = currentSelectedYear();
    var search = (document.getElementById('search-bar') || {}).value || '';
    var filters = (typeof AE !== 'undefined' && AE.getFilters) ? AE.getFilters() : {};
    var energy = (typeof AE !== 'undefined' && AE.getEnergyType) ? AE.getEnergyType() : '';
    var nv = (typeof AE !== 'undefined' && AE.nv) ? AE.nv : function(v) {
      if (v == null) return null;
      var s = String(v).trim();
      return s ? s : null;
    };

    if (opts.respectYear !== false) {
      data = data.filter(function(p) { return getYear(p) === year; });
    }

    if (search) {
      var q = String(search).toLowerCase();
      data = data.filter(function(p) {
        return [
          p['Dénomination'],
          p['Client'],
          p['Zone Géographique'],
          p['Type de projet (Activité)'],
          p['N°- AO'] || ''
        ].join(' ').toLowerCase().indexOf(q) !== -1;
      });
    }

    if (energy) {
      data = data.filter(function(p) {
        var nom = String(p['Dénomination'] || '');
        var type = String(p['Type de projet (Activité)'] || '');
        var eolien = /[eé]olien/i.test(nom) || /[eé]olien/i.test(type);
        return energy === 'eolien' ? eolien : !eolien;
      });
    }

    Object.keys(filters).forEach(function(k) {
      var v = filters[k];
      if (v == null) return;
      data = data.filter(function(p) {
        if (k === 'Statut') return getStatus(p) === v || (typeof ProjectUtils !== 'undefined' && ProjectUtils.parseStatusKey && ProjectUtils.parseStatusKey(v) === getStatus(p));
        var pv = nv(p[k]);
        return pv != null && pv === v;
      });
    });

    return data;
  }

  function isWon(project) { return getStatus(project) === 'obtenu'; }
  function isLost(project) { return getStatus(project) === 'perdu'; }
  function isOffer(project) { return getStatus(project) === 'offre'; }
  function isDecided(project) { var s = getStatus(project); return s === 'obtenu' || s === 'perdu'; }

  function computeValue(projects, mode) {
    var items = Array.isArray(projects) ? projects : [];
    switch (mode) {
      case 'won_amount':
        return items.filter(isWon).reduce(function(sum, p) { return sum + getBud(p); }, 0);
      case 'lost_amount':
        return items.filter(isLost).reduce(function(sum, p) { return sum + getBud(p); }, 0);
      case 'decided_amount':
        return items.filter(isDecided).reduce(function(sum, p) { return sum + getBud(p); }, 0);
      case 'won_rate_amount':
        var wonAmount = computeValue(items, 'won_amount');
        var lostAmount = computeValue(items, 'lost_amount');
        return (wonAmount + lostAmount) > 0 ? (wonAmount / (wonAmount + lostAmount)) : 0;
      case 'won_count':
        return items.filter(isWon).length;
      case 'lost_count':
        return items.filter(isLost).length;
      case 'decided_count':
        return items.filter(isDecided).length;
      case 'won_rate_count':
        var wonCount = computeValue(items, 'won_count');
        var lostCount = computeValue(items, 'lost_count');
        return (wonCount + lostCount) > 0 ? (wonCount / (wonCount + lostCount)) : 0;
      case 'pipe_bud':
        return items.filter(isOffer).reduce(function(sum, p) { return sum + getBud(p); }, 0);
      case 'pipe_weighted':
        return items.filter(isOffer).reduce(function(sum, p) { return sum + getWeighted(p); }, 0);
      case 'pipe_ratio':
        var bud = computeValue(items, 'pipe_bud');
        var weighted = computeValue(items, 'pipe_weighted');
        return bud > 0 ? (weighted / bud) : 0;
      default:
        return 0;
    }
  }

  function modeScopeProjects(projects, mode) {
    var items = Array.isArray(projects) ? projects : [];
    if (mode.indexOf('pipe_') === 0) return items.filter(isOffer);
    if (mode === 'won_amount' || mode === 'won_count') return items.filter(isWon);
    if (mode === 'lost_amount' || mode === 'lost_count') return items.filter(isLost);
    if (mode === 'decided_amount' || mode === 'decided_count' || mode === 'won_rate_amount' || mode === 'won_rate_count') return items.filter(isDecided);
    return items;
  }

  function formatValue(value, mode) {
    if (mode === 'won_rate_amount' || mode === 'won_rate_count' || mode === 'pipe_ratio') {
      return (value * 100).toFixed(1).replace('.', ',') + ' %';
    }
    if (mode.indexOf('_count') !== -1) {
      return Math.round(value).toLocaleString('fr-FR');
    }
    if (typeof ProjectUtils !== 'undefined' && ProjectUtils.formatMontant) return ProjectUtils.formatMontant(value, true);
    return Math.round(value).toLocaleString('fr-FR') + ' €';
  }

  function modeLabel(mode) {
    var labels = {
      won_amount: '€ gagnés',
      lost_amount: '€ perdus',
      decided_amount: '€ gagnés + perdus',
      won_rate_amount: 'Taux de transfo €',
      won_count: 'Nb gagnés',
      lost_count: 'Nb perdus',
      decided_count: 'Nb gagnés + perdus',
      won_rate_count: 'Taux de transfo dossiers',
      pipe_bud: 'Pipe Bud',
      pipe_weighted: 'Pipe CA win proba',
      pipe_ratio: 'Pipe % CA win proba / Bud'
    };
    return labels[mode] || mode;
  }

  function createAggregateEntries(projects, dimension, mode, limit) {
    var buckets = {};
    var accessor = {
      zone: function(p) { return cleanLabel(p['Zone Géographique']); },
      client: function(p) { return cleanLabel(p['Client']); },
      type: function(p) { return cleanLabel(p['Type de projet (Activité)']); }
    }[dimension];

    if (!accessor) return [];

    projects.forEach(function(project) {
      var key = accessor(project);
      if (!buckets[key]) buckets[key] = [];
      buckets[key].push(project);
    });

    return Object.keys(buckets).map(function(key) {
      return {
        label: key,
        value: computeValue(buckets[key], mode),
        projects: buckets[key]
      };
    }).sort(function(a, b) {
      return b.value - a.value;
    }).slice(0, limit || 12);
  }

  function createMonthlyEntries(projects, mode, year) {
    var buckets = Array.from({ length: 12 }, function(_, idx) { return { label: MONTHS[idx], value: 0, projects: [] }; });
    projects.filter(function(p) { return getYear(p) === year; }).forEach(function(project) {
      var dt = getDate(project);
      if (!dt || !isFinite(dt.getMonth())) return;
      var idx = dt.getMonth();
      buckets[idx].projects.push(project);
    });
    buckets.forEach(function(bucket) {
      bucket.value = computeValue(bucket.projects, mode);
    });
    return buckets;
  }

  function createComboEntries(projects, keyA, keyB, mode, limit) {
    var map = {};
    projects.forEach(function(project) {
      var a = cleanLabel(project[keyA]);
      var b = cleanLabel(project[keyB]);
      var key = a + ' • ' + b;
      if (!map[key]) map[key] = { label: key, filters: {}, projects: [] };
      map[key].filters[keyA] = a;
      map[key].filters[keyB] = b;
      map[key].projects.push(project);
    });

    return Object.keys(map).map(function(key) {
      var item = map[key];
      return {
        label: item.label,
        value: computeValue(item.projects, mode),
        filters: item.filters,
        projects: item.projects
      };
    }).sort(function(a, b) {
      return b.value - a.value;
    }).slice(0, limit || 12);
  }

  function paletteFor(mode, count) {
    var base = (mode === 'lost_amount' || mode === 'lost_count') ? 'rgba(255,77,109,' :
      (mode === 'won_rate_amount' || mode === 'won_rate_count' || mode === 'pipe_ratio') ? 'rgba(245,183,64,' :
      (mode.indexOf('pipe_') === 0) ? 'rgba(0,153,255,' :
      'rgba(0,212,170,';

    var arr = [];
    for (var i = 0; i < count; i++) {
      var alpha = Math.max(.35, .86 - (i * .03));
      arr.push(base + alpha + ')');
    }
    return arr;
  }

  function tooltipFormatter(mode) {
    return function(context) {
      return formatValue(context.raw, mode);
    };
  }

  function openDetails(projects, title) {
    var rows = Array.isArray(projects) ? projects.slice() : [];
    if (typeof showDetailTable === 'function') {
      showDetailTable(rows, title);
      return;
    }
    console.warn('[BusinessDashboard] showDetailTable indisponible pour', title);
  }

  function renderKpi(id, label, value, sub, projects, title, mode) {
    var el = document.getElementById(id);
    if (!el) return;
    el.innerHTML =
      '<span class="business-kpi-label">' + label + '</span>' +
      '<span class="business-kpi-value">' + formatValue(value, mode) + '</span>' +
      '<span class="business-kpi-sub">' + sub + '</span>';
    el.onclick = function() {
      openDetails(projects, title);
    };
  }

  function createChart(id, title, entries, mode, opts) {
    opts = opts || {};
    var labels = entries.map(function(e) { return e.label; });
    var values = entries.map(function(e) { return e.value; });
    var colors = paletteFor(mode, values.length);
    var chartType = opts.type || ((opts.indexAxis === 'y') ? 'bar' : ((mode === 'won_rate_amount' || mode === 'won_rate_count' || mode === 'pipe_ratio') && !opts.forceBar ? 'line' : 'bar'));

    CM.create(id, {
      type: chartType,
      data: {
        labels: labels,
        datasets: [{
          label: title,
          data: values,
          backgroundColor: colors,
          borderColor: colors.map(function(c) { return c.replace(/0\.[0-9]+\)/, '1)'); }),
          borderWidth: 2,
          tension: .28,
          fill: false,
          pointRadius: chartType === 'line' ? 3 : 0,
          borderRadius: opts.indexAxis === 'y' ? 8 : 12,
          maxBarThickness: opts.maxBarThickness || 28
        }]
      },
      options: {
        indexAxis: opts.indexAxis,
        interaction: {
          mode: 'nearest',
          intersect: false
        },
        scales: {
          x: {
            ticks: {
              color: '#a8bdd3',
              callback: function(value) {
                var raw = this.getLabelForValue ? this.getLabelForValue(value) : value;
                return opts.indexAxis === 'y' ? String(raw).slice(0, 32) : undefined;
              }
            },
            grid: { color: 'rgba(255,255,255,.06)' }
          },
          y: {
            beginAtZero: true,
            ticks: {
              color: '#a8bdd3',
              callback: function(value) {
                return formatValue(value, mode);
              }
            },
            grid: { color: 'rgba(255,255,255,.06)' }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: tooltipFormatter(mode)
            }
          }
        },
        onClick: function(_, elements) {
          if (!elements || !elements.length) return;
          var idx = elements[0].index;
          var entry = entries[idx];
          if (!entry) return;
          openDetails(entry.projects || [], title + ' — ' + entry.label);
        }
      }
    });
  }

  function updateTitles(prefix, mode) {
    var label = modeLabel(mode);
    var mappings = {
      month: 'par mois',
      zone: 'par zone geographique',
      client: 'par client',
      type: 'par type de projet',
      'zone-client': 'zone / client',
      'client-type': 'client / type de projet'
    };

    Object.keys(mappings).forEach(function(key) {
      var el = document.getElementById(prefix + key);
      if (el) el.textContent = label + ' ' + mappings[key];
    });
  }

  function renderPerformance(rawFiltered, rawAll) {
    var view = (document.getElementById('biz-performance-view') || {}).value || 'won_amount';
    var comboScope = (document.getElementById('biz-performance-combo-scope') || {}).value || 'year';
    var filteredYear = applyEngineLikeFilters(rawAll, { respectYear: true });
    var filteredAll = applyEngineLikeFilters(rawAll, { respectYear: false });
    var activeYear = currentSelectedYear();

    updateTitles('biz-title-perf-', view);
    var monthHint = document.getElementById('biz-hint-perf-month');
    if (monthHint) monthHint.textContent = 'Annee active ' + activeYear + ' uniquement';
    var comboHint = document.getElementById('biz-hint-perf-zone-client');
    if (comboHint) comboHint.textContent = comboScope === 'all' ? 'Top couples zone + client depuis le fichier' : 'Top couples zone + client sur l annee active';

    renderKpi('biz-kpi-won-year', '€ gagnes annee active', computeValue(filteredYear, 'won_amount'), 'Base Bud, statut obtenu', filteredYear.filter(isWon), '€ gagnes — annee ' + activeYear, 'won_amount');
    renderKpi('biz-kpi-lost-year', '€ perdus annee active', computeValue(filteredYear, 'lost_amount'), 'Base Bud, statut perdu', filteredYear.filter(isLost), '€ perdus — annee ' + activeYear, 'lost_amount');
    renderKpi('biz-kpi-decided-year', '€ gagnes + perdus', computeValue(filteredYear, 'decided_amount'), 'Projets decides sur l annee active', filteredYear.filter(isDecided), '€ gagnes + perdus — annee ' + activeYear, 'decided_amount');
    renderKpi('biz-kpi-rate-year', 'Taux de transfo €', computeValue(filteredYear, 'won_rate_amount'), '€ gagnes / (€ gagnes + € perdus)', filteredYear.filter(isDecided), 'Taux de transformation € — annee ' + activeYear, 'won_rate_amount');
    renderKpi('biz-kpi-count-year', 'Nb dossiers decides', computeValue(filteredYear, 'decided_count'), 'Nombre de dossiers gagnes + perdus', filteredYear.filter(isDecided), 'Dossiers decides — annee ' + activeYear, 'decided_count');

    createChart('biz-chart-perf-month', modeLabel(view) + ' par mois', createMonthlyEntries(filteredYear, view, activeYear), view, {
      type: (view === 'won_rate_amount' || view === 'won_rate_count') ? 'line' : 'bar',
      maxBarThickness: 24
    });
    createChart('biz-chart-perf-zone', modeLabel(view) + ' par zone', createAggregateEntries(filteredYear, 'zone', view, 10), view, {
      indexAxis: 'y'
    });
    createChart('biz-chart-perf-client', modeLabel(view) + ' par client', createAggregateEntries(filteredYear, 'client', view, 10), view, {
      indexAxis: 'y'
    });
    createChart('biz-chart-perf-type', modeLabel(view) + ' par type', createAggregateEntries(filteredYear, 'type', view, 10), view, {
      indexAxis: 'y'
    });
    createChart(
      'biz-chart-perf-zone-client',
      modeLabel(view) + ' zone / client',
      createComboEntries(comboScope === 'all' ? filteredAll : filteredYear, 'Zone Géographique', 'Client', view, 12),
      view,
      { indexAxis: 'y' }
    );
    createChart('biz-chart-perf-client-type', modeLabel(view) + ' client / type', createComboEntries(filteredYear, 'Client', 'Type de projet (Activité)', view, 12), view, {
      indexAxis: 'y'
    });
  }

  function renderPipeline(rawAll) {
    var view = (document.getElementById('biz-pipe-view') || {}).value || 'pipe_bud';
    var filteredYear = applyEngineLikeFilters(rawAll, { respectYear: true });
    var offers = filteredYear.filter(isOffer);

    updateTitles('biz-title-pipe-', view);

    renderKpi('biz-kpi-pipe-bud', 'Pipe Bud actif', computeValue(filteredYear, 'pipe_bud'), 'Offres en cours — base Bud', offers, 'Pipe commercial Bud', 'pipe_bud');
    renderKpi('biz-kpi-pipe-weighted', 'Pipe CA win proba', computeValue(filteredYear, 'pipe_weighted'), 'Somme CA win proba sur offres en cours', offers, 'Pipe commercial CA win proba', 'pipe_weighted');
    renderKpi('biz-kpi-pipe-ratio', 'Pipe % CA win proba / Bud', computeValue(filteredYear, 'pipe_ratio'), 'Ponderation globale du pipe actif', offers, 'Pipe commercial ratio', 'pipe_ratio');

    createChart('biz-chart-pipe-zone', modeLabel(view) + ' par zone', createAggregateEntries(filteredYear, 'zone', view, 10), view, {
      indexAxis: 'y'
    });
    createChart('biz-chart-pipe-client', modeLabel(view) + ' par client', createAggregateEntries(filteredYear, 'client', view, 10), view, {
      indexAxis: 'y'
    });
    createChart('biz-chart-pipe-type', modeLabel(view) + ' par type', createAggregateEntries(filteredYear, 'type', view, 10), view, {
      indexAxis: 'y'
    });
    createChart('biz-chart-pipe-zone-client', modeLabel(view) + ' zone / client', createComboEntries(filteredYear, 'Zone Géographique', 'Client', view, 12), view, {
      indexAxis: 'y'
    });
    createChart('biz-chart-pipe-client-type', modeLabel(view) + ' client / type', createComboEntries(filteredYear, 'Client', 'Type de projet (Activité)', view, 12), view, {
      indexAxis: 'y'
    });
  }

  function hideSectionByLabel(label) {
    document.querySelectorAll('.section-div').forEach(function(div) {
      var lbl = div.querySelector('.section-lbl');
      if (!lbl) return;
      if (lbl.textContent.trim() !== label) return;
      div.classList.add('legacy-business-hidden');
      var next = div.nextElementSibling;
      if (next && next.classList.contains('section-collapsible')) next.classList.add('legacy-business-hidden');
    });
  }

  function archiveLegacyCharts() {
    document.body.classList.add('business-dashboard-simplified');

    LEGACY_SECTION_LABELS.forEach(hideSectionByLabel);

    var compare = document.getElementById('compare-panel');
    if (compare) compare.classList.add('legacy-business-hidden');

    var module9 = Array.prototype.find.call(document.querySelectorAll('.section-div'), function(div) {
      return div.textContent.indexOf('Analyses avancées') !== -1;
    });
    if (module9) module9.classList.add('legacy-business-hidden');

    document.querySelectorAll('.funnel-section, .heatmap-section').forEach(function(el) {
      el.classList.add('legacy-business-hidden');
    });

    document.querySelectorAll('.chart-card[data-chart-id]').forEach(function(card) {
      if (card.closest('#business-dashboard-root')) return;
      card.dataset.archivedChart = '1';
      card.classList.add('hidden-chart');
      var canvas = card.querySelector('canvas[id]');
      if (canvas && typeof CM !== 'undefined' && CM.destroy) {
        try { CM.destroy(canvas.id); } catch (_) {}
      }
    });

    if (window._chartVis && window._chartVis.update) {
      try { window._chartVis.update(); } catch (_) {}
    }
  }

  function bindControls() {
    ['biz-performance-view', 'biz-performance-combo-scope', 'biz-pipe-view'].forEach(function(id) {
      var el = document.getElementById(id);
      if (!el || el._businessBound) return;
      el._businessBound = true;
      el.addEventListener('change', render);
    });
  }

  function render() {
    if (typeof AE === 'undefined' || typeof CM === 'undefined') return;
    var rawAll = (AE.getRaw && AE.getRaw()) || window.DATA || [];
    var rawFiltered = (AE.getFiltered && AE.getFiltered()) || rawAll;
    renderPerformance(rawFiltered, rawAll);
    renderPipeline(rawAll);
  }

  function init() {
    archiveLegacyCharts();
    bindControls();
    render();

    if (typeof AE !== 'undefined' && AE.subscribe) {
      AE.subscribe(render);
    }
  }

  window.BusinessChartsDashboard = { init: init, render: render, hideLegacy: archiveLegacyCharts };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
