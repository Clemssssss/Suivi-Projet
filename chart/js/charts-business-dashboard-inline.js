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
  var INLINE_DRILL_STATE = {};
  var OFFER_UI_LABEL = 'Offre (Remis / Non Chiffré / Avant Projet / En Etude)';

  function cleanLabel(value) {
    var raw = value == null ? '' : String(value).trim();
    return raw || 'Non renseigne';
  }

  function getRawStatus(project) {
    return cleanLabel(project && (project['Statut'] || project['MG Statut Odoo MG']));
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
    if (typeof Analytics !== 'undefined' && Analytics.getProjectYear) {
      var liveYear = parseInt(Analytics.getProjectYear(project), 10);
      return isFinite(liveYear) ? liveYear : null;
    }
    var y = parseInt(project._annee, 10);
    return isFinite(y) ? y : null;
  }

  function getDate(project) {
    if (typeof Analytics !== 'undefined' && Analytics.getProjectDate) return Analytics.getProjectDate(project);
    return null;
  }

  function isValidYear(value) {
    return typeof value === 'number' && isFinite(value);
  }

  function isSimplifiedDashboard() {
    return !!(document.body && document.body.classList && document.body.classList.contains('business-dashboard-simplified'));
  }

  function explicitSelectedYear() {
    var el = document.getElementById('year-filter');
    var y = el && el.value ? parseInt(el.value, 10) : NaN;
    return isFinite(y) ? y : null;
  }

  function currentSelectedYear() {
    var explicit = explicitSelectedYear();
    if (isValidYear(explicit)) return explicit;
    var raw = (typeof AE !== 'undefined' && AE.getRaw) ? AE.getRaw() : [];
    var years = raw.map(getYear).filter(isValidYear);
    if (!years.length) return new Date().getFullYear();
    return Math.max.apply(null, years);
  }

  function resolveReferenceYear(projects, mode) {
    var explicit = explicitSelectedYear();
    if (isValidYear(explicit)) return explicit;

    var base = Array.isArray(projects) ? projects.slice() : [];
    var years = base.map(getYear).filter(isValidYear);
    var uniqueYears = Array.from(new Set(years)).sort(function(a, b) { return b - a; });

    for (var i = 0; i < uniqueYears.length; i++) {
      var year = uniqueYears[i];
      var scoped = base.filter(function(p) { return getYear(p) === year; });
      if (computeValue(scoped, mode) > 0) return year;
    }

    if (uniqueYears.length) return uniqueYears[0];
    return new Date().getFullYear();
  }

  function applyEngineLikeFilters(projects, opts) {
    opts = opts || {};
    var data = Array.isArray(projects) ? projects.slice() : [];
    var year = isValidYear(opts.year) ? opts.year : currentSelectedYear();
    var search = (document.getElementById('search-input') || document.getElementById('search-bar') || {}).value || '';
    var includeEngineFilters = opts.includeEngineFilters === true || (!isSimplifiedDashboard() && opts.includeEngineFilters !== false);
    var filters = (includeEngineFilters && typeof AE !== 'undefined' && AE.getFilters) ? AE.getFilters() : {};
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
      case 'offer_count':
        return items.filter(isOffer).length;
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
    if (mode === 'compare_status_amount' || mode === 'compare_status_count') return items.filter(function(p) { return isWon(p) || isLost(p) || isOffer(p); });
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
      amount: 'Montant',
      count: 'Nombre de dossiers',
      won_amount: '€ gagnés',
      lost_amount: '€ perdus',
      decided_amount: '€ gagnés + perdus',
      compare_status_amount: '€ gagnés / perdus / ' + OFFER_UI_LABEL,
      won_rate_amount: 'Taux de transfo €',
      won_count: 'Nb gagnés',
      lost_count: 'Nb perdus',
      decided_count: 'Nb gagnés + perdus',
      compare_status_count: 'Dossiers gagnés / perdus / ' + OFFER_UI_LABEL,
      won_rate_count: 'Taux de transfo dossiers',
      pipe_bud: '€ Remis + En étude',
      pipe_weighted: '€ Remis + En étude',
      pipe_ratio: '% Remis + En étude'
    };
    return labels[mode] || mode;
  }

  function performanceMetricFamily(view) {
    if (view === 'count' || view === 'won_count' || view === 'lost_count' || view === 'decided_count' || view === 'compare_status_count' || view === 'won_rate_count') {
      return 'count';
    }
    return 'amount';
  }

  function resolvePerformanceDisplayMode(view, statusFilter) {
    if (view === 'won_rate_amount' || view === 'won_rate_count') {
      return 'won_rate_amount';
    }

    var family = performanceMetricFamily(view);
    var selected = statusFilter || 'all';

    if (selected === 'all') {
      return family === 'count' ? 'compare_status_count' : 'compare_status_amount';
    }
    if (selected === 'won') {
      return family === 'count' ? 'won_count' : 'won_amount';
    }
    if (selected === 'lost') {
      return family === 'count' ? 'lost_count' : 'lost_amount';
    }
    if (selected === 'decided') {
      return family === 'count' ? 'decided_count' : 'decided_amount';
    }
    if (selected === 'offer') {
      return family === 'count' ? 'offer_count' : 'pipe_bud';
    }
    return view;
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

  function comparisonSeriesForMode(mode) {
    return mode === 'compare_status_count'
      ? [
          { key: 'won_count', label: 'Gagné', color: 'rgba(0,212,170,.82)', border: 'rgba(0,212,170,1)' },
          { key: 'lost_count', label: 'Perdu', color: 'rgba(255,77,109,.82)', border: 'rgba(255,77,109,1)' },
          { key: 'offer_count', label: OFFER_UI_LABEL, color: 'rgba(0,153,255,.82)', border: 'rgba(0,153,255,1)' }
        ]
      : [
          { key: 'won_amount', label: 'Gagné', color: 'rgba(0,212,170,.82)', border: 'rgba(0,212,170,1)' },
          { key: 'lost_amount', label: 'Perdu', color: 'rgba(255,77,109,.82)', border: 'rgba(255,77,109,1)' },
          { key: 'pipe_bud', label: OFFER_UI_LABEL, color: 'rgba(0,153,255,.82)', border: 'rgba(0,153,255,1)' }
        ];
  }

  function createComparisonAggregateEntries(projects, dimension, mode, limit) {
    var baseEntries = createAggregateEntries(projects, dimension, 'decided_amount', limit);
    var series = comparisonSeriesForMode(mode);
    return baseEntries.map(function(entry) {
      var values = {};
      series.forEach(function(serie) {
        values[serie.key] = computeValue(entry.projects, serie.key);
      });
      return {
        label: entry.label,
        values: values,
        projects: entry.projects
      };
    }).filter(function(entry) {
      return series.some(function(serie) { return entry.values[serie.key] > 0; });
    });
  }

  function createComparisonMonthlyEntries(projects, mode, year) {
    var series = comparisonSeriesForMode(mode);
    return Array.from({ length: 12 }, function(_, idx) {
      var bucketProjects = [];
      projects.filter(function(p) { return getYear(p) === year; }).forEach(function(project) {
        var dt = getDate(project);
        if (!dt || !isFinite(dt.getMonth()) || dt.getMonth() !== idx) return;
        bucketProjects.push(project);
      });
      var values = {};
      series.forEach(function(serie) {
        values[serie.key] = computeValue(bucketProjects, serie.key);
      });
      return {
        label: MONTHS[idx],
        values: values,
        projects: bucketProjects
      };
    });
  }

  function createComparisonComboEntries(projects, keyA, keyB, mode, limit) {
    var baseEntries = createComboEntries(projects, keyA, keyB, 'decided_amount', limit);
    var series = comparisonSeriesForMode(mode);
    return baseEntries.map(function(entry) {
      var values = {};
      series.forEach(function(serie) {
        values[serie.key] = computeValue(entry.projects, serie.key);
      });
      return {
        label: entry.label,
        values: values,
        projects: entry.projects
      };
    }).filter(function(entry) {
      return series.some(function(serie) { return entry.values[serie.key] > 0; });
    });
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

  function comparisonTooltipFormatter(mode) {
    return function(context) {
      var seriesMode = context.dataset && context.dataset._seriesMode ? context.dataset._seriesMode : mode;
      return context.dataset.label + ' : ' + formatValue(context.raw, seriesMode);
    };
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatDateLabel(project) {
    var dt = getDate(project);
    if (dt && typeof dt.toLocaleDateString === 'function') {
      return dt.toLocaleDateString('fr-FR');
    }
    return cleanLabel(project['Date réception'] || project['Date Reception'] || project['Date de réception']);
  }

  function uniqueProjects(projects) {
    var seen = new Set();
    var list = [];
    (Array.isArray(projects) ? projects : []).forEach(function(project) {
      if (!project || seen.has(project)) return;
      seen.add(project);
      list.push(project);
    });
    return list;
  }

  function collectProjectsFromEntries(entries) {
    var acc = [];
    (Array.isArray(entries) ? entries : []).forEach(function(entry) {
      if (Array.isArray(entry && entry.projects)) {
        acc = acc.concat(entry.projects);
      }
    });
    return uniqueProjects(acc);
  }

  function getInlineCard(chartId) {
    return document.querySelector('.chart-card[data-chart-id="' + chartId + '"]');
  }

  function getInlineActions(chartId) {
    var card = getInlineCard(chartId);
    if (!card) return null;
    var actions = card.querySelector('.business-drill-actions');
    if (actions) return actions;

    actions = document.createElement('div');
    actions.className = 'business-drill-actions';
    actions.innerHTML =
      '<button type="button" class="business-drill-btn" data-role="show-all">Voir toutes les données du graphique</button>' +
      '<button type="button" class="business-drill-btn business-drill-btn-secondary" data-role="hide">Masquer les données</button>';
    card.appendChild(actions);

    actions.querySelector('[data-role="show-all"]').addEventListener('click', function() {
      var state = INLINE_DRILL_STATE[chartId];
      if (!state) return;
      openDetails(state.allProjects, state.title, { chartId: chartId, useInline: true });
    });
    actions.querySelector('[data-role="hide"]').addEventListener('click', function() {
      closeInlineDetails(chartId);
    });
    return actions;
  }

  function getInlinePanel(chartId) {
    var card = getInlineCard(chartId);
    if (!card) return null;
    var panel = card.querySelector('.business-drill-panel');
    if (panel) return panel;

    panel = document.createElement('div');
    panel.className = 'business-drill-panel';
    card.appendChild(panel);
    return panel;
  }

  function projectRowsHtml(projects) {
    return (Array.isArray(projects) ? projects : []).map(function(project) {
      var status = getStatus(project);
      return (
        '<tr>' +
          '<td>' + escapeHtml(formatDateLabel(project)) + '</td>' +
          '<td>' + escapeHtml(project['Client']) + '</td>' +
          '<td>' + escapeHtml(project['Dénomination'] || project['Denomination']) + '</td>' +
          '<td>' + escapeHtml(project['Zone Géographique']) + '</td>' +
          '<td>' + escapeHtml(project['Type de projet (Activité)']) + '</td>' +
          '<td>' + escapeHtml(getRawStatus(project)) + '</td>' +
          '<td>' + escapeHtml(status) + '</td>' +
          '<td>' + escapeHtml(formatValue(getBud(project), 'won_amount')) + '</td>' +
          '<td>' + escapeHtml(formatValue(getWeighted(project), 'pipe_weighted')) + '</td>' +
        '</tr>'
      );
    }).join('');
  }

  function renderInlineDetails(chartId, projects, title) {
    var panel = getInlinePanel(chartId);
    if (!panel) return;

    var rows = uniqueProjects(projects);
    var totalBud = rows.reduce(function(sum, project) { return sum + getBud(project); }, 0);
    var totalWeighted = rows.reduce(function(sum, project) { return sum + getWeighted(project); }, 0);

    panel.innerHTML =
      '<div class="business-drill-head">' +
        '<div class="business-drill-title">' + escapeHtml(title) + '</div>' +
        '<div class="business-drill-meta">' +
          '<span class="business-drill-pill">' + escapeHtml(String(rows.length)) + ' projet' + (rows.length > 1 ? 's' : '') + '</span>' +
          '<span class="business-drill-pill">Bud ' + escapeHtml(formatValue(totalBud, 'won_amount')) + '</span>' +
          '<span class="business-drill-pill">CA win proba ' + escapeHtml(formatValue(totalWeighted, 'pipe_weighted')) + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="business-drill-wrap">' +
        '<table class="business-drill-table">' +
          '<thead><tr><th>Date</th><th>Client</th><th>Projet</th><th>Zone</th><th>Type</th><th>Statut source</th><th>Statut normalisé</th><th>Bud</th><th>CA win proba</th></tr></thead>' +
          '<tbody>' + projectRowsHtml(rows) + '</tbody>' +
        '</table>' +
      '</div>';

    panel.classList.add('is-open');
    var globalSection = document.getElementById('detail-section');
    if (globalSection) globalSection.classList.remove('active');
  }

  function closeInlineDetails(chartId) {
    var panel = getInlinePanel(chartId);
    if (!panel) return;
    panel.classList.remove('is-open');
    panel.innerHTML = '';
    var actions = getInlineActions(chartId);
    if (actions) {
      var hideBtn = actions.querySelector('[data-role="hide"]');
      if (hideBtn) hideBtn.disabled = true;
    }
  }

  function syncInlineDrilldown(chartId, title, entries) {
    var allProjects = collectProjectsFromEntries(entries);
    INLINE_DRILL_STATE[chartId] = {
      title: title,
      allProjects: allProjects
    };

    var actions = getInlineActions(chartId);
    var panel = getInlinePanel(chartId);
    if (!actions || !panel) return;
    panel.classList.remove('is-open');
    panel.innerHTML = '';

    var showAllBtn = actions.querySelector('[data-role="show-all"]');
    var hideBtn = actions.querySelector('[data-role="hide"]');
    if (showAllBtn) {
      showAllBtn.disabled = !allProjects.length;
      showAllBtn.textContent = allProjects.length
        ? 'Voir toutes les données du graphique'
        : 'Aucune donnée sur ce graphique';
    }
    if (hideBtn) {
      hideBtn.disabled = !panel.classList.contains('is-open');
    }
  }

  function openDetails(projects, title, options) {
    options = options || {};
    var rows = Array.isArray(projects) ? projects.slice() : [];
    if (options.useInline && options.chartId) {
      renderInlineDetails(options.chartId, rows, title);
      var actions = getInlineActions(options.chartId);
      if (actions) {
        var hideBtn = actions.querySelector('[data-role="hide"]');
        if (hideBtn) hideBtn.disabled = false;
      }
      return;
    }
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
    var primaryColor = colors[0] || 'rgba(0,212,170,.82)';
    var dataset = {
      label: title,
      data: values,
      borderWidth: chartType === 'line' ? 3 : 1,
      maxBarThickness: opts.maxBarThickness || 28
    };

    if (chartType === 'line') {
      dataset.borderColor = primaryColor.replace(/0\.[0-9]+\)/, '1)');
      dataset.backgroundColor = primaryColor;
      dataset.tension = .28;
      dataset.fill = false;
      dataset.pointRadius = 3;
      dataset.pointHoverRadius = 4;
      dataset.pointBackgroundColor = dataset.borderColor;
      dataset.pointBorderColor = '#dce8f5';
      dataset.pointBorderWidth = 1;
    } else {
      dataset.backgroundColor = colors;
      dataset.borderColor = primaryColor.replace(/0\.[0-9]+\)/, '1)');
      dataset.borderRadius = opts.indexAxis === 'y' ? 8 : 12;
    }

    var isHorizontal = opts.indexAxis === 'y';
    var numericTicks = function(value) {
      return formatValue(Number(value) || 0, mode);
    };
    var categoryTicks = function(value) {
      var idx = typeof value === 'number' ? value : parseInt(value, 10);
      var raw = isFinite(idx) && labels[idx] != null ? labels[idx] : value;
      return String(raw == null ? '' : raw).slice(0, 32);
    };

    CM.create(id, {
      type: chartType,
      data: {
        labels: labels,
        datasets: [dataset]
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
              callback: isHorizontal ? numericTicks : categoryTicks
            },
            grid: { color: 'rgba(255,255,255,.06)' }
          },
          y: {
            beginAtZero: !isHorizontal,
            ticks: {
              color: '#a8bdd3',
              callback: isHorizontal ? categoryTicks : numericTicks
            },
            grid: { color: 'rgba(255,255,255,.06)' }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            displayColors: false,
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
          openDetails(entry.projects || [], title + ' — ' + entry.label, { chartId: id, useInline: true });
        }
      }
    });
    syncInlineDrilldown(id, title, entries);
  }

  function createComparisonChart(id, title, entries, mode, opts) {
    opts = opts || {};
    var series = comparisonSeriesForMode(mode);
    var labels = entries.map(function(e) { return e.label; });
    var isHorizontal = opts.indexAxis === 'y';
    var modeForTicks = mode === 'compare_status_count' ? 'won_count' : 'won_amount';

    var numericTicks = function(value) {
      return formatValue(Number(value) || 0, modeForTicks);
    };
    var categoryTicks = function(value) {
      var idx = typeof value === 'number' ? value : parseInt(value, 10);
      var raw = isFinite(idx) && labels[idx] != null ? labels[idx] : value;
      return String(raw == null ? '' : raw).slice(0, 32);
    };

    CM.create(id, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: series.map(function(serie) {
          return {
            label: serie.label,
            data: entries.map(function(entry) { return entry.values[serie.key] || 0; }),
            backgroundColor: serie.color,
            borderColor: serie.border,
            borderWidth: 1,
            borderRadius: isHorizontal ? 8 : 10,
            maxBarThickness: opts.maxBarThickness || 22,
            _seriesMode: serie.key
          };
        })
      },
      options: {
        indexAxis: opts.indexAxis,
        interaction: {
          mode: 'nearest',
          intersect: false
        },
        scales: {
          x: {
            stacked: false,
            ticks: {
              color: '#a8bdd3',
              callback: isHorizontal ? numericTicks : categoryTicks
            },
            grid: { color: 'rgba(255,255,255,.06)' }
          },
          y: {
            stacked: false,
            beginAtZero: !isHorizontal,
            ticks: {
              color: '#a8bdd3',
              callback: isHorizontal ? categoryTicks : numericTicks
            },
            grid: { color: 'rgba(255,255,255,.06)' }
          }
        },
        plugins: {
          legend: {
            display: true,
            labels: { color: '#dce8f5', boxWidth: 10, boxHeight: 10 }
          },
          tooltip: {
            displayColors: true,
            callbacks: {
              label: comparisonTooltipFormatter(mode)
            }
          }
        },
        onClick: function(_, elements) {
          if (!elements || !elements.length) return;
          var idx = elements[0].index;
          var datasetIndex = elements[0].datasetIndex;
          var entry = entries[idx];
          var serie = series[datasetIndex];
          if (!entry || !serie) return;
          var filteredProjects = (entry.projects || []).filter(function(project) {
            if (serie.key === 'won_amount' || serie.key === 'won_count') return isWon(project);
            if (serie.key === 'lost_amount' || serie.key === 'lost_count') return isLost(project);
            if (serie.key === 'pipe_bud' || serie.key === 'offer_count') return isOffer(project);
            return true;
          });
          openDetails(filteredProjects, title + ' — ' + entry.label + ' — ' + serie.label, { chartId: id, useInline: true });
        }
      }
    });
    syncInlineDrilldown(id, title, entries);
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
    var statusFilter = (document.getElementById('biz-performance-status-filter') || {}).value || 'all';
    var displayMode = resolvePerformanceDisplayMode(view, statusFilter);
    var baseVisible = applyEngineLikeFilters(rawAll, { respectYear: false, includeEngineFilters: false });
    var activeYear = resolveReferenceYear(baseVisible, displayMode);
    var filteredYear = applyEngineLikeFilters(baseVisible, { respectYear: true, year: activeYear, includeEngineFilters: false });
    var filteredAll = baseVisible.slice();

    updateTitles('biz-title-perf-', displayMode);
    var monthHint = document.getElementById('biz-hint-perf-month');
    if (monthHint) monthHint.textContent = 'Annee active ' + activeYear + ' uniquement';
    var comboHint = document.getElementById('biz-hint-perf-zone-client');
    if (comboHint) comboHint.textContent = comboScope === 'all' ? 'Top couples zone + client depuis le fichier' : 'Top couples zone + client sur l annee active';

    renderKpi('biz-kpi-won-year', '€ gagnes annee active', computeValue(filteredYear, 'won_amount'), 'Base Bud, statut obtenu', filteredYear.filter(isWon), '€ gagnes — annee ' + activeYear, 'won_amount');
    renderKpi('biz-kpi-lost-year', '€ perdus annee active', computeValue(filteredYear, 'lost_amount'), 'Base Bud, statut perdu', filteredYear.filter(isLost), '€ perdus — annee ' + activeYear, 'lost_amount');
    renderKpi('biz-kpi-decided-year', '€ gagnes + perdus', computeValue(filteredYear, 'decided_amount'), 'Projets decides sur l annee active', filteredYear.filter(isDecided), '€ gagnes + perdus — annee ' + activeYear, 'decided_amount');
    renderKpi('biz-kpi-rate-year', 'Taux de transfo €', computeValue(filteredYear, 'won_rate_amount'), '€ gagnes / (€ gagnes + € perdus)', filteredYear.filter(isDecided), 'Taux de transformation € — annee ' + activeYear, 'won_rate_amount');
    renderKpi('biz-kpi-count-year', 'Nb dossiers decides', computeValue(filteredYear, 'decided_count'), 'Nombre de dossiers gagnes + perdus', filteredYear.filter(isDecided), 'Dossiers decides — annee ' + activeYear, 'decided_count');

    if (displayMode === 'compare_status_amount' || displayMode === 'compare_status_count') {
      createComparisonChart('biz-chart-perf-month', modeLabel(displayMode) + ' par mois', createComparisonMonthlyEntries(filteredYear, displayMode, activeYear), displayMode, {
        maxBarThickness: 18
      });
      createComparisonChart('biz-chart-perf-zone', modeLabel(displayMode) + ' par zone', createComparisonAggregateEntries(filteredYear, 'zone', displayMode, 10), displayMode, {
        indexAxis: 'y'
      });
      createComparisonChart('biz-chart-perf-client', modeLabel(displayMode) + ' par client', createComparisonAggregateEntries(filteredYear, 'client', displayMode, 10), displayMode, {
        indexAxis: 'y'
      });
      createComparisonChart('biz-chart-perf-type', modeLabel(displayMode) + ' par type', createComparisonAggregateEntries(filteredYear, 'type', displayMode, 10), displayMode, {
        indexAxis: 'y'
      });
      createComparisonChart(
        'biz-chart-perf-zone-client',
        modeLabel(displayMode) + ' zone / client',
        createComparisonComboEntries(comboScope === 'all' ? filteredAll : filteredYear, 'Zone Géographique', 'Client', displayMode, 12),
        displayMode,
        { indexAxis: 'y' }
      );
      createComparisonChart('biz-chart-perf-client-type', modeLabel(displayMode) + ' client / type', createComparisonComboEntries(filteredYear, 'Client', 'Type de projet (Activité)', displayMode, 12), displayMode, {
        indexAxis: 'y'
      });
      return;
    }

    createChart('biz-chart-perf-month', modeLabel(displayMode) + ' par mois', createMonthlyEntries(filteredYear, displayMode, activeYear), displayMode, {
      type: (displayMode === 'won_rate_amount' || displayMode === 'won_rate_count') ? 'line' : 'bar',
      maxBarThickness: 24
    });
    createChart('biz-chart-perf-zone', modeLabel(displayMode) + ' par zone', createAggregateEntries(filteredYear, 'zone', displayMode, 10), displayMode, {
      indexAxis: 'y'
    });
    createChart('biz-chart-perf-client', modeLabel(displayMode) + ' par client', createAggregateEntries(filteredYear, 'client', displayMode, 10), displayMode, {
      indexAxis: 'y'
    });
    createChart('biz-chart-perf-type', modeLabel(displayMode) + ' par type', createAggregateEntries(filteredYear, 'type', displayMode, 10), displayMode, {
      indexAxis: 'y'
    });
    createChart(
      'biz-chart-perf-zone-client',
      modeLabel(displayMode) + ' zone / client',
      createComboEntries(comboScope === 'all' ? filteredAll : filteredYear, 'Zone Géographique', 'Client', displayMode, 12),
      displayMode,
      { indexAxis: 'y' }
    );
    createChart('biz-chart-perf-client-type', modeLabel(displayMode) + ' client / type', createComboEntries(filteredYear, 'Client', 'Type de projet (Activité)', displayMode, 12), displayMode, {
      indexAxis: 'y'
    });
  }

  function renderPipeline(rawAll) {
    var view = (document.getElementById('biz-pipe-view') || {}).value || 'pipe_bud';
    var baseVisible = applyEngineLikeFilters(rawAll, { respectYear: false, includeEngineFilters: false });
    var activeYear = resolveReferenceYear(baseVisible, view);
    var filteredYear = applyEngineLikeFilters(baseVisible, { respectYear: true, year: activeYear, includeEngineFilters: false });
    var offers = filteredYear.filter(isOffer);
    var totalLabel = view === 'pipe_ratio' ? '% Remis + En étude total' : '€ Remis + En étude total';
    var zoneHint = view === 'pipe_ratio' ? 'Part de CA win proba / Bud par zone géographique' : 'Remis + En étude par zone géographique';
    var clientHint = view === 'pipe_ratio' ? 'Part de CA win proba / Bud par client' : 'Remis + En étude par client';
    var typeHint = view === 'pipe_ratio' ? 'Part de CA win proba / Bud par type de chantier' : 'Remis + En étude par type de chantier';
    var zoneClientHint = view === 'pipe_ratio' ? 'Part de CA win proba / Bud par client / zone géographique' : 'Remis + En étude par client / zone géographique';
    var clientTypeHint = view === 'pipe_ratio' ? 'Part de CA win proba / Bud par client / type de chantier' : 'Remis + En étude par client / type de chantier';

    updateTitles('biz-title-pipe-', view);

    renderKpi('biz-kpi-pipe-bud', totalLabel, computeValue(filteredYear, view), 'Statut Remis + En étude', offers, modeLabel(view) + ' total', view);
    renderKpi('biz-kpi-pipe-weighted', 'Base sélectionnée', view === 'pipe_bud' ? computeValue(filteredYear, 'pipe_bud') : computeValue(filteredYear, 'pipe_weighted'), view === 'pipe_bud' ? 'Colonne Bud' : 'Colonne CA win proba', offers, modeLabel(view) + ' base', view === 'pipe_bud' ? 'pipe_bud' : 'pipe_weighted');
    renderKpi('biz-kpi-pipe-ratio', '% CA win proba / Bud', computeValue(filteredYear, 'pipe_ratio'), 'Pondération globale du pipe actif', offers, 'Pipe commercial ratio', 'pipe_ratio');

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

    var hints = {
      'biz-title-pipe-zone': zoneHint,
      'biz-title-pipe-client': clientHint,
      'biz-title-pipe-type': typeHint,
      'biz-title-pipe-zone-client': zoneClientHint,
      'biz-title-pipe-client-type': clientTypeHint
    };
    Object.keys(hints).forEach(function(id) {
      var titleEl = document.getElementById(id);
      if (titleEl && titleEl.parentElement && titleEl.parentElement.nextElementSibling) {
        titleEl.parentElement.nextElementSibling.textContent = hints[id];
      }
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
    ['biz-performance-view', 'biz-performance-combo-scope', 'biz-performance-status-filter', 'biz-pipe-view'].forEach(function(id) {
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
