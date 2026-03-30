if (!window.DashboardChartPreferences) {
window.DashboardChartPreferences = (() => {
  'use strict';

  var STORAGE_PREFIX = 'dashboard-chart-preferences-v1';
  var _state = { charts: {} };
  var _defaults = {};
  var _restoredDataCharts = {};
  var _updateWrapped = false;
  var _refreshTimer = null;

  function _userKey() {
    if (window.AuthClient && typeof window.AuthClient.getCurrentUser === 'function') {
      return window.AuthClient.getCurrentUser() || 'anonymous';
    }
    return 'anonymous';
  }

  function _storageKey() {
    return STORAGE_PREFIX + '::' + _userKey();
  }

  function _loadState() {
    try {
      var raw = localStorage.getItem(_storageKey());
      _state = raw ? JSON.parse(raw) : { charts: {} };
    } catch (err) {
      console.warn('[ChartPrefs] Lecture localStorage impossible', err);
      _state = { charts: {} };
    }
    if (!_state || typeof _state !== 'object') _state = { charts: {} };
    if (!_state.charts || typeof _state.charts !== 'object') _state.charts = {};
  }

  function _saveState() {
    try {
      localStorage.setItem(_storageKey(), JSON.stringify(_state));
      return true;
    } catch (err) {
      console.warn('[ChartPrefs] Ecriture localStorage impossible', err);
      return false;
    }
  }

  function _findCard(chartId) {
    return document.querySelector('.chart-card[data-chart-id="' + chartId + '"]');
  }

  function _getTitleEl(card) {
    return card ? card.querySelector('.chart-title') : null;
  }

  function _getHintEl(card) {
    return card ? card.querySelector('.chart-hint') : null;
  }

  function _listCards() {
    return Array.from(document.querySelectorAll('.chart-card[data-chart-id]')).filter(function(card) {
      return card && card.dataset.chartId && card.dataset.custom !== 'true';
    });
  }

  function _resolveChart(chartId) {
    var canvas = document.getElementById(chartId);
    if (!canvas || typeof Chart === 'undefined') return null;
    try {
      if (typeof Chart.getChart === 'function') {
        var direct = Chart.getChart(canvas);
        if (direct) return direct;
      }
      if (Chart.instances) {
        var found = Object.values(Chart.instances).find(function(inst) { return inst && inst.canvas === canvas; });
        if (found) return found;
      }
    } catch (err) {
      console.warn('[ChartPrefs] Resolution chart impossible pour', chartId, err);
    }
    return null;
  }

  function _extractPrimaryColor(value, fallback) {
    if (typeof value === 'string') return _toHexColor(value, fallback);
    if (Array.isArray(value) && value.length) return _toHexColor(value[0], fallback);
    return fallback || '#00d4aa';
  }

  function _toHexColor(value, fallback) {
    if (!value || typeof value !== 'string') return fallback || '#00d4aa';
    var v = value.trim();
    if (/^#[0-9a-f]{3}$/i.test(v)) {
      return '#' + v.slice(1).split('').map(function(ch) { return ch + ch; }).join('').toLowerCase();
    }
    if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase();
    var rgb = v.match(/^rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (rgb) {
      var toHex = function(n) {
        var s = Math.max(0, Math.min(255, parseInt(n, 10) || 0)).toString(16);
        return s.length === 1 ? '0' + s : s;
      };
      return '#' + toHex(rgb[1]) + toHex(rgb[2]) + toHex(rgb[3]);
    }
    return fallback || '#00d4aa';
  }

  function _hexToRgb(hex) {
    var h = _toHexColor(hex, '#00d4aa').slice(1);
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16)
    };
  }

  function _rgba(hex, alpha) {
    var rgb = _hexToRgb(hex);
    return 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + alpha + ')';
  }

  function _shiftColor(hex, delta) {
    var rgb = _hexToRgb(hex);
    function clamp(n) { return Math.max(0, Math.min(255, n)); }
    function toHex(n) {
      var s = clamp(n).toString(16);
      return s.length === 1 ? '0' + s : s;
    }
    return '#' + toHex(rgb.r + delta) + toHex(rgb.g + delta) + toHex(rgb.b + delta);
  }

  function _buildPalette(baseHex, count) {
    var colors = [];
    var total = Math.max(1, count || 1);
    for (var i = 0; i < total; i += 1) {
      colors.push(_rgba(_shiftColor(baseHex, i * 8), 0.75));
    }
    return colors;
  }

  function _escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function _formatterLabel(mode, value) {
    var num = typeof value === 'number' ? value : parseFloat(value);
    if (!isFinite(num)) return value;
    switch (mode) {
      case 'currency':
        return num.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
      case 'k-eur':
        return (num / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' kEUR';
      case 'm-eur':
        return (num / 1000000).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' MEUR';
      case 'percent':
        return num.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' %';
      case 'decimal':
        return num.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
      case 'integer':
        return Math.round(num).toLocaleString('fr-FR');
      case 'raw':
        return String(num);
      case 'auto':
      default:
        if (Math.abs(num) >= 1000) return num.toLocaleString('fr-FR');
        return String(Math.round(num * 100) / 100);
    }
  }

  function _getAllowedTypes(chart) {
    if (!chart || !chart.config) return ['bar', 'line', 'pie', 'doughnut'];
    var current = chart.config.type || 'bar';
    var datasetTypes = chart.data && chart.data.datasets
      ? chart.data.datasets.map(function(ds) { return ds && ds.type ? ds.type : current; }).filter(Boolean)
      : [];
    var mixedTypes = datasetTypes.filter(function(value, index, arr) { return arr.indexOf(value) === index; }).length > 1;
    if (mixedTypes) return [current];
    if (current === 'bubble' || current === 'scatter' || current === 'radar' || current === 'polarArea') {
      return [current];
    }
    var dsCount = chart.data && chart.data.datasets ? chart.data.datasets.length : 0;
    if (dsCount > 1) return ['bar', 'line', current];
    return ['bar', 'line', 'pie', 'doughnut', current].filter(function(value, index, arr) {
      return arr.indexOf(value) === index;
    });
  }

  function _getBridgeSchema(chartId) {
    if (window.ChartConfigBridge && typeof window.ChartConfigBridge.getSchema === 'function' && window.ChartConfigBridge.hasChart(chartId)) {
      return window.ChartConfigBridge.getSchema(chartId);
    }
    return null;
  }

  function _getBridgeConfig(chartId) {
    if (window.ChartConfigBridge && typeof window.ChartConfigBridge.getConfig === 'function' && window.ChartConfigBridge.hasChart(chartId)) {
      return window.ChartConfigBridge.getConfig(chartId);
    }
    return null;
  }

  function _applyBridgeConfig(chartId, dataConfig) {
    if (!dataConfig || !window.ChartConfigBridge || typeof window.ChartConfigBridge.applyConfig !== 'function') return false;
    if (!window.ChartConfigBridge.hasChart(chartId)) return false;
    return window.ChartConfigBridge.applyConfig(chartId, dataConfig);
  }

  function _resetBridgeConfig(chartId) {
    if (!window.ChartConfigBridge || typeof window.ChartConfigBridge.resetConfig !== 'function') return false;
    if (!window.ChartConfigBridge.hasChart(chartId)) return false;
    return window.ChartConfigBridge.resetConfig(chartId);
  }

  function _captureDefaults(chartId) {
    if (_defaults[chartId]) return _defaults[chartId];
    var card = _findCard(chartId);
    var chart = _resolveChart(chartId);
    if (!card) return null;

    var titleEl = _getTitleEl(card);
    var hintEl = _getHintEl(card);
    var chartType = chart && chart.config ? chart.config.type : 'bar';
    var xScale = chart && chart.options && chart.options.scales ? chart.options.scales.x : null;
    var yScale = chart && chart.options && chart.options.scales ? chart.options.scales.y : null;
    var legendDisplay = !(chart && chart.options && chart.options.plugins && chart.options.plugins.legend && chart.options.plugins.legend.display === false);
    var gridDisplay = !(xScale && xScale.grid && xScale.grid.display === false) && !(yScale && yScale.grid && yScale.grid.display === false);
    var datasets = chart && chart.data && chart.data.datasets ? chart.data.datasets : [];

    _defaults[chartId] = {
      title: titleEl ? titleEl.textContent.replace(/\s+/g, ' ').trim() : chartId,
      subtitle: hintEl ? hintEl.textContent.replace(/\s+/g, ' ').trim() : '',
      visual: {
        type: chartType,
        orientation: chart && chart.options && chart.options.indexAxis === 'y' ? 'horizontal' : 'vertical',
        legend: legendDisplay,
        grid: gridDisplay,
        stacked: !!((xScale && xScale.stacked) || (yScale && yScale.stacked)),
        unit: 'auto',
        yMin: yScale && typeof yScale.min === 'number' ? yScale.min : '',
        yMax: yScale && typeof yScale.max === 'number' ? yScale.max : '',
        xTick: xScale && xScale.ticks ? xScale.ticks.callback : null,
        yTick: yScale && yScale.ticks ? yScale.ticks.callback : null,
        tooltipLabel: chart && chart.options && chart.options.plugins && chart.options.plugins.tooltip && chart.options.plugins.tooltip.callbacks
          ? chart.options.plugins.tooltip.callbacks.label
          : null
      },
      colors: {
        primary: _extractPrimaryColor(datasets[0] && (datasets[0].backgroundColor || datasets[0].borderColor), '#00d4aa'),
        secondary: _extractPrimaryColor(datasets[1] && (datasets[1].backgroundColor || datasets[1].borderColor), '#0099ff')
      }
    };
    return _defaults[chartId];
  }

  function _currentConfig(chartId) {
    var saved = _state.charts[chartId] || {};
    var defaults = _captureDefaults(chartId) || {};
    var currentBridge = _getBridgeConfig(chartId);
    return {
      presentation: {
        title: saved.presentation && saved.presentation.title ? saved.presentation.title : defaults.title || chartId,
        subtitle: saved.presentation && saved.presentation.subtitle != null ? saved.presentation.subtitle : (defaults.subtitle || '')
      },
      visual: {
        type: saved.visual && saved.visual.type ? saved.visual.type : 'auto',
        orientation: saved.visual && saved.visual.orientation ? saved.visual.orientation : 'auto',
        legend: saved.visual && typeof saved.visual.legend === 'boolean' ? saved.visual.legend : defaults.visual && typeof defaults.visual.legend === 'boolean' ? defaults.visual.legend : true,
        grid: saved.visual && typeof saved.visual.grid === 'boolean' ? saved.visual.grid : defaults.visual && typeof defaults.visual.grid === 'boolean' ? defaults.visual.grid : true,
        stacked: saved.visual && typeof saved.visual.stacked === 'boolean' ? saved.visual.stacked : defaults.visual && typeof defaults.visual.stacked === 'boolean' ? defaults.visual.stacked : false,
        unit: saved.visual && saved.visual.unit ? saved.visual.unit : 'auto',
        yMin: saved.visual && saved.visual.yMin != null ? saved.visual.yMin : '',
        yMax: saved.visual && saved.visual.yMax != null ? saved.visual.yMax : ''
      },
      colors: {
        primary: saved.colors && saved.colors.primary ? saved.colors.primary : defaults.colors && defaults.colors.primary ? defaults.colors.primary : '#00d4aa',
        secondary: saved.colors && saved.colors.secondary ? saved.colors.secondary : defaults.colors && defaults.colors.secondary ? defaults.colors.secondary : '#0099ff'
      },
      data: saved.data || currentBridge || {}
    };
  }

  function _applyPresentation(chartId, config) {
    var card = _findCard(chartId);
    if (!card) return;
    var defaults = _captureDefaults(chartId);
    var titleEl = _getTitleEl(card);
    var hintEl = _getHintEl(card);
    if (titleEl) titleEl.textContent = (config.presentation && config.presentation.title) || defaults.title || chartId;
    if (hintEl) hintEl.textContent = (config.presentation && config.presentation.subtitle != null ? config.presentation.subtitle : defaults.subtitle) || '';
  }

  function _applyColors(chart, config, defaults) {
    if (!chart || !chart.data || !Array.isArray(chart.data.datasets)) return;
    var primary = config.colors && config.colors.primary ? config.colors.primary : defaults.colors.primary;
    var secondary = config.colors && config.colors.secondary ? config.colors.secondary : defaults.colors.secondary;
    chart.data.datasets.forEach(function(ds, index) {
      var base = index === 0 ? primary : index === 1 ? secondary : _shiftColor(primary, index * 14);
      if (Array.isArray(ds.backgroundColor)) {
        ds.backgroundColor = _buildPalette(base, ds.backgroundColor.length || (ds.data ? ds.data.length : 1));
      } else {
        ds.backgroundColor = _rgba(base, chart.config.type === 'line' ? 0.18 : 0.72);
      }
      if (Array.isArray(ds.borderColor)) {
        ds.borderColor = _buildPalette(_shiftColor(base, -10), ds.borderColor.length || (ds.data ? ds.data.length : 1));
      } else {
        ds.borderColor = _rgba(_shiftColor(base, -12), 0.95);
      }
      if (chart.config.type === 'line') {
        ds.borderWidth = 2.5;
        ds.fill = false;
        if (typeof ds.pointBackgroundColor !== 'undefined') ds.pointBackgroundColor = _rgba(base, 0.95);
      }
    });
  }

  function _applyVisual(chartId, config) {
    var chart = _resolveChart(chartId);
    if (!chart) return;
    var defaults = _captureDefaults(chartId);
    var allowedTypes = _getAllowedTypes(chart);
    var targetType = config.visual && config.visual.type && config.visual.type !== 'auto' ? config.visual.type : defaults.visual.type;
    if (allowedTypes.indexOf(targetType) === -1) targetType = defaults.visual.type;

    chart.config.type = targetType;
    chart.options = chart.options || {};
    chart.options.plugins = chart.options.plugins || {};
    chart.options.plugins.legend = chart.options.plugins.legend || {};
    chart.options.plugins.tooltip = chart.options.plugins.tooltip || {};
    chart.options.plugins.tooltip.callbacks = chart.options.plugins.tooltip.callbacks || {};
    chart.options.plugins.legend.display = !!config.visual.legend;

    var orientation = config.visual.orientation || 'auto';
    if (targetType === 'bar') {
      if (orientation === 'horizontal') chart.options.indexAxis = 'y';
      else if (orientation === 'vertical') chart.options.indexAxis = 'x';
      else chart.options.indexAxis = defaults.visual.orientation === 'horizontal' ? 'y' : 'x';
    } else {
      delete chart.options.indexAxis;
    }

    if (chart.options.scales && chart.options.scales.x) {
      chart.options.scales.x.grid = chart.options.scales.x.grid || {};
      chart.options.scales.x.grid.display = !!config.visual.grid;
      chart.options.scales.x.stacked = !!config.visual.stacked;
    }
    if (chart.options.scales && chart.options.scales.y) {
      chart.options.scales.y.grid = chart.options.scales.y.grid || {};
      chart.options.scales.y.grid.display = !!config.visual.grid;
      chart.options.scales.y.stacked = !!config.visual.stacked;
      if (config.visual.yMin === '' || config.visual.yMin == null) delete chart.options.scales.y.min;
      else chart.options.scales.y.min = Number(config.visual.yMin);
      if (config.visual.yMax === '' || config.visual.yMax == null) delete chart.options.scales.y.max;
      else chart.options.scales.y.max = Number(config.visual.yMax);
    }

    var unitMode = config.visual.unit || 'auto';
    var tooltipDefault = defaults.visual.tooltipLabel;
    chart.options.plugins.tooltip.callbacks.label = function(context) {
      var raw = context && context.raw && typeof context.raw === 'object' && context.raw.y != null ? context.raw.y : context.raw;
      var dsLabel = context && context.dataset && context.dataset.label ? context.dataset.label + ' : ' : '';
      if (unitMode === 'auto' && typeof tooltipDefault === 'function') {
        try { return tooltipDefault(context); } catch (err) {}
      }
      return ' ' + dsLabel + _formatterLabel(unitMode, raw);
    };

    if (chart.options.scales && chart.options.scales.x && chart.options.indexAxis === 'y') {
      chart.options.scales.x.ticks = chart.options.scales.x.ticks || {};
      chart.options.scales.x.ticks.callback = function(value) { return _formatterLabel(unitMode, value); };
    } else if (chart.options.scales && chart.options.scales.x && defaults.visual.xTick && unitMode === 'auto') {
      chart.options.scales.x.ticks = chart.options.scales.x.ticks || {};
      chart.options.scales.x.ticks.callback = defaults.visual.xTick;
    }

    if (chart.options.scales && chart.options.scales.y && chart.options.indexAxis !== 'y') {
      chart.options.scales.y.ticks = chart.options.scales.y.ticks || {};
      chart.options.scales.y.ticks.callback = function(value) { return _formatterLabel(unitMode, value); };
    } else if (chart.options.scales && chart.options.scales.y && defaults.visual.yTick && unitMode === 'auto') {
      chart.options.scales.y.ticks = chart.options.scales.y.ticks || {};
      chart.options.scales.y.ticks.callback = defaults.visual.yTick;
    }

    _applyColors(chart, config, defaults);

    try { chart.update('none'); }
    catch (err) { console.warn('[ChartPrefs] update impossible pour', chartId, err); }
  }

  function _applySingle(chartId) {
    var config = _currentConfig(chartId);
    _applyPresentation(chartId, config);
    setTimeout(function() { _applyVisual(chartId, config); }, 40);
  }

  function refreshAll() {
    _listCards().forEach(function(card) {
      _captureDefaults(card.dataset.chartId);
      _applySingle(card.dataset.chartId);
    });
  }

  function _scheduleRefresh() {
    clearTimeout(_refreshTimer);
    _refreshTimer = setTimeout(refreshAll, 180);
  }

  function _restoreDataConfigs() {
    Object.keys(_state.charts || {}).forEach(function(chartId) {
      var saved = _state.charts[chartId];
      if (!saved || !saved.data || _restoredDataCharts[chartId]) return;
      if (_applyBridgeConfig(chartId, saved.data)) {
        _restoredDataCharts[chartId] = true;
      }
    });
  }

  function _injectButtons() {
    _listCards().forEach(function(card) {
      var chartId = card.dataset.chartId;
      var actions = card.querySelector('.chart-title-actions');
      if (!actions || actions.querySelector('.chart-pref-btn')) return;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chart-pref-btn';
      btn.dataset.chartPrefs = chartId;
      btn.title = 'Personnaliser ce graphique';
      btn.textContent = '🎛';
      btn.addEventListener('click', function(evt) {
        evt.preventDefault();
        evt.stopPropagation();
        openEditor(chartId);
      });
      actions.insertBefore(btn, actions.firstChild || null);
    });
  }

  function _closeModal() {
    var modal = document.getElementById('chart-pref-modal');
    var overlay = document.getElementById('chart-pref-overlay');
    if (modal) modal.remove();
    if (overlay) overlay.remove();
  }

  function _buildDataEditor(chartId, current) {
    var schema = _getBridgeSchema(chartId);
    if (!schema) {
      return '<div class="chart-pref-note">Ce graphique conserve sa logique metier actuelle. La personnalisation V1 couvre ici le titre, les couleurs, l unite, l echelle et l affichage.</div>';
    }
    return '<div class="chart-pref-group">'
      + '<div class="chart-pref-group-title">Source et axes</div>'
      + Object.keys(schema).map(function(axis) {
        var item = schema[axis];
        var value = current.data && current.data[axis] != null ? current.data[axis] : item.current;
        return '<label class="chart-pref-field"><span>' + _escapeHtml(item.label) + '</span><select data-pref-data="' + _escapeHtml(axis) + '">'
          + item.options.map(function(opt) {
            return '<option value="' + _escapeHtml(opt.value) + '"' + (String(opt.value) === String(value) ? ' selected' : '') + '>' + _escapeHtml(opt.label) + '</option>';
          }).join('')
          + '</select></label>';
      }).join('')
      + '</div>';
  }

  function _openMarkup(chartId, current, defaults, chart) {
    var allowedTypes = _getAllowedTypes(chart);
    var typeOptions = ['auto'].concat(allowedTypes).filter(function(value, index, arr) {
      return arr.indexOf(value) === index;
    });
    return ''
      + '<div class="chart-pref-head"><div>'
      + '<div class="chart-pref-kicker">Edition avancee</div>'
      + '<div class="chart-pref-title">Configurer ' + _escapeHtml(chartId) + '</div>'
      + '</div><button type="button" class="chart-pref-close" data-pref-close>x</button></div>'
      + '<div class="chart-pref-body">'
      + '<div class="chart-pref-group">'
      + '<div class="chart-pref-group-title">Presentation</div>'
      + '<label class="chart-pref-field"><span>Titre</span><input type="text" id="chart-pref-title-input" value="' + _escapeHtml(current.presentation.title || '') + '"></label>'
      + '<label class="chart-pref-field"><span>Sous-titre</span><textarea id="chart-pref-subtitle-input" rows="3">' + _escapeHtml(current.presentation.subtitle || '') + '</textarea></label>'
      + '</div>'
      + _buildDataEditor(chartId, current)
      + '<div class="chart-pref-group">'
      + '<div class="chart-pref-group-title">Rendu</div>'
      + '<div class="chart-pref-grid">'
      + '<label class="chart-pref-field"><span>Type</span><select id="chart-pref-type">' + typeOptions.map(function(type) {
          var label = type === 'auto' ? 'Defaut' : type;
          return '<option value="' + type + '"' + (current.visual.type === type ? ' selected' : '') + '>' + label + '</option>';
        }).join('') + '</select></label>'
      + '<label class="chart-pref-field"><span>Orientation</span><select id="chart-pref-orientation">'
      + '<option value="auto"' + (current.visual.orientation === 'auto' ? ' selected' : '') + '>Defaut</option>'
      + '<option value="vertical"' + (current.visual.orientation === 'vertical' ? ' selected' : '') + '>Verticale</option>'
      + '<option value="horizontal"' + (current.visual.orientation === 'horizontal' ? ' selected' : '') + '>Horizontale</option>'
      + '</select></label>'
      + '<label class="chart-pref-field"><span>Unite</span><select id="chart-pref-unit">'
      + '<option value="auto"' + (current.visual.unit === 'auto' ? ' selected' : '') + '>Auto</option>'
      + '<option value="currency"' + (current.visual.unit === 'currency' ? ' selected' : '') + '>Euro</option>'
      + '<option value="k-eur"' + (current.visual.unit === 'k-eur' ? ' selected' : '') + '>kEUR</option>'
      + '<option value="m-eur"' + (current.visual.unit === 'm-eur' ? ' selected' : '') + '>MEUR</option>'
      + '<option value="percent"' + (current.visual.unit === 'percent' ? ' selected' : '') + '>Pourcentage</option>'
      + '<option value="integer"' + (current.visual.unit === 'integer' ? ' selected' : '') + '>Entier</option>'
      + '<option value="decimal"' + (current.visual.unit === 'decimal' ? ' selected' : '') + '>Decimal</option>'
      + '<option value="raw"' + (current.visual.unit === 'raw' ? ' selected' : '') + '>Brut</option>'
      + '</select></label>'
      + '<label class="chart-pref-field"><span>Y min</span><input type="number" id="chart-pref-ymin" value="' + current.visual.yMin + '"></label>'
      + '<label class="chart-pref-field"><span>Y max</span><input type="number" id="chart-pref-ymax" value="' + current.visual.yMax + '"></label>'
      + '<label class="chart-pref-toggle"><input type="checkbox" id="chart-pref-legend"' + (current.visual.legend ? ' checked' : '') + '> Afficher la legende</label>'
      + '<label class="chart-pref-toggle"><input type="checkbox" id="chart-pref-grid"' + (current.visual.grid ? ' checked' : '') + '> Afficher la grille</label>'
      + '<label class="chart-pref-toggle"><input type="checkbox" id="chart-pref-stacked"' + (current.visual.stacked ? ' checked' : '') + '> Empiler les series</label>'
      + '</div></div>'
      + '<div class="chart-pref-group">'
      + '<div class="chart-pref-group-title">Couleurs</div>'
      + '<div class="chart-pref-grid">'
      + '<label class="chart-pref-field"><span>Couleur principale</span><input type="color" id="chart-pref-color-primary" value="' + _toHexColor(current.colors.primary, defaults.colors.primary) + '"></label>'
      + '<label class="chart-pref-field"><span>Couleur secondaire</span><input type="color" id="chart-pref-color-secondary" value="' + _toHexColor(current.colors.secondary, defaults.colors.secondary) + '"></label>'
      + '</div></div>'
      + '</div>'
      + '<div class="chart-pref-actions">'
      + '<button type="button" class="chart-pref-secondary" data-pref-reset>Restaurer par defaut</button>'
      + '<button type="button" class="chart-pref-secondary" data-pref-close>Annuler</button>'
      + '<button type="button" class="chart-pref-primary" data-pref-save>Enregistrer</button>'
      + '</div>';
  }

  function openEditor(chartId) {
    _closeModal();
    var defaults = _captureDefaults(chartId);
    var current = _currentConfig(chartId);
    var chart = _resolveChart(chartId);

    var overlay = document.createElement('div');
    overlay.id = 'chart-pref-overlay';
    overlay.className = 'chart-pref-overlay';
    overlay.addEventListener('click', _closeModal);

    var modal = document.createElement('div');
    modal.id = 'chart-pref-modal';
    modal.className = 'chart-pref-modal';
    modal.innerHTML = _openMarkup(chartId, current, defaults, chart);
    modal.addEventListener('click', function(evt) { evt.stopPropagation(); });

    document.body.appendChild(overlay);
    document.body.appendChild(modal);

    Array.from(modal.querySelectorAll('[data-pref-close]')).forEach(function(btn) {
      btn.addEventListener('click', _closeModal);
    });

    var saveBtn = modal.querySelector('[data-pref-save]');
    if (saveBtn) {
      saveBtn.addEventListener('click', function() {
        var next = {
          presentation: {
            title: modal.querySelector('#chart-pref-title-input').value.trim() || defaults.title,
            subtitle: modal.querySelector('#chart-pref-subtitle-input').value.trim()
          },
          visual: {
            type: modal.querySelector('#chart-pref-type').value || 'auto',
            orientation: modal.querySelector('#chart-pref-orientation').value || 'auto',
            unit: modal.querySelector('#chart-pref-unit').value || 'auto',
            legend: !!modal.querySelector('#chart-pref-legend').checked,
            grid: !!modal.querySelector('#chart-pref-grid').checked,
            stacked: !!modal.querySelector('#chart-pref-stacked').checked,
            yMin: modal.querySelector('#chart-pref-ymin').value,
            yMax: modal.querySelector('#chart-pref-ymax').value
          },
          colors: {
            primary: modal.querySelector('#chart-pref-color-primary').value || defaults.colors.primary,
            secondary: modal.querySelector('#chart-pref-color-secondary').value || defaults.colors.secondary
          }
        };

        var dataConfig = {};
        Array.from(modal.querySelectorAll('[data-pref-data]')).forEach(function(el) {
          dataConfig[el.dataset.prefData] = el.value;
        });
        if (Object.keys(dataConfig).length) {
          next.data = dataConfig;
          _applyBridgeConfig(chartId, dataConfig);
          _restoredDataCharts[chartId] = true;
        }

        _state.charts[chartId] = next;
        _saveState();
        _applySingle(chartId);
        if (typeof notify === 'function') {
          notify('Graphique personnalise', 'Les reglages de ' + chartId + ' ont ete enregistres localement', 'success', 2400);
        }
        _closeModal();
      });
    }

    var resetBtn = modal.querySelector('[data-pref-reset]');
    if (resetBtn) {
      resetBtn.addEventListener('click', function() {
        delete _state.charts[chartId];
        _saveState();
        _resetBridgeConfig(chartId);
        delete _restoredDataCharts[chartId];
        _applyPresentation(chartId, { presentation: { title: defaults.title, subtitle: defaults.subtitle } });
        setTimeout(function() {
          _applyVisual(chartId, {
            presentation: { title: defaults.title, subtitle: defaults.subtitle },
            visual: {
              type: 'auto',
              orientation: 'auto',
              legend: defaults.visual.legend,
              grid: defaults.visual.grid,
              stacked: defaults.visual.stacked,
              unit: 'auto',
              yMin: '',
              yMax: ''
            },
            colors: defaults.colors
          });
        }, 60);
        if (typeof notify === 'function') {
          notify('Configuration restauree', 'Le graphique ' + chartId + ' a retrouve son etat par defaut', 'info', 2200);
        }
        _closeModal();
      });
    }
  }

  function injectStyles() {
    if (document.getElementById('chart-pref-styles')) return;
    var style = document.createElement('style');
    style.id = 'chart-pref-styles';
    style.textContent = ''
      + '.chart-pref-btn{background:rgba(0,153,255,.12);border:1px solid rgba(0,153,255,.28);color:#7dc6ff;}'
      + '.chart-pref-btn:hover{background:rgba(0,153,255,.2);border-color:rgba(0,153,255,.48);color:#d6efff;}'
      + '.chart-pref-overlay{position:fixed;inset:0;background:rgba(4,8,14,.62);backdrop-filter:blur(4px);z-index:10030;}'
      + '.chart-pref-modal{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:min(880px,calc(100vw - 32px));max-height:calc(100vh - 40px);overflow:auto;background:#0f1723;border:1px solid rgba(125,198,255,.22);border-radius:18px;box-shadow:0 20px 70px rgba(0,0,0,.55);z-index:10031;padding:18px 18px 16px;color:#dce8f5;}'
      + '.chart-pref-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:14px;}'
      + '.chart-pref-kicker{font-size:.68rem;letter-spacing:.08em;text-transform:uppercase;color:#7dc6ff;font-family:var(--mono,monospace);}'
      + '.chart-pref-title{font-size:1rem;font-weight:700;color:#f5fbff;margin-top:3px;}'
      + '.chart-pref-close{width:32px;height:32px;border-radius:10px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04);color:#dce8f5;cursor:pointer;}'
      + '.chart-pref-body{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;}'
      + '.chart-pref-group{border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03);border-radius:14px;padding:14px;}'
      + '.chart-pref-group-title{font-size:.72rem;letter-spacing:.08em;text-transform:uppercase;color:#7dc6ff;font-family:var(--mono,monospace);margin-bottom:10px;}'
      + '.chart-pref-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 12px;}'
      + '.chart-pref-field{display:flex;flex-direction:column;gap:6px;font-size:.78rem;color:#9fb3c8;}'
      + '.chart-pref-field span{font-size:.72rem;color:#9fb3c8;}'
      + '.chart-pref-field input,.chart-pref-field textarea,.chart-pref-field select{width:100%;background:#0b1320;border:1px solid rgba(255,255,255,.08);border-radius:10px;color:#e7f3ff;padding:10px 11px;font:inherit;}'
      + '.chart-pref-field textarea{resize:vertical;min-height:76px;}'
      + '.chart-pref-toggle{display:flex;align-items:center;gap:8px;font-size:.78rem;color:#dce8f5;padding-top:22px;}'
      + '.chart-pref-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:16px;}'
      + '.chart-pref-primary,.chart-pref-secondary{border-radius:10px;padding:10px 14px;font:inherit;cursor:pointer;border:1px solid transparent;}'
      + '.chart-pref-primary{background:rgba(0,212,170,.16);border-color:rgba(0,212,170,.4);color:#9ff3e1;font-weight:700;}'
      + '.chart-pref-secondary{background:rgba(255,255,255,.04);border-color:rgba(255,255,255,.08);color:#dce8f5;}'
      + '.chart-pref-note{font-size:.8rem;line-height:1.55;color:#9fb3c8;background:rgba(255,255,255,.02);border:1px dashed rgba(255,255,255,.08);border-radius:12px;padding:12px 13px;}'
      + '@media (max-width: 880px){.chart-pref-body,.chart-pref-grid{grid-template-columns:1fr;}}';
    document.head.appendChild(style);
  }

  function _wrapUpdate() {
    if (_updateWrapped || typeof window.update !== 'function') return;
    _updateWrapped = true;
    var original = window.update;
    window.update = function() {
      var result = original.apply(this, arguments);
      _scheduleRefresh();
      return result;
    };
  }

  function init() {
    _loadState();
    injectStyles();
    _injectButtons();
    _wrapUpdate();
    setTimeout(function() {
      _listCards().forEach(function(card) { _captureDefaults(card.dataset.chartId); });
      _restoreDataConfigs();
      _injectButtons();
      _scheduleRefresh();
    }, 900);
    console.log('[ChartPrefs] Edition avancee des graphiques prete');
  }

  return {
    init: init,
    openEditor: openEditor,
    refreshAll: refreshAll
  };
})();
}
