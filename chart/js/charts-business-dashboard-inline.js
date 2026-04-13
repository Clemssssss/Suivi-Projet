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
  var BUSINESS_DRILL_STATE = { filters: {} };
  var BUSINESS_RENDER_TICKET = null;
  var BUSINESS_CHART_SUMMARIES = {};
  var OFFER_UI_LABEL = 'Offres en cours';
  var TABLE_VIEW_STORAGE_KEY = 'dashboard.chart.tableView';
  var BUSINESS_FILTER_LABELS = {
    '_mois': 'Mois',
    'Zone Géographique': 'Zone',
    'Client': 'Client',
    'Type de projet (Activité)': 'Type',
    '_businessStatus': 'Statut'
  };
  var BUSINESS_STATUS_LABELS = {
    won: 'Gagne',
    lost: 'Perdu',
    offer: 'Offre',
    decided: 'Decide',
    pipe: 'Pipe actif'
  };

  function cleanLabel(value) {
    var raw = value == null ? '' : String(value).trim();
    return raw || 'Non renseigne';
  }

  function storeTablePayload(payload) {
    try {
      if (window.localStorage) localStorage.setItem(TABLE_VIEW_STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {}
  }

  function storeTablePayloadWithToken(payload) {
    var token = 'tv-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    try {
      if (window.localStorage) {
        localStorage.setItem(TABLE_VIEW_STORAGE_KEY, JSON.stringify(payload));
        localStorage.setItem(TABLE_VIEW_STORAGE_KEY + '.' + token, JSON.stringify(payload));
      }
    } catch (e) {}
    return token;
  }

  function openTablePage(payload) {
    var finalPayload = Object.assign({ generatedAt: new Date().toISOString(), source: 'business-drill' }, payload);
    var token = storeTablePayloadWithToken(finalPayload);
    window.open('table-view.html?ts=' + Date.now() + '&key=' + encodeURIComponent(token), '_blank', 'noopener');
  }

  function bucketKey(value) {
    return cleanLabel(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function filterKey(value) {
    if (value == null) return '';
    var raw = String(value).trim();
    if (!raw) return '';
    return raw
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function businessDrillKeys() {
    return ['_mois', 'Zone Géographique', 'Client', 'Type de projet (Activité)', '_businessStatus'];
  }

  function normalizeBusinessDrillFilters(filters) {
    var normalized = {};
    businessDrillKeys().forEach(function(key) {
      if (!filters || filters[key] == null) return;
      var value = String(filters[key]).trim();
      if (!value) return;
      normalized[key] = value;
    });
    return normalized;
  }

  function getBusinessDrillFilters() {
    return normalizeBusinessDrillFilters(BUSINESS_DRILL_STATE.filters || {});
  }

  function hasBusinessDrillFilters() {
    return Object.keys(getBusinessDrillFilters()).length > 0;
  }

  function formatBusinessDrillValue(key, value) {
    if (key === '_businessStatus') return BUSINESS_STATUS_LABELS[value] || value;
    return value;
  }

  function scheduleBusinessRender() {
    if (BUSINESS_RENDER_TICKET != null) return;
    var runner = function() {
      BUSINESS_RENDER_TICKET = null;
      render();
    };
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      BUSINESS_RENDER_TICKET = window.requestAnimationFrame(runner);
      return;
    }
    BUSINESS_RENDER_TICKET = window.setTimeout(runner, 0);
  }

  function ensureBusinessDrillBar() {
    var root = document.getElementById('business-dashboard-root');
    if (!root) return null;
    var bar = document.getElementById('business-drill-bar');
    if (bar) return bar;

    bar = document.createElement('div');
    bar.id = 'business-drill-bar';
    bar.className = 'business-drill-bar';
    bar.innerHTML =
      '<div class="business-drill-bar-label">Filtres graphiques</div>' +
      '<div class="business-drill-bar-tags" data-role="tags"></div>' +
      '<button type="button" class="business-drill-bar-clear" data-role="clear">Tout effacer</button>';

    var collapse = root.querySelector('.business-section-collapsible');
    if (collapse) root.insertBefore(bar, collapse);
    else root.appendChild(bar);

    bar.querySelector('[data-role="clear"]').addEventListener('click', function() {
      clearBusinessDrillFilters();
    });
    return bar;
  }

  function renderBusinessDrillBar() {
    var bar = ensureBusinessDrillBar();
    if (!bar) return;
    var filters = getBusinessDrillFilters();
    var tags = bar.querySelector('[data-role="tags"]');
    if (!tags) return;

    if (!Object.keys(filters).length) {
      bar.classList.remove('is-active');
      tags.innerHTML = '<span class="business-drill-empty">Aucun filtre de graphique actif</span>';
      if (typeof FloatingFilterBar !== 'undefined' && FloatingFilterBar.render) {
        try { FloatingFilterBar.render(); } catch (_) {}
      }
      return;
    }

    bar.classList.add('is-active');
    tags.innerHTML = businessDrillKeys().filter(function(key) {
      return filters[key] != null;
    }).map(function(key) {
      return '<button type="button" class="business-drill-tag" data-key="' + escapeHtml(key) + '">' +
        '<span class="business-drill-tag-label">' + escapeHtml(BUSINESS_FILTER_LABELS[key] || key) + '</span>' +
        '<span class="business-drill-tag-value">' + escapeHtml(formatBusinessDrillValue(key, filters[key])) + '</span>' +
        '<span class="business-drill-tag-close">✕</span>' +
      '</button>';
    }).join('');

    tags.querySelectorAll('.business-drill-tag').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var key = this.getAttribute('data-key');
        if (!key) return;
        var next = getBusinessDrillFilters();
        delete next[key];
        BUSINESS_DRILL_STATE.filters = normalizeBusinessDrillFilters(next);
        renderBusinessDrillBar();
        scheduleBusinessRender();
      });
    });
    if (typeof FloatingFilterBar !== 'undefined' && FloatingFilterBar.render) {
      try { FloatingFilterBar.render(); } catch (_) {}
    }
  }

  function clearBusinessDrillFilters() {
    if (!hasBusinessDrillFilters()) return false;
    BUSINESS_DRILL_STATE.filters = {};
    renderBusinessDrillBar();
    scheduleBusinessRender();
    return true;
  }

  function removeBusinessDrillFilter(key) {
    if (!key) return false;
    var current = getBusinessDrillFilters();
    if (current[key] == null) return false;
    delete current[key];
    BUSINESS_DRILL_STATE.filters = normalizeBusinessDrillFilters(current);
    renderBusinessDrillBar();
    scheduleBusinessRender();
    return true;
  }

  function toggleBusinessDrillFilters(partialFilters) {
    var partial = normalizeBusinessDrillFilters(partialFilters);
    var keys = Object.keys(partial);
    if (!keys.length) return false;

    var current = getBusinessDrillFilters();
    var shouldClear = keys.every(function(key) {
      return String(current[key] || '') === String(partial[key] || '');
    });

    if (shouldClear) {
      keys.forEach(function(key) {
        delete current[key];
      });
    } else {
      keys.forEach(function(key) {
        current[key] = partial[key];
      });
    }

    BUSINESS_DRILL_STATE.filters = normalizeBusinessDrillFilters(current);
    renderBusinessDrillBar();
    scheduleBusinessRender();
    return true;
  }

  function getRawStatus(project) {
    return cleanLabel(project && (project['Statut'] || project['MG Statut Odoo MG']));
  }

  function getRawStatusKey(project) {
    return String(getRawStatus(project) || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
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

  function cloneBusinessEntry(entry) {
    var cloned = {
      label: entry && entry.label != null ? String(entry.label) : '',
      value: Number(entry && entry.value) || 0
    };
    if (entry && entry.values && typeof entry.values === 'object') {
      cloned.values = Object.assign({}, entry.values);
    }
    if (Array.isArray(entry && entry._othersEntries)) {
      cloned._othersEntries = entry._othersEntries.map(cloneBusinessEntry);
    }
    return cloned;
  }

  function registerBusinessChartSummary(id, payload) {
    if (!id) return;
    BUSINESS_CHART_SUMMARIES[id] = Object.assign({ chartId: id }, payload || {});
  }

  function getBusinessChartSummary(id) {
    return id && BUSINESS_CHART_SUMMARIES[id] ? BUSINESS_CHART_SUMMARIES[id] : null;
  }

  function normalizeMonthLabel(value) {
    return String(value == null ? '' : value)
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  function getProjectMonthTokens(project) {
    var dt = getDate(project);
    if (!(dt instanceof Date) || !isFinite(dt.getTime())) return null;
    var month = MONTHS[dt.getMonth()];
    if (!month) return null;
    return {
      month: normalizeMonthLabel(month),
      monthYear: normalizeMonthLabel(month + ' ' + dt.getFullYear())
    };
  }

  function matchesMonthFilter(project, value) {
    var tokens = getProjectMonthTokens(project);
    if (!tokens) return false;
    var target = normalizeMonthLabel(value);
    if (!target) return true;
    return target === tokens.month || target === tokens.monthYear;
  }

  function matchesBusinessStatus(project, value) {
    var target = String(value == null ? '' : value).trim().toLowerCase();
    if (!target) return true;
    if (target === 'won') return isWon(project);
    if (target === 'lost') return isLost(project);
    if (target === 'offer') return isOffer(project);
    if (target === 'decided') return isDecided(project);
    if (target === 'pipe') return isPipeCommercialStatus(project);
    return true;
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

  function resolveBusinessScope(projects, mode) {
    var baseVisible = applyEngineLikeFilters(projects, { respectYear: false, includeEngineFilters: true });
    var explicitYear = explicitSelectedYear();
    var hasExplicitYear = isValidYear(explicitYear);
    var referenceYear = resolveReferenceYear(baseVisible, mode);
    var scopeYear = hasExplicitYear ? explicitYear : referenceYear;
    var scopedYear = applyEngineLikeFilters(baseVisible, { respectYear: true, year: scopeYear, includeEngineFilters: false });
    var scopeProjects = hasExplicitYear ? scopedYear : baseVisible;
    return {
      baseVisible: baseVisible,
      explicitYear: hasExplicitYear ? explicitYear : null,
      referenceYear: referenceYear,
      scopeYear: scopeYear,
      scopedYear: scopedYear,
      scopeProjects: scopeProjects,
      isReferenceYear: !hasExplicitYear
    };
  }

  function describeScopeLabel(scope, timeline) {
    if (timeline && (timeline.start || timeline.end)) return 'Periode filtree';
    if (scope && isValidYear(scope.explicitYear)) return 'Annee commerciale ' + scope.explicitYear;
    if (scope && isValidYear(scope.referenceYear)) return 'Toutes les annees filtrees';
    return 'Perimetre filtre';
  }

  function describeScopeDetail(scope, timeline) {
    var base = describeScopeLabel(scope, timeline);
    return base + ' • ' + filterContextSummary();
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
    var timeline = (typeof window.getActiveTimelineRange === 'function')
      ? window.getActiveTimelineRange()
      : { start: null, end: null, field: 'Date réception' };

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

    if (timeline && (timeline.start || timeline.end) && typeof Analytics !== 'undefined' && typeof Analytics.filterByDateRange === 'function') {
      data = Analytics.filterByDateRange(data, timeline.start, timeline.end, timeline.field || 'Date réception');
    }

    Object.keys(filters).forEach(function(k) {
      var v = filters[k];
      if (v == null) return;
      data = data.filter(function(p) {
        if (k === 'Statut') return getStatus(p) === v || (typeof ProjectUtils !== 'undefined' && ProjectUtils.parseStatusKey && ProjectUtils.parseStatusKey(v) === getStatus(p));
        if (k === '_mois') return matchesMonthFilter(p, v);
        if (k === '_businessStatus') return matchesBusinessStatus(p, v);
        var pv = nv(p[k]);
        return pv != null && pv === v;
      });
    });

    var businessFilters = getBusinessDrillFilters();
    Object.keys(businessFilters).forEach(function(k) {
      var v = businessFilters[k];
      if (v == null) return;
      data = data.filter(function(p) {
        if (k === '_mois') return matchesMonthFilter(p, v);
        if (k === '_businessStatus') return matchesBusinessStatus(p, v);
        var pv = nv(p[k]);
        return pv != null && pv === v;
      });
    });

    return data;
  }

  function isWon(project) { return getStatus(project) === 'obtenu'; }
  function isLost(project) { return getStatus(project) === 'perdu'; }
  function isOffer(project) { return getStatus(project) === 'offre'; }
  function isPipeCommercialStatus(project) {
    var raw = getRawStatusKey(project);
    return raw === 'remis' || raw === 'en etude';
  }
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
        return items.filter(isPipeCommercialStatus).reduce(function(sum, p) { return sum + getBud(p); }, 0);
      case 'pipe_weighted':
        return items.filter(isPipeCommercialStatus).reduce(function(sum, p) { return sum + getWeighted(p); }, 0);
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
    if (mode.indexOf('pipe_') === 0) return items.filter(isPipeCommercialStatus);
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
      compare_status_amount: 'Comparatif €',
      won_rate_amount: 'Taux de transfo €',
      won_count: 'Nb gagnés',
      lost_count: 'Nb perdus',
      decided_count: 'Nb gagnés + perdus',
      compare_status_count: 'Comparatif dossiers',
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
      return view;
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
      var label = accessor(project);
      var key = bucketKey(label);
      if (!buckets[key]) buckets[key] = { label: label, projects: [] };
      buckets[key].projects.push(project);
    });

    var entries = Object.keys(buckets).map(function(key) {
      var bucket = buckets[key];
      return {
        label: bucket.label,
        filters: dimension === 'zone'
          ? { 'Zone Géographique': bucket.label }
          : (dimension === 'client'
              ? { 'Client': bucket.label }
              : { 'Type de projet (Activité)': bucket.label }),
        value: computeValue(bucket.projects, mode),
        projects: bucket.projects
      };
    }).sort(function(a, b) {
      return b.value - a.value;
    });
    return dimension === 'client' ? finalizeTopEntries(entries, limit || 12) : entries.slice(0, limit || 12);
  }

  function finalizeTopEntries(entries, limit) {
    var list = Array.isArray(entries) ? entries.slice() : [];
    var max = Number(limit) || 12;
    if (list.length <= max) return list;
    var top = list.slice(0, max);
    var rest = list.slice(max);
    var othersProjects = [];
    rest.forEach(function(entry) {
      if (Array.isArray(entry.projects)) othersProjects = othersProjects.concat(entry.projects);
    });
    top.push({
      label: 'Autres',
      value: rest.reduce(function(sum, entry) { return sum + (Number(entry.value) || 0); }, 0),
      projects: othersProjects,
      _othersEntries: rest
    });
    return top;
  }

  function createMonthlyEntries(projects, mode, year) {
    var buckets = Array.from({ length: 12 }, function(_, idx) { return { label: MONTHS[idx], value: 0, projects: [] }; });
    projects.filter(function(p) { return !isValidYear(year) || getYear(p) === year; }).forEach(function(project) {
      var dt = getDate(project);
      if (!dt || !isFinite(dt.getMonth())) return;
      var idx = dt.getMonth();
      buckets[idx].projects.push(project);
    });
    buckets.forEach(function(bucket) {
      bucket.value = computeValue(bucket.projects, mode);
      bucket.filters = { _mois: bucket.label };
    });
    return buckets;
  }

  function createTimelineMonthlyEntries(projects, mode, timeline) {
    var now = new Date();
    var start = timeline && timeline.start ? new Date(timeline.start + 'T00:00:00') : null;
    var end = timeline && timeline.end ? new Date(timeline.end + 'T23:59:59') : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    var items = Array.isArray(projects) ? projects : [];

    if (!start || !isFinite(start.getTime()) || !end || !isFinite(end.getTime()) || start > end) {
      return [];
    }

    var monthCursor = new Date(start.getFullYear(), start.getMonth(), 1);
    var monthEnd = new Date(end.getFullYear(), end.getMonth(), 1);
    var spansMultipleYears = monthCursor.getFullYear() !== monthEnd.getFullYear();
    var buckets = [];

    while (monthCursor <= monthEnd) {
      buckets.push({
        year: monthCursor.getFullYear(),
        month: monthCursor.getMonth(),
        label: MONTHS[monthCursor.getMonth()] + (spansMultipleYears ? (' ' + monthCursor.getFullYear()) : ''),
        filters: { _mois: MONTHS[monthCursor.getMonth()] + (spansMultipleYears ? (' ' + monthCursor.getFullYear()) : '') },
        value: 0,
        projects: []
      });
      monthCursor = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1);
    }

    items.forEach(function(project) {
      var dt = getDate(project);
      if (!dt || dt < start || dt > end) return;
      var bucket = buckets.find(function(entry) {
        return entry.year === dt.getFullYear() && entry.month === dt.getMonth();
      });
      if (!bucket) return;
      bucket.projects.push(project);
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
      var key = bucketKey(a) + ' • ' + bucketKey(b);
      if (!map[key]) map[key] = { label: a + ' • ' + b, filters: {}, projects: [] };
      map[key].filters[keyA] = a;
      map[key].filters[keyB] = b;
      map[key].projects.push(project);
    });

    return finalizeTopEntries(Object.keys(map).map(function(key) {
      var item = map[key];
      return {
        label: item.label,
        value: computeValue(item.projects, mode),
        filters: item.filters,
        projects: item.projects
      };
    }).sort(function(a, b) {
      return b.value - a.value;
    }), limit || 12);
  }

  function dimensionValue(project, dimension) {
    if (dimension === 'zone') return project['Zone Géographique'];
    if (dimension === 'client') return project['Client'];
    if (dimension === 'type') return project['Type de projet (Activité)'];
    return '';
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
    var series = comparisonSeriesForMode(mode);
    var relevantProjects = modeScopeProjects(projects, mode);
    var mapped = {};

    relevantProjects.forEach(function(project) {
      var rawLabel = dimensionValue(project, dimension);
      var label = cleanLabel(rawLabel);
      var key = bucketKey(label);
      if (!mapped[key]) {
        mapped[key] = {
          label: label,
          filters: dimension === 'zone'
            ? { 'Zone Géographique': label }
            : (dimension === 'client'
                ? { 'Client': label }
                : { 'Type de projet (Activité)': label }),
          projects: []
        };
      }
      mapped[key].projects.push(project);
    });

    return Object.keys(mapped).map(function(key) {
      var entry = mapped[key];
      var values = {};
      series.forEach(function(serie) {
        values[serie.key] = computeValue(entry.projects, serie.key);
      });
      return {
        label: entry.label,
        filters: entry.filters,
        values: values,
        projects: entry.projects
      };
    }).filter(function(entry) {
      return series.some(function(serie) { return entry.values[serie.key] > 0; });
    }).sort(function(a, b) {
      var totalA = series.reduce(function(sum, serie) { return sum + (Number(a.values[serie.key]) || 0); }, 0);
      var totalB = series.reduce(function(sum, serie) { return sum + (Number(b.values[serie.key]) || 0); }, 0);
      return totalB - totalA;
    }).slice(0, limit || 10);
  }

  function createComparisonMonthlyEntries(projects, mode, year) {
    var series = comparisonSeriesForMode(mode);
    return Array.from({ length: 12 }, function(_, idx) {
      var bucketProjects = [];
      projects.filter(function(p) { return !isValidYear(year) || getYear(p) === year; }).forEach(function(project) {
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
        filters: { _mois: MONTHS[idx] },
        values: values,
        projects: bucketProjects
      };
    }).filter(function(entry) {
      return series.some(function(serie) { return entry.values[serie.key] > 0; });
    });
  }

  function createComparisonTimelineMonthlyEntries(projects, mode, timeline) {
    var series = comparisonSeriesForMode(mode);
    var base = createTimelineMonthlyEntries(projects, series[0] ? series[0].key : mode, timeline);
    return base.map(function(bucket) {
      var values = {};
      series.forEach(function(serie) {
        values[serie.key] = computeValue(bucket.projects, serie.key);
      });
      return {
        label: bucket.label,
        filters: bucket.filters,
        values: values,
        projects: bucket.projects
      };
    }).filter(function(entry) {
      return series.some(function(serie) { return entry.values[serie.key] > 0; });
    });
  }

  function createComparisonComboEntries(projects, keyA, keyB, mode, limit) {
    var series = comparisonSeriesForMode(mode);
    var relevantProjects = modeScopeProjects(projects, mode);
    var mapped = {};

    relevantProjects.forEach(function(project) {
      var a = cleanLabel(project[keyA]);
      var b = cleanLabel(project[keyB]);
      var key = bucketKey(a) + ' • ' + bucketKey(b);
      if (!mapped[key]) {
        mapped[key] = {
          label: a + ' • ' + b,
          filters: {},
          projects: []
        };
        mapped[key].filters[keyA] = a;
        mapped[key].filters[keyB] = b;
      }
      mapped[key].projects.push(project);
    });

    return Object.keys(mapped).map(function(key) {
      var entry = mapped[key];
      var values = {};
      series.forEach(function(serie) {
        values[serie.key] = computeValue(entry.projects, serie.key);
      });
      return {
        label: entry.label,
        filters: entry.filters,
        values: values,
        projects: entry.projects
      };
    }).filter(function(entry) {
      return series.some(function(serie) { return entry.values[serie.key] > 0; });
    }).sort(function(a, b) {
      var totalA = series.reduce(function(sum, serie) { return sum + (Number(a.values[serie.key]) || 0); }, 0);
      var totalB = series.reduce(function(sum, serie) { return sum + (Number(b.values[serie.key]) || 0); }, 0);
      return totalB - totalA;
    }).slice(0, limit || 12);
  }

  function paletteFor(mode, count, entries) {
    var defaultPalette = [
      'rgba(37,99,235,.88)',
      'rgba(249,115,22,.88)',
      'rgba(16,185,129,.88)',
      'rgba(225,29,72,.88)',
      'rgba(168,85,247,.88)',
      'rgba(234,179,8,.88)',
      'rgba(20,184,166,.88)',
      'rgba(239,68,68,.88)',
      'rgba(14,165,233,.88)',
      'rgba(132,204,22,.88)'
    ];
    var pipePalette = [
      'rgba(0,102,204,.96)',
      'rgba(230,81,0,.96)',
      'rgba(0,153,102,.96)',
      'rgba(200,30,80,.96)',
      'rgba(107,70,193,.96)',
      'rgba(191,144,0,.96)',
      'rgba(0,151,167,.96)',
      'rgba(149,56,54,.96)',
      'rgba(82,109,130,.96)',
      'rgba(46,125,50,.96)'
    ];
    var palette = mode.indexOf('pipe_') === 0 ? pipePalette : defaultPalette;
    function hashLabel(value) {
      var key = bucketKey(value);
      var hash = 0;
      for (var i = 0; i < key.length; i++) hash = ((hash << 5) - hash) + key.charCodeAt(i);
      return Math.abs(hash);
    }
    var arr = [];
    for (var i = 0; i < count; i++) {
      var entry = Array.isArray(entries) ? entries[i] : null;
      if (entry && entry.label === 'Autres') {
        arr.push('rgba(148,163,184,.82)');
      } else {
        arr.push(palette[hashLabel(entry && entry.label ? entry.label : String(i)) % palette.length]);
      }
    }
    return arr;
  }

  function toPercentString(value) {
    return ((Number(value) || 0) * 100).toFixed(1).replace('.', ',') + ' %';
  }

  function filterContextSummary() {
    var yearEl = document.getElementById('year-filter');
    var dateFieldEl = document.getElementById('date-field-selector');
    var timelineEl = document.getElementById('timeline-preset');
    var energyEl = document.getElementById('energy-type-filter');
    var parts = [];
    if (yearEl && yearEl.value) parts.push('Année ' + yearEl.value);
    else parts.push('Toutes années');
    if (dateFieldEl) parts.push(dateFieldEl.options[dateFieldEl.selectedIndex] ? dateFieldEl.options[dateFieldEl.selectedIndex].text : 'Date réception');
    if (timelineEl && timelineEl.value) parts.push(timelineEl.options[timelineEl.selectedIndex] ? timelineEl.options[timelineEl.selectedIndex].text : 'Période');
    if (energyEl && energyEl.value) parts.push(energyEl.options[energyEl.selectedIndex] ? energyEl.options[energyEl.selectedIndex].text : 'Tous types');
    return parts.join(' • ');
  }

  function wrapCategoryLabel(value) {
    var text = String(value == null ? '' : value).trim();
    if (text.length <= 20) return text;
    var words = text.split(/\s+/);
    if (words.length === 1) return text.slice(0, 18) + '…';
    var lines = [''];
    words.forEach(function(word) {
      var last = lines[lines.length - 1];
      if (!last.length) {
        lines[lines.length - 1] = word;
        return;
      }
      if ((last + ' ' + word).length <= 18 && lines.length < 3) {
        lines[lines.length - 1] = last + ' ' + word;
      } else if (lines.length < 3) {
        lines.push(word);
      } else {
        lines[lines.length - 1] = lines[lines.length - 1].slice(0, 16) + '…';
      }
    });
    return lines;
  }

  function tooltipFormatter(mode, entries) {
    return {
      title: function(items) {
        if (!items || !items.length) return '';
        var idx = items[0].dataIndex;
        var entry = entries && entries[idx];
        return entry && entry.label ? entry.label : items[0].label;
      },
      label: function(context) {
        return formatValue(context.raw, mode);
      },
      afterLabel: function(context) {
        var idx = context.dataIndex;
        var entry = entries && entries[idx];
        if (!entry) return '';
        var count = Array.isArray(entry.projects) ? entry.projects.length : 0;
        return count ? ('Dossiers : ' + count) : '';
      },
      footer: function(items) {
        if (!items || !items.length || !entries) return '';
        var idx = items[0].dataIndex;
        var entry = entries[idx];
        if (!entry) return filterContextSummary();
        var total = entries.reduce(function(sum, current) { return sum + (Number(current.value) || 0); }, 0);
        if (total > 0 && mode !== 'won_rate_amount' && mode !== 'won_rate_count' && mode !== 'pipe_ratio') {
          return 'Part du total : ' + toPercentString((Number(entry.value) || 0) / total) + '\n' + filterContextSummary();
        }
        return filterContextSummary();
      }
    };
  }

  function comparisonTooltipFormatter(mode, entries) {
    return {
      title: function(items) {
        if (!items || !items.length) return '';
        var idx = items[0].dataIndex;
        var entry = entries && entries[idx];
        return entry && entry.label ? entry.label : items[0].label;
      },
      label: function(context) {
        var seriesMode = context.dataset && context.dataset._seriesMode ? context.dataset._seriesMode : mode;
        return context.dataset.label + ' : ' + formatValue(context.raw, seriesMode);
      },
      afterLabel: function(context) {
        var idx = context.dataIndex;
        var datasetIndex = context.datasetIndex;
        var entry = entries && entries[idx];
        if (!entry) return '';
        var projects = entry.projects || [];
        var count = projects.length;
        if (typeof datasetIndex === 'number' && context.dataset && context.dataset._seriesMode) {
          var seriesMode = context.dataset._seriesMode;
          if (seriesMode === 'won_amount' || seriesMode === 'won_count') count = projects.filter(isWon).length;
          if (seriesMode === 'lost_amount' || seriesMode === 'lost_count') count = projects.filter(isLost).length;
          if (seriesMode === 'pipe_bud' || seriesMode === 'offer_count') count = projects.filter(isOffer).length;
        }
        return count ? ('Dossiers : ' + count) : '';
      },
      footer: function() {
        return filterContextSummary();
      }
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

  function openInlinePanelInFullPage(chartId) {
    var state = INLINE_DRILL_STATE[chartId];
    if (!state || !state.allProjects || !state.allProjects.length) return;

    var panel = getInlinePanel(chartId);
    if (!panel || !panel.classList.contains('is-open') || !panel._businessDrillState) {
      renderInlineDetails(chartId, state.allProjects, state.title);
      panel = getInlinePanel(chartId);
    }

    var payload = buildInlineTablePayload(panel, state.title);
    if (payload) openTablePage(payload);
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
      '<button type="button" class="business-drill-btn business-drill-btn-secondary" data-role="hide">Masquer les données</button>' +
      '<button type="button" class="business-drill-btn business-drill-btn-tertiary" data-role="open-page">↗ Ouvrir en pleine page</button>';
    card.appendChild(actions);

    actions.querySelector('[data-role="show-all"]').addEventListener('click', function() {
      var state = INLINE_DRILL_STATE[chartId];
      if (!state) return;
      openDetails(state.allProjects, state.title, { chartId: chartId, useInline: true });
    });
    actions.querySelector('[data-role="hide"]').addEventListener('click', function() {
      closeInlineDetails(chartId);
    });
    actions.querySelector('[data-role="open-page"]').addEventListener('click', function() {
      openInlinePanelInFullPage(chartId);
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

  function getOthersPanel(chartId) {
    var card = getInlineCard(chartId);
    if (!card) return null;
    var panel = card.querySelector('.business-others-panel');
    if (panel) return panel;

    panel = document.createElement('div');
    panel.className = 'business-others-panel';
    card.appendChild(panel);
    return panel;
  }

  function closeOthersPanel(chartId) {
    var panel = getOthersPanel(chartId);
    if (!panel) return;
    panel.classList.remove('is-open');
    panel.innerHTML = '';
    panel._businessOthersState = null;
  }

  function bindOthersPanel(chartId, panel, title, mode) {
    if (!panel || panel._businessOthersBound) return;
    panel._businessOthersBound = true;
    panel.addEventListener('click', function(event) {
      var closeBtn = event.target.closest('[data-role="close-others"]');
      if (closeBtn) {
        closeOthersPanel(chartId);
        return;
      }
      var rowBtn = event.target.closest('[data-role="open-other-entry"]');
      if (!rowBtn || !panel._businessOthersState) return;
      var idx = parseInt(rowBtn.getAttribute('data-entry-index') || '-1', 10);
      var entry = panel._businessOthersState.entries[idx];
      if (!entry) return;
      applyDashboardSelection(entry.projects || [], title + ' — ' + entry.label, { chartId: chartId, useInline: true });
    });
  }

  function renderOthersPanel(chartId, title, mode, aggregateEntry) {
    var panel = getOthersPanel(chartId);
    if (!panel) return;

    var hiddenEntries = Array.isArray(aggregateEntry && aggregateEntry._othersEntries)
      ? aggregateEntry._othersEntries.slice()
      : [];

    if (!hiddenEntries.length) {
      closeOthersPanel(chartId);
      return;
    }

    panel._businessOthersState = {
      title: title,
      mode: mode,
      entries: hiddenEntries
    };

    panel.innerHTML =
      '<div class="business-others-head">' +
        '<div>' +
          '<div class="business-others-title">Autres valeurs masquees</div>' +
          '<div class="business-others-subtitle">' + escapeHtml(title) + '</div>' +
        '</div>' +
        '<button type="button" class="business-drill-btn business-drill-btn-secondary" data-role="close-others">Masquer</button>' +
      '</div>' +
      '<div class="business-others-list">' +
        hiddenEntries.map(function(entry, index) {
          var count = Array.isArray(entry.projects) ? entry.projects.length : 0;
          return (
            '<button type="button" class="business-others-item" data-role="open-other-entry" data-entry-index="' + index + '">' +
              '<span class="business-others-item-main">' +
                '<span class="business-others-item-label">' + escapeHtml(entry.label) + '</span>' +
                '<span class="business-others-item-meta">' + escapeHtml(String(count)) + ' projet' + (count > 1 ? 's' : '') + '</span>' +
              '</span>' +
              '<span class="business-others-item-value">' + escapeHtml(formatValue(entry.value, mode)) + '</span>' +
            '</button>'
          );
        }).join('') +
      '</div>';

    bindOthersPanel(chartId, panel, title, mode);
    panel.classList.add('is-open');
  }

  function toggleOthersPanel(chartId, title, mode, aggregateEntry) {
    var panel = getOthersPanel(chartId);
    var current = panel && panel._businessOthersState;
    var sameGroup = !!(current && current.title === title);
    if (panel && panel.classList.contains('is-open') && sameGroup) {
      closeOthersPanel(chartId);
      return;
    }
    renderOthersPanel(chartId, title, mode, aggregateEntry);
  }

  var BUSINESS_DRILL_COLUMNS = [
    { key: 'date', label: 'Date', width: '110px', align: 'left', filterType: 'text' },
    { key: 'client', label: 'Client', width: '170px', align: 'left', filterType: 'text' },
    { key: 'project', label: 'Projet', width: '320px', align: 'left', filterType: 'text' },
    { key: 'zone', label: 'Zone', width: '140px', align: 'left', filterType: 'select' },
    { key: 'type', label: 'Type', width: '160px', align: 'left', filterType: 'select' },
    { key: 'rawStatus', label: 'Statut source', width: '150px', align: 'left', filterType: 'select' },
    { key: 'status', label: 'Statut normalise', width: '145px', align: 'left', filterType: 'select' },
    { key: 'bud', label: 'Bud', width: '120px', align: 'right', filterType: 'text' },
    { key: 'weighted', label: 'CA win proba', width: '140px', align: 'right', filterType: 'text' }
  ];

  function normalizeInlineDrillRows(projects) {
    return (Array.isArray(projects) ? projects : []).map(function(project, index) {
      var rawDate = getDate(project);
      var dateLabel = formatDateLabel(project);
      var client = cleanLabel(project['Client']);
      var projectName = cleanLabel(project['Dénomination'] || project['Denomination'] || '?');
      var zone = cleanLabel(project['Zone Géographique']);
      var type = cleanLabel(project['Type de projet (Activité)']);
      var rawStatus = cleanLabel(getRawStatus(project));
      var status = cleanLabel(getStatus(project));
      var budValue = getBud(project);
      var weightedValue = getWeighted(project);
      return {
        id: index + '-' + client + '-' + projectName,
        date: { display: dateLabel, sort: rawDate && isFinite(rawDate.getTime()) ? rawDate.getTime() : dateLabel, filter: bucketKey(dateLabel) },
        client: { display: client, sort: bucketKey(client), filter: bucketKey(client) },
        project: { display: projectName, sort: bucketKey(projectName), filter: bucketKey(projectName) },
        zone: { display: zone, sort: bucketKey(zone), filter: bucketKey(zone) },
        type: { display: type, sort: bucketKey(type), filter: bucketKey(type) },
        rawStatus: { display: rawStatus, sort: bucketKey(rawStatus), filter: bucketKey(rawStatus) },
        status: { display: status, sort: bucketKey(status), filter: bucketKey(status) },
        bud: { display: formatValue(budValue, 'won_amount'), sort: budValue, filter: bucketKey(formatValue(budValue, 'won_amount')) },
        weighted: { display: formatValue(weightedValue, 'pipe_weighted'), sort: weightedValue, filter: bucketKey(formatValue(weightedValue, 'pipe_weighted')) }
      };
    });
  }

  function getBusinessDrillFilterOptions(rows, key) {
    return rows
      .map(function(row) { return row && row[key] ? row[key].display : ''; })
      .filter(Boolean)
      .filter(function(value, index, arr) { return arr.indexOf(value) === index; })
      .sort(function(a, b) { return String(a).localeCompare(String(b), 'fr'); });
  }

  function renderBusinessDrillTable(panel) {
    var state = panel && panel._businessDrillState;
    if (!panel || !state) return;

    var search = filterKey(state.query || '');
    var filtered = state.rows.filter(function(row) {
      var searchMatch = !search || BUSINESS_DRILL_COLUMNS.some(function(col) {
        return bucketKey(row[col.key].display || '').indexOf(search) !== -1;
      });
      if (!searchMatch) return false;
      return BUSINESS_DRILL_COLUMNS.every(function(col) {
        var filterValue = filterKey(state.filters[col.key] || '');
        if (!filterValue) return true;
        return String(row[col.key].filter || '').indexOf(filterValue) !== -1;
      });
    });

    filtered.sort(function(a, b) {
      var key = state.sortKey || 'date';
      var av = a[key] ? a[key].sort : '';
      var bv = b[key] ? b[key].sort : '';
      if (typeof av === 'string') av = av.toLowerCase();
      if (typeof bv === 'string') bv = bv.toLowerCase();
      if (av < bv) return state.sortAsc ? -1 : 1;
      if (av > bv) return state.sortAsc ? 1 : -1;
      return 0;
    });

    state.filteredRows = filtered;

    var resultsMeta = panel.querySelector('[data-role="results-count"]');
    if (resultsMeta) {
      resultsMeta.textContent = filtered.length + ' ligne' + (filtered.length > 1 ? 's' : '') + ' affichee' + (filtered.length > 1 ? 's' : '');
    }
    var titleMeta = panel.querySelector('[data-role="project-total"]');
    if (titleMeta) {
      titleMeta.textContent = filtered.length + ' / ' + state.rows.length + ' projet' + (state.rows.length > 1 ? 's' : '');
    }

    var thead = panel.querySelector('.business-drill-table thead');
    var tbody = panel.querySelector('.business-drill-table tbody');
    if (!thead || !tbody) return;

    thead.innerHTML =
      '<tr>' +
      BUSINESS_DRILL_COLUMNS.map(function(col) {
        var sorted = state.sortKey === col.key;
        var arrow = sorted ? (state.sortAsc ? '▲' : '▼') : '↕';
        return '<th data-sort-key="' + col.key + '" class="' + (sorted ? 'is-sorted' : '') + '" style="width:' + col.width + ';min-width:' + col.width + ';text-align:' + col.align + ';">' +
          escapeHtml(col.label) + ' <span class="business-drill-sort">' + arrow + '</span></th>';
      }).join('') +
      '</tr>' +
      '<tr class="business-drill-filter-row">' +
      BUSINESS_DRILL_COLUMNS.map(function(col) {
        var current = state.filters[col.key] || '';
        if (col.filterType === 'select') {
          var opts = ['<option value="">Tous</option>'].concat(
            getBusinessDrillFilterOptions(state.rows, col.key).map(function(option) {
              var selected = option === current ? ' selected' : '';
              return '<option value="' + escapeHtml(option) + '"' + selected + '>' + escapeHtml(option) + '</option>';
            })
          ).join('');
          return '<th style="width:' + col.width + ';min-width:' + col.width + ';"><select class="business-drill-filter" data-filter-key="' + col.key + '">' + opts + '</select></th>';
        }
        return '<th style="width:' + col.width + ';min-width:' + col.width + ';"><input class="business-drill-filter" data-filter-key="' + col.key + '" type="text" placeholder="Filtrer" value="' + escapeHtml(current) + '"></th>';
      }).join('') +
      '</tr>';

    tbody.innerHTML = filtered.length
      ? filtered.map(function(row) {
          return '<tr>' +
            BUSINESS_DRILL_COLUMNS.map(function(col) {
              var value = row[col.key].display || '—';
              var cls = col.align === 'right' ? ' class="is-numeric"' : '';
              return '<td' + cls + ' title="' + escapeHtml(String(value)) + '" style="width:' + col.width + ';min-width:' + col.width + ';text-align:' + col.align + ';">' + escapeHtml(String(value)) + '</td>';
            }).join('') +
          '</tr>';
        }).join('')
      : '<tr><td colspan="' + BUSINESS_DRILL_COLUMNS.length + '" class="business-drill-empty">Aucune ligne ne correspond aux filtres en cours.</td></tr>';
  }

  function bindBusinessDrillTable(panel) {
    if (!panel || panel._businessDrillBound) return;
    panel._businessDrillBound = true;

    panel.addEventListener('click', function(event) {
      var resetBtn = event.target.closest('[data-role="reset-filters"]');
      if (resetBtn) {
        var state = panel._businessDrillState;
        if (!state) return;
        state.query = '';
        state.filters = {};
        var searchInput = panel.querySelector('.business-drill-search');
        if (searchInput) searchInput.value = '';
        renderBusinessDrillTable(panel);
        return;
      }
      var openPageBtn = event.target.closest('[data-role="open-page-inline"]');
      if (openPageBtn) {
        var currentState = panel._businessDrillState;
        if (!currentState) return;
        var chartCard = panel.closest('.chart-card');
        var chartId = chartCard ? chartCard.getAttribute('data-chart-id') : '';
        if (!chartId) return;
        openInlinePanelInFullPage(chartId);
        return;
      }
      var th = event.target.closest('th[data-sort-key]');
      if (!th) return;
      var currentState = panel._businessDrillState;
      if (!currentState) return;
      var nextKey = th.getAttribute('data-sort-key');
      currentState.sortAsc = currentState.sortKey === nextKey ? !currentState.sortAsc : true;
      currentState.sortKey = nextKey;
      renderBusinessDrillTable(panel);
    });

    panel.addEventListener('input', function(event) {
      var state = panel._businessDrillState;
      if (!state) return;
      var searchInput = event.target.closest('.business-drill-search');
      if (searchInput) {
        state.query = searchInput.value || '';
        renderBusinessDrillTable(panel);
        return;
      }
      var filterInput = event.target.closest('.business-drill-filter');
      if (filterInput && filterInput.tagName === 'INPUT') {
        state.filters[filterInput.getAttribute('data-filter-key')] = filterInput.value || '';
        renderBusinessDrillTable(panel);
      }
    });

    panel.addEventListener('change', function(event) {
      var filterInput = event.target.closest('.business-drill-filter');
      var state = panel._businessDrillState;
      if (!state || !filterInput) return;
      state.filters[filterInput.getAttribute('data-filter-key')] = filterInput.value || '';
      renderBusinessDrillTable(panel);
    });
  }

  function buildInlineTablePayload(panel, title) {
    var state = panel && panel._businessDrillState;
    if (!state) return null;
    var rowSource = Array.isArray(state.filteredRows) ? state.filteredRows : (state.rows || []);
    var rows = rowSource.map(function(row) {
      return BUSINESS_DRILL_COLUMNS.map(function(col) {
        return row[col.key] ? String(row[col.key].display || '—') : '—';
      });
    });
    return {
      title: title,
      subtitle: 'Détail complet du graphique',
      headers: BUSINESS_DRILL_COLUMNS.map(function(col) { return col.label; }),
      rows: rows,
      meta: Array.from(panel.querySelectorAll('.business-drill-pill')).map(function(pill) {
        return pill.textContent.replace(/\s+/g, ' ').trim();
      }).filter(Boolean)
    };
  }

  function buildProjectTableView(projects, title, subtitle, meta, selectorLabel) {
    var rows = normalizeInlineDrillRows(uniqueProjects(projects || []));
    return {
      id: bucketKey(selectorLabel || title || ('view-' + Date.now())),
      selectorLabel: selectorLabel || title,
      title: title,
      subtitle: subtitle || 'Détail KPI',
      headers: BUSINESS_DRILL_COLUMNS.map(function(col) { return col.label; }),
      rows: rows.map(function(row) {
        return BUSINESS_DRILL_COLUMNS.map(function(col) {
          return row[col.key] ? String(row[col.key].display || '—') : '—';
        });
      }),
      meta: Array.isArray(meta) ? meta.slice() : []
    };
  }

  function openKpiTablePage(config) {
    if (!config || !Array.isArray(config.views) || !config.views.length) return;
    openTablePage({
      title: config.title || 'Tableau KPI',
      subtitle: config.subtitle || 'Sélectionnez une vue KPI pour afficher le tableau correspondant',
      meta: Array.isArray(config.meta) ? config.meta.slice() : [],
      views: config.views,
      selectedViewId: config.selectedViewId || config.views[0].id
    });
  }

  function renderInlineDetails(chartId, projects, title) {
    var panel = getInlinePanel(chartId);
    if (!panel) return;

    var rows = uniqueProjects(projects);
    var totalBud = rows.reduce(function(sum, project) { return sum + getBud(project); }, 0);
    var totalWeighted = rows.reduce(function(sum, project) { return sum + getWeighted(project); }, 0);

    panel._businessDrillState = {
      rows: normalizeInlineDrillRows(rows),
      filteredRows: [],
      sortKey: 'date',
      sortAsc: false,
      query: '',
      filters: {}
    };

    panel.innerHTML =
      '<div class="business-drill-head">' +
        '<div class="business-drill-title">' + escapeHtml(title) + '</div>' +
        '<div class="business-drill-meta">' +
          '<span class="business-drill-pill" data-role="project-total">' + escapeHtml(String(rows.length)) + ' projet' + (rows.length > 1 ? 's' : '') + '</span>' +
          '<span class="business-drill-pill">Bud ' + escapeHtml(formatValue(totalBud, 'won_amount')) + '</span>' +
          '<span class="business-drill-pill">CA win proba ' + escapeHtml(formatValue(totalWeighted, 'pipe_weighted')) + '</span>' +
          '<span class="business-drill-pill business-drill-pill-muted" data-role="results-count">' + escapeHtml(String(rows.length)) + ' lignes affichees</span>' +
        '</div>' +
      '</div>' +
      '<div class="business-drill-toolbar">' +
        '<input class="business-drill-search" type="text" placeholder="Rechercher dans toutes les colonnes...">' +
        '<button type="button" class="business-drill-btn business-drill-btn-secondary" data-role="reset-filters">Reinitialiser filtres</button>' +
        '<button type="button" class="business-drill-btn business-drill-btn-tertiary" data-role="open-page-inline">↗ Ouvrir en pleine page</button>' +
      '</div>' +
      '<div class="business-drill-wrap">' +
        '<table class="business-drill-table">' +
          '<thead></thead>' +
          '<tbody></tbody>' +
        '</table>' +
      '</div>';

    bindBusinessDrillTable(panel);
    renderBusinessDrillTable(panel);

    panel.classList.add('is-open');
    var globalSection = document.getElementById('detail-section');
    if (globalSection) globalSection.classList.remove('active');

    var actions = getInlineActions(chartId);
    if (actions) {
      var showAllBtn = actions.querySelector('[data-role="show-all"]');
      var hideBtn = actions.querySelector('[data-role="hide"]');
      var openPageBtn = actions.querySelector('[data-role="open-page"]');
      if (showAllBtn) showAllBtn.classList.add('is-active');
      if (hideBtn) {
        hideBtn.disabled = false;
        hideBtn.classList.add('is-active');
      }
      if (openPageBtn) openPageBtn.disabled = !rows.length;
    }
  }

  function closeInlineDetails(chartId) {
    var panel = getInlinePanel(chartId);
    if (!panel) return;
    panel.classList.remove('is-open');
    panel.innerHTML = '';
    var actions = getInlineActions(chartId);
    if (actions) {
      var showAllBtn = actions.querySelector('[data-role="show-all"]');
      var hideBtn = actions.querySelector('[data-role="hide"]');
      if (showAllBtn) showAllBtn.classList.remove('is-active');
      if (hideBtn) hideBtn.disabled = true;
      if (hideBtn) hideBtn.classList.remove('is-active');
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
    closeOthersPanel(chartId);

    var showAllBtn = actions.querySelector('[data-role="show-all"]');
    var hideBtn = actions.querySelector('[data-role="hide"]');
    if (showAllBtn) {
      showAllBtn.disabled = !allProjects.length;
      showAllBtn.textContent = allProjects.length
        ? 'Voir toutes les données du graphique'
        : 'Aucune donnée sur ce graphique';
      showAllBtn.classList.remove('is-active');
    }
    if (hideBtn) {
      hideBtn.disabled = !panel.classList.contains('is-open');
      hideBtn.classList.remove('is-active');
    }
    var openPageBtn = actions.querySelector('[data-role="open-page"]');
    if (openPageBtn) {
      openPageBtn.disabled = !allProjects.length;
    }
  }

  function openDetails(projects, title, options) {
    options = options || {};
    var rows = Array.isArray(projects) ? projects.slice() : [];
    if (options.useInline && options.chartId) {
      renderInlineDetails(options.chartId, rows, title);
      if (options.openInPage) {
        var inlinePanel = getInlinePanel(options.chartId);
        var payload = buildInlineTablePayload(inlinePanel, title);
        if (payload) openTablePage(payload);
      }
      var actions = getInlineActions(options.chartId);
      if (actions) {
        var hideBtn = actions.querySelector('[data-role="hide"]');
        if (hideBtn) {
          hideBtn.disabled = false;
          hideBtn.classList.add('is-active');
        }
      }
      return;
    }
    if (typeof showDetailTable === 'function') {
      showDetailTable(rows, title);
      return;
    }
    console.warn('[BusinessDashboard] showDetailTable indisponible pour', title);
  }

  function applyDashboardSelection(projects, title, fallbackOptions) {
    if (typeof AE !== 'undefined' && typeof AE.setSelection === 'function') {
      AE.setSelection(projects, title);
      return true;
    }
    openDetails(projects, title, fallbackOptions || {});
    return false;
  }

  function comparisonStatusFilter(serieKey) {
    if (serieKey === 'won_amount' || serieKey === 'won_count') return 'won';
    if (serieKey === 'lost_amount' || serieKey === 'lost_count') return 'lost';
    if (serieKey === 'offer_count' || serieKey === 'pipe_bud') return 'offer';
    return '';
  }

  function renderKpi(id, label, value, sub, projects, title, mode, options) {
    options = options || {};
    var el = document.getElementById(id);
    if (!el) return;
    el.innerHTML =
      '<span class="business-kpi-label">' + label + '</span>' +
      '<span class="business-kpi-value">' + formatValue(value, mode) + '</span>' +
      '<span class="business-kpi-sub">' + sub + '</span>';
    el.onclick = function() {
      if (options.tablePageConfig) {
        openKpiTablePage(options.tablePageConfig);
        return;
      }
      openDetails(projects, title);
    };
  }

  function createChart(id, title, entries, mode, opts) {
    opts = opts || {};
    registerBusinessChartSummary(id, {
      kind: 'single',
      title: title,
      mode: mode,
      entries: (entries || []).map(cloneBusinessEntry)
    });
    var labels = entries.map(function(e) { return e.label; });
    var values = entries.map(function(e) { return e.value; });
    var minBarLength = Number(opts.minBarLength || 0);
    var chartValues = values.map(function(value) {
      var numeric = Number(value);
      if (!isFinite(numeric)) return null;
      if (minBarLength > 0 && numeric <= 0) return null;
      return numeric;
    });
    var colors = paletteFor(mode, values.length, entries);
    var chartType = opts.type || ((opts.indexAxis === 'y') ? 'bar' : ((mode === 'won_rate_amount' || mode === 'won_rate_count' || mode === 'pipe_ratio') && !opts.forceBar ? 'line' : 'bar'));
    var primaryColor = colors[0] || 'rgba(0,212,170,.82)';
    var dataset = {
      label: title,
      data: chartValues,
      borderWidth: chartType === 'line' ? 3 : 1,
      maxBarThickness: opts.maxBarThickness || 28,
      minBarLength: minBarLength
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
      return wrapCategoryLabel(raw);
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
            callbacks: tooltipFormatter(mode, entries)
          }
        },
        onClick: function(_, elements) {
          if (!elements || !elements.length) return;
          var idx = elements[0].index;
          var entry = entries[idx];
          if (!entry) return;
          if (Array.isArray(entry._othersEntries) && entry._othersEntries.length) {
            toggleOthersPanel(id, title, mode, entry);
            return;
          }
          closeOthersPanel(id);
          if (!toggleBusinessDrillFilters(entry.filters || {})) {
            applyDashboardSelection(entry.projects || [], title + ' — ' + entry.label, { chartId: id, useInline: true });
          }
        }
      }
    });
    syncInlineDrilldown(id, title, entries);
  }

  function createComparisonChart(id, title, entries, mode, opts) {
    opts = opts || {};
    var series = comparisonSeriesForMode(mode);
    var minBarLength = Number(opts.minBarLength || 0);
    registerBusinessChartSummary(id, {
      kind: 'comparison',
      title: title,
      mode: mode,
      series: series.map(function(serie) {
        return { key: serie.key, label: serie.label };
      }),
      entries: (entries || []).map(cloneBusinessEntry)
    });
    var labels = entries.map(function(e) { return e.label; });
    var isHorizontal = opts.indexAxis === 'y';
    var modeForTicks = mode === 'compare_status_count' ? 'won_count' : 'won_amount';

    var numericTicks = function(value) {
      return formatValue(Number(value) || 0, modeForTicks);
    };
    var categoryTicks = function(value) {
      var idx = typeof value === 'number' ? value : parseInt(value, 10);
      var raw = isFinite(idx) && labels[idx] != null ? labels[idx] : value;
      return wrapCategoryLabel(raw);
    };

    CM.create(id, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: series.map(function(serie) {
          var seriesData = entries.map(function(entry) {
            var numeric = Number(entry.values[serie.key] || 0);
            if (!isFinite(numeric)) return null;
            if (minBarLength > 0 && numeric <= 0) return null;
            return numeric;
          });
          return {
            label: serie.label,
            data: seriesData,
            backgroundColor: serie.color,
            borderColor: serie.border,
            borderWidth: 1,
            borderRadius: isHorizontal ? 8 : 10,
            maxBarThickness: opts.maxBarThickness || 22,
            minBarLength: minBarLength,
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
            labels: { color: '#dce8f5', boxWidth: 10, boxHeight: 10, padding: 12 }
          },
          tooltip: {
            displayColors: true,
            callbacks: comparisonTooltipFormatter(mode, entries)
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
          var nextFilters = Object.assign({}, entry.filters || {});
          var statusFilter = comparisonStatusFilter(serie.key);
          if (statusFilter) nextFilters._businessStatus = statusFilter;
          if (!toggleBusinessDrillFilters(nextFilters)) {
            applyDashboardSelection(filteredProjects, title + ' — ' + entry.label + ' — ' + serie.label, { chartId: id, useInline: true });
          }
        }
      }
    });
    syncInlineDrilldown(id, title, entries);
  }

  function updateTitles(prefix, mode) {
    var label = modeLabel(mode);
    var mappings = {
      month: 'par mois',
      zone: 'par zone géographique',
      client: 'par client',
      type: 'par type de projet',
      'zone-client': 'par zone × client',
      'client-type': 'par client × type de projet'
    };

    Object.keys(mappings).forEach(function(key) {
      var el = document.getElementById(prefix + key);
      if (el) el.textContent = label + ' ' + mappings[key];
    });
  }

  function renderPerformance(rawFiltered, rawAll) {
    var view = (document.getElementById('biz-performance-view') || {}).value || 'won_amount';
    var comboScope = (document.getElementById('biz-performance-combo-scope') || {}).value || 'block';
    var statusFilter = (document.getElementById('biz-performance-status-filter') || {}).value || 'all';
    var metricFamily = performanceMetricFamily(view);
    var isCountFamily = metricFamily === 'count';
    var displayMode = resolvePerformanceDisplayMode(view, statusFilter);
    var scope = resolveBusinessScope(rawAll, displayMode);
    var baseVisible = scope.baseVisible;
    var filteredYear = scope.scopedYear;
    var scopeProjects = scope.scopeProjects;
    var filteredAll = baseVisible.slice();
    var timeline = (typeof window.getActiveTimelineRange === 'function')
      ? window.getActiveTimelineRange()
      : { start: null, end: null, field: 'Date réception' };
    var hasTimeline = !!(timeline && (timeline.start || timeline.end));
    var scopeLabel = describeScopeLabel(scope, timeline);
    var monthlyBase = hasTimeline
      ? (scope.explicitYear ? filteredYear : baseVisible)
      : scopeProjects;
    var monthlyEntries = hasTimeline
      ? createTimelineMonthlyEntries(monthlyBase, displayMode, timeline)
      : createMonthlyEntries(scopeProjects, displayMode, scope.explicitYear);
    var comparisonMonthlyEntries = hasTimeline
      ? createComparisonTimelineMonthlyEntries(monthlyBase, displayMode, timeline)
      : createComparisonMonthlyEntries(scopeProjects, displayMode, scope.explicitYear);

    updateTitles('biz-title-perf-', displayMode);
    var monthHint = document.getElementById('biz-hint-perf-month');
    if (monthHint) {
      monthHint.textContent = hasTimeline
        ? ('Periode active ' + (timeline.start || 'debut') + ' → ' + (timeline.end || 'aujourd hui') + ' • ' + filterContextSummary())
        : describeScopeDetail(scope, timeline);
    }
    var comboHint = document.getElementById('biz-hint-perf-zone-client');
    if (comboHint) comboHint.textContent = comboScope === 'all'
      ? ('Top couples zone geographique + client depuis tout le fichier filtre • ' + filterContextSummary())
      : ('Top couples zone geographique + client sur le meme perimetre que le bloc • ' + filterContextSummary());

    var performanceMeta = [
      'Bloc KPI : Prise d’affaires / Performance',
      scopeLabel,
      isCountFamily ? 'Mode volume (nombre de dossiers)' : 'Mode valeur (€)',
      filterContextSummary()
    ];
    var performanceViews = [
      buildProjectTableView(scopeProjects.filter(isWon), isCountFamily ? 'Nb gagnés' : '€ gagnés', 'Détail KPI — projets gagnés', performanceMeta, isCountFamily ? 'Nb gagnés' : '€ gagnés'),
      buildProjectTableView(scopeProjects.filter(isLost), isCountFamily ? 'Nb perdus' : '€ perdus', 'Détail KPI — projets perdus', performanceMeta, isCountFamily ? 'Nb perdus' : '€ perdus'),
      buildProjectTableView(scopeProjects.filter(isDecided), isCountFamily ? 'Nb gagnés + perdus' : '€ gagnés + perdus', 'Détail KPI — projets décidés', performanceMeta, isCountFamily ? 'Nb gagnés + perdus' : '€ gagnés + perdus'),
      buildProjectTableView(scopeProjects.filter(isDecided), isCountFamily ? 'Taux de transfo dossiers' : 'Taux de transfo €', 'Détail KPI — base des projets décidés', performanceMeta.concat([isCountFamily ? 'Base KPI : nb gagnés / (nb gagnés + nb perdus)' : 'Base KPI : € gagnés / (€ gagnés + € perdus)']), isCountFamily ? 'Taux de transfo dossiers' : 'Taux de transfo €'),
      buildProjectTableView(scopeProjects.filter(isDecided), 'Nb dossiers décidés', 'Détail KPI — projets décidés', performanceMeta, 'Nb dossiers décidés')
    ];
    var performanceTableConfigBase = {
      title: 'KPI Prise d’affaires / Performance',
      subtitle: 'Choisissez un KPI pour afficher le tableau correspondant',
      meta: performanceMeta,
      views: performanceViews
    };

    renderKpi('biz-kpi-won-year', isCountFamily ? 'Nb gagnés' : '€ gagnes', computeValue(scopeProjects, isCountFamily ? 'won_count' : 'won_amount'), isCountFamily ? 'Nombre de dossiers gagnés' : 'Base Bud, statut obtenu', scopeProjects.filter(isWon), (isCountFamily ? 'Nb gagnés' : '€ gagnes') + ' — ' + scopeLabel.toLowerCase(), isCountFamily ? 'won_count' : 'won_amount', {
      tablePageConfig: Object.assign({}, performanceTableConfigBase, { selectedViewId: performanceViews[0].id })
    });
    renderKpi('biz-kpi-lost-year', isCountFamily ? 'Nb perdus' : '€ perdus', computeValue(scopeProjects, isCountFamily ? 'lost_count' : 'lost_amount'), isCountFamily ? 'Nombre de dossiers perdus' : 'Base Bud, statut perdu', scopeProjects.filter(isLost), (isCountFamily ? 'Nb perdus' : '€ perdus') + ' — ' + scopeLabel.toLowerCase(), isCountFamily ? 'lost_count' : 'lost_amount', {
      tablePageConfig: Object.assign({}, performanceTableConfigBase, { selectedViewId: performanceViews[1].id })
    });
    renderKpi('biz-kpi-decided-year', isCountFamily ? 'Nb gagnés + perdus' : '€ gagnes + perdus', computeValue(scopeProjects, isCountFamily ? 'decided_count' : 'decided_amount'), 'Projets decides sur le perimetre courant', scopeProjects.filter(isDecided), (isCountFamily ? 'Nb gagnés + perdus' : '€ gagnes + perdus') + ' — ' + scopeLabel.toLowerCase(), isCountFamily ? 'decided_count' : 'decided_amount', {
      tablePageConfig: Object.assign({}, performanceTableConfigBase, { selectedViewId: performanceViews[2].id })
    });
    renderKpi('biz-kpi-rate-year', isCountFamily ? 'Taux de transfo dossiers' : 'Taux de transfo €', computeValue(scopeProjects, isCountFamily ? 'won_rate_count' : 'won_rate_amount'), isCountFamily ? 'Nb gagnés / (nb gagnés + nb perdus)' : '€ gagnes / (€ gagnes + € perdus)', scopeProjects.filter(isDecided), (isCountFamily ? 'Taux de transformation dossiers' : 'Taux de transformation €') + ' — ' + scopeLabel.toLowerCase(), isCountFamily ? 'won_rate_count' : 'won_rate_amount', {
      tablePageConfig: Object.assign({}, performanceTableConfigBase, { selectedViewId: performanceViews[3].id })
    });
    renderKpi('biz-kpi-count-year', 'Nb dossiers decides', computeValue(scopeProjects, 'decided_count'), 'Nombre de dossiers gagnes + perdus', scopeProjects.filter(isDecided), 'Dossiers decides — ' + scopeLabel.toLowerCase(), 'decided_count', {
      tablePageConfig: Object.assign({}, performanceTableConfigBase, { selectedViewId: performanceViews[4].id })
    });

    if (displayMode === 'compare_status_amount' || displayMode === 'compare_status_count') {
      createComparisonChart('biz-chart-perf-month', modeLabel(displayMode) + ' par mois', comparisonMonthlyEntries, displayMode, {
        maxBarThickness: 18,
        minBarLength: 8
      });
      createComparisonChart('biz-chart-perf-zone', modeLabel(displayMode) + ' par zone', createComparisonAggregateEntries(scopeProjects, 'zone', displayMode, 10), displayMode, {
        indexAxis: 'y'
      });
      createComparisonChart('biz-chart-perf-client', modeLabel(displayMode) + ' par client', createComparisonAggregateEntries(scopeProjects, 'client', displayMode, 10), displayMode, {
        indexAxis: 'y'
      });
      createComparisonChart('biz-chart-perf-type', modeLabel(displayMode) + ' par type', createComparisonAggregateEntries(scopeProjects, 'type', displayMode, 10), displayMode, {
        indexAxis: 'y'
      });
      createComparisonChart(
        'biz-chart-perf-zone-client',
        modeLabel(displayMode) + ' par zone × client',
        createComparisonComboEntries(comboScope === 'all' ? filteredAll : scopeProjects, 'Zone Géographique', 'Client', displayMode, 12),
        displayMode,
        { indexAxis: 'y' }
      );
      createComparisonChart('biz-chart-perf-client-type', modeLabel(displayMode) + ' par client × type de projet', createComparisonComboEntries(scopeProjects, 'Client', 'Type de projet (Activité)', displayMode, 12), displayMode, {
        indexAxis: 'y'
      });
      return;
    }

    createChart('biz-chart-perf-month', modeLabel(displayMode) + ' par mois', monthlyEntries, displayMode, {
      type: (displayMode === 'won_rate_amount' || displayMode === 'won_rate_count') ? 'line' : 'bar',
      maxBarThickness: 24,
      minBarLength: 8
    });
    createChart('biz-chart-perf-zone', modeLabel(displayMode) + ' par zone', createAggregateEntries(scopeProjects, 'zone', displayMode, 10), displayMode, {
      indexAxis: 'y'
    });
    createChart('biz-chart-perf-client', modeLabel(displayMode) + ' par client', createAggregateEntries(scopeProjects, 'client', displayMode, 10), displayMode, {
      indexAxis: 'y'
    });
    createChart('biz-chart-perf-type', modeLabel(displayMode) + ' par type', createAggregateEntries(scopeProjects, 'type', displayMode, 10), displayMode, {
      indexAxis: 'y'
    });
    createChart(
      'biz-chart-perf-zone-client',
      modeLabel(displayMode) + ' par zone × client',
      createComboEntries(comboScope === 'all' ? filteredAll : scopeProjects, 'Zone Géographique', 'Client', displayMode, 12),
      displayMode,
      { indexAxis: 'y' }
    );
    createChart('biz-chart-perf-client-type', modeLabel(displayMode) + ' par client × type de projet', createComboEntries(scopeProjects, 'Client', 'Type de projet (Activité)', displayMode, 12), displayMode, {
      indexAxis: 'y'
    });
  }

  function renderPipeline(rawAll) {
    var view = (document.getElementById('biz-pipe-view') || {}).value || 'pipe_bud';
    var scope = resolveBusinessScope(rawAll, view);
    var scopeProjects = scope.scopeProjects;
    var offers = scopeProjects.filter(isPipeCommercialStatus);
    var zoneHint = view === 'pipe_ratio' ? 'Part de CA win proba / Bud par zone géographique' : 'Remis + En étude par zone géographique';
    var clientHint = view === 'pipe_ratio' ? 'Part de CA win proba / Bud par client' : 'Remis + En étude par client';
    var typeHint = view === 'pipe_ratio' ? 'Part de CA win proba / Bud par type de projet' : 'Remis + En étude par type de projet';
    var zoneClientHint = view === 'pipe_ratio' ? 'Part de CA win proba / Bud par zone × client' : 'Remis + En étude par zone × client';
    var clientTypeHint = view === 'pipe_ratio' ? 'Part de CA win proba / Bud par client × type de projet' : 'Remis + En étude par client × type de projet';

    updateTitles('biz-title-pipe-', view);

    var pipelineMeta = [
      'Bloc KPI : Pipe commercial',
      describeScopeLabel(scope),
      filterContextSummary()
    ];
    var pipelineViews = [
      buildProjectTableView(offers, '€ Remis + En étude total', 'Détail KPI — pipe commercial Bud', pipelineMeta.concat(['Base KPI : colonne Bud']), '€ Remis + En étude total'),
      buildProjectTableView(offers, '€ Remis + En étude pondéré', 'Détail KPI — pipe commercial pondéré', pipelineMeta.concat(['Base KPI : colonne CA win proba']), '€ Remis + En étude pondéré'),
      buildProjectTableView(offers, '% CA win proba / Bud', 'Détail KPI — pipe commercial', pipelineMeta.concat(['Base KPI : pondération globale du pipe actif']), '% CA win proba / Bud')
    ];
    var pipelineTableConfigBase = {
      title: 'KPI Pipe commercial',
      subtitle: 'Choisissez un KPI pour afficher le tableau correspondant',
      meta: pipelineMeta,
      views: pipelineViews
    };

    renderKpi('biz-kpi-pipe-bud', '€ Remis + En étude total', computeValue(scopeProjects, 'pipe_bud'), 'Colonne Bud', offers, 'Pipe commercial Bud total — ' + describeScopeLabel(scope).toLowerCase(), 'pipe_bud', {
      tablePageConfig: Object.assign({}, pipelineTableConfigBase, { selectedViewId: pipelineViews[0].id })
    });
    renderKpi('biz-kpi-pipe-weighted', '€ Remis + En étude pondéré', computeValue(scopeProjects, 'pipe_weighted'), 'Colonne CA win proba', offers, 'Pipe commercial CA win proba — ' + describeScopeLabel(scope).toLowerCase(), 'pipe_weighted', {
      tablePageConfig: Object.assign({}, pipelineTableConfigBase, { selectedViewId: pipelineViews[1].id })
    });
    renderKpi('biz-kpi-pipe-ratio', '% CA win proba / Bud', computeValue(scopeProjects, 'pipe_ratio'), 'Pondération globale du pipe actif', offers, 'Pipe commercial ratio — ' + describeScopeLabel(scope).toLowerCase(), 'pipe_ratio', {
      tablePageConfig: Object.assign({}, pipelineTableConfigBase, { selectedViewId: pipelineViews[2].id })
    });

    createChart('biz-chart-pipe-zone', modeLabel(view) + ' par zone', createAggregateEntries(scopeProjects, 'zone', view, 10), view, {
      indexAxis: 'y'
    });
    createChart('biz-chart-pipe-client', modeLabel(view) + ' par client', createAggregateEntries(scopeProjects, 'client', view, 10), view, {
      indexAxis: 'y'
    });
    createChart('biz-chart-pipe-type', modeLabel(view) + ' par type de projet', createAggregateEntries(scopeProjects, 'type', view, 10), view, {
      indexAxis: 'y'
    });
    createChart('biz-chart-pipe-zone-client', modeLabel(view) + ' par zone × client', createComboEntries(scopeProjects, 'Zone Géographique', 'Client', view, 12), view, {
      indexAxis: 'y'
    });
    createChart('biz-chart-pipe-client-type', modeLabel(view) + ' par client × type de projet', createComboEntries(scopeProjects, 'Client', 'Type de projet (Activité)', view, 12), view, {
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
      el.addEventListener('change', function() {
        syncPerformanceControls();
        render();
      });
    });
  }

  function syncPerformanceControls() {
    var viewEl = document.getElementById('biz-performance-view');
    var statusEl = document.getElementById('biz-performance-status-filter');
    if (!viewEl || !statusEl) return;
    var isRateView = viewEl.value === 'won_rate_amount' || viewEl.value === 'won_rate_count';
    if (isRateView) {
      if (!statusEl.dataset.previousValue) statusEl.dataset.previousValue = statusEl.value || 'all';
      statusEl.value = 'decided';
      statusEl.disabled = true;
      statusEl.title = 'Le taux de transformation se calcule sur Gagné + Perdu.';
      return;
    }
    statusEl.disabled = false;
    statusEl.title = '';
    if (statusEl.value === 'decided' && statusEl.dataset.previousValue) {
      statusEl.value = statusEl.dataset.previousValue;
    }
    delete statusEl.dataset.previousValue;
  }

  function _findControlLabel(selectId) {
    var select = document.getElementById(selectId);
    if (!select) return null;
    var byFor = document.querySelector('label[for="' + selectId + '"]');
    if (byFor) return byFor;
    var group = select.closest('.ctrl-grp, .business-control, .biz-control, .filter-group, .ctrl-group');
    if (!group) return null;
    return group.querySelector('label, .ctrl-lbl, .business-control-label');
  }

  function _setControlLabelText(selectId, text) {
    var label = _findControlLabel(selectId);
    if (!label || !text) return;
    var textNode = null;
    Array.prototype.forEach.call(label.childNodes || [], function(node) {
      if (!textNode && node && node.nodeType === 3 && String(node.nodeValue || '').trim()) {
        textNode = node;
      }
    });
    if (textNode) {
      textNode.nodeValue = text + ' ';
    } else {
      label.insertBefore(document.createTextNode(text + ' '), label.firstChild || null);
    }
  }

  function _setControlInfoText(selectId, infoText) {
    var label = _findControlLabel(selectId);
    if (!label || !infoText) return;
    var icon = label.querySelector('.info-icon');
    if (!icon) return;
    icon.setAttribute('data-info', infoText);
    icon.setAttribute('title', '');
  }

  function _setSelectOptionText(selectId, value, text) {
    var select = document.getElementById(selectId);
    if (!select || !select.options) return;
    Array.prototype.forEach.call(select.options, function(option) {
      if (option && option.value === value) option.textContent = text;
    });
  }

  function refreshControlCopy() {
    _setControlLabelText('biz-performance-combo-scope', 'Graphique zone × client');
    _setSelectOptionText('biz-performance-combo-scope', 'block', 'Année sélectionnée seulement');
    _setSelectOptionText('biz-performance-combo-scope', 'all', 'Toutes les années');
    _setControlInfoText(
      'biz-performance-combo-scope',
      'Ce réglage agit uniquement sur le graphique <strong>zone × client</strong>.<br><strong>Année sélectionnée seulement</strong> : suit le filtre Année commerciale.<br><strong>Toutes les années</strong> : ignore le filtre Année commerciale pour ce graphique.'
    );
    _setControlInfoText(
      'biz-performance-status-filter',
      'Choisit quels statuts afficher dans les graphiques de performance : <strong>Tout</strong>, <strong>Gagné</strong>, <strong>Perdu</strong>, <strong>Gagné + Perdu</strong> ou <strong>Offre</strong>. En mode <strong>taux de transfo</strong>, ce filtre est verrouillé automatiquement.'
    );
  }

  function render() {
    if (typeof AE === 'undefined' || typeof CM === 'undefined') return;
    var rawAll = (AE.getRaw && AE.getRaw()) || window.DATA || [];
    renderPerformance(rawAll, rawAll);
    renderPipeline(rawAll);
  }

  function init() {
    archiveLegacyCharts();
    ensureBusinessDrillBar();
    renderBusinessDrillBar();
    bindControls();
    refreshControlCopy();
    syncPerformanceControls();
    render();

    if (typeof AE !== 'undefined' && AE.subscribe) {
      AE.subscribe(render);
    }
  }

  window.BusinessChartsDashboard = {
    init: init,
    render: render,
    hideLegacy: archiveLegacyCharts,
    getDrillFilters: getBusinessDrillFilters,
    clearDrillFilters: clearBusinessDrillFilters,
    removeDrillFilter: removeBusinessDrillFilter,
    getChartSummary: getBusinessChartSummary
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
