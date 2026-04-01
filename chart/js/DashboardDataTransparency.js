if (!window.DashboardDataTransparency) {
window.DashboardDataTransparency = (function() {
  'use strict';

  var _meta = {
    datasetKey: 'saip-main',
    sourceName: '',
    updatedAt: '',
    payloadHash: '',
    rowCount: 0,
    storageMode: '',
    sourceType: 'bootstrap'
  };

  function _setText(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function _escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function _formatDate(value) {
    if (!value) return 'Mise a jour inconnue';
    var dt = new Date(value);
    if (!isFinite(dt.getTime())) return String(value);
    return dt.toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function _storageLabel(mode, sourceType) {
    if (sourceType === 'file-import') return 'Import manuel navigateur';
    if (mode === 'session-cache') return 'Cache session restaure';
    if (mode === 'plain') return 'Dataset charge depuis la base';
    if (sourceType === 'bootstrap') return 'Donnees initialisees cote front';
    return 'Mode de chargement non documente';
  }

  function _dateFieldLabel() {
    var el = document.getElementById('date-field-selector');
    return el && el.value ? el.value : 'Date reception';
  }

  function _filterSummary() {
    var parts = [];
    var year = document.getElementById('year-filter');
    var energy = document.getElementById('energy-type-filter');
    var timelineText = '';

    if (year && year.value) parts.push('annee ' + year.value);
    if (energy && energy.value) parts.push('energie ' + energy.options[energy.selectedIndex].textContent.trim());

    if (typeof window.getActiveTimelineRange === 'function') {
      var timeline = window.getActiveTimelineRange();
      if (timeline && (timeline.start || timeline.end)) {
        timelineText = (timeline.start || 'debut') + ' → ' + (timeline.end || 'aujourd hui');
        parts.push('periode ' + timelineText);
      }
    }

    if (typeof AE !== 'undefined' && typeof AE.getFilters === 'function') {
      var filters = AE.getFilters() || {};
      Object.keys(filters).forEach(function(key) {
        if (!filters[key]) return;
        if (key === '_annee') return;
        parts.push(key + ' = ' + filters[key]);
      });
    }

    var search = document.getElementById('search-input') || document.getElementById('search-bar');
    if (search && search.value && String(search.value).trim()) {
      parts.push('recherche "' + String(search.value).trim() + '"');
    }

    return parts.length ? parts.join(' • ') : 'aucun filtre fort, lecture sur le perimetre visible';
  }

  function _visibleProjectsCount(data) {
    if (Array.isArray(data)) return data.length;
    if (typeof AE !== 'undefined' && typeof AE.getFiltered === 'function') {
      var filtered = AE.getFiltered();
      if (Array.isArray(filtered)) return filtered.length;
    }
    return 0;
  }

  function _pointCount(chartId) {
    if (typeof Chart === 'undefined' || typeof Chart.getChart !== 'function') return 0;
    var canvas = document.getElementById(chartId);
    if (!canvas) return 0;
    var chart = Chart.getChart(canvas);
    if (!chart || !chart.data) return 0;
    if (Array.isArray(chart.data.labels) && chart.data.labels.length) return chart.data.labels.length;
    if (chart.data.datasets && chart.data.datasets[0] && Array.isArray(chart.data.datasets[0].data)) {
      return chart.data.datasets[0].data.length;
    }
    return 0;
  }

  function setDatasetMeta(nextMeta) {
    _meta = Object.assign({}, _meta, nextMeta || {});
    renderGlobalBanner();
  }

  function getDatasetMeta() {
    return Object.assign({}, _meta);
  }

  function renderGlobalBanner(data) {
    var visibleCount = _visibleProjectsCount(data);
    var rowCount = Number(_meta.rowCount) || 0;
    var status = visibleCount && rowCount
      ? visibleCount + ' projet(s) visibles sur ' + rowCount + ' ligne(s)'
      : rowCount
        ? rowCount + ' ligne(s) chargee(s)'
        : 'Dataset en attente';

    _setText('data-banner-status', status);
    _setText('data-banner-source', _meta.sourceName || 'Dataset non documente');
    _setText('data-banner-storage', _storageLabel(_meta.storageMode, _meta.sourceType));
    _setText('data-banner-updated', _formatDate(_meta.updatedAt));
    _setText('data-banner-key', 'Dataset: ' + (_meta.datasetKey || '—'));
    _setText('data-banner-volume', (rowCount || 0) + ' ligne' + ((rowCount || 0) > 1 ? 's' : ''));
    _setText('data-banner-visible', visibleCount + ' projet' + (visibleCount > 1 ? 's visibles' : ' visible'));
    _setText('data-banner-scope', _filterSummary());
    _setText('data-banner-date-field', 'Champ date: ' + _dateFieldLabel());

    var foot = document.getElementById('data-banner-foot');
    if (foot) {
      foot.textContent =
        'Lecture conseillee: verifiez la source, la date de mise a jour, puis le perimetre filtre. Sous chaque graphique, le bloc Analyse rappelle la logique de lecture et le bouton Tableau donne acces aux valeurs.';
    }
  }

  function describeChartContext(chartId, data) {
    var meta = getDatasetMeta();
    var visibleCount = _visibleProjectsCount(data);
    var pointCount = _pointCount(chartId);
    var parts = [
      '<span><strong>Source:</strong> ' + _escapeHtml(meta.sourceName || 'dataset actif') + '</span>',
      '<span><strong>Perimetre:</strong> ' + _escapeHtml(_filterSummary()) + '</span>',
      '<span><strong>Volume:</strong> ' + _escapeHtml(String(visibleCount)) + ' projet(s) visibles' + (pointCount ? ' • ' + String(pointCount) + ' point(s) traces' : '') + '</span>',
      '<span><strong>Lecture:</strong> utilisez "Tableau" pour verifier les valeurs derriere le graphe</span>'
    ];
    return parts.join('');
  }

  return {
    setDatasetMeta: setDatasetMeta,
    getDatasetMeta: getDatasetMeta,
    renderGlobalBanner: renderGlobalBanner,
    describeChartContext: describeChartContext
  };
})();
}
