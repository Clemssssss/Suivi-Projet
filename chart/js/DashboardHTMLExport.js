if (!window.DashboardHTMLExport) {
window.DashboardHTMLExport = (function() {
  'use strict';

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function cleanText(value) {
    return String(value == null ? '' : value)
      .replace(/\s+/g, ' ')
      .trim();
  }

  function safeFileText(value) {
    return cleanText(value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\-]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase();
  }

  function isVisible(node) {
    if (!node) return false;
    var style = window.getComputedStyle ? window.getComputedStyle(node) : null;
    if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) return false;
    return node.offsetParent !== null || (style && style.position === 'fixed');
  }

  function getFilterPills() {
    return Array.prototype.slice.call(document.querySelectorAll('#active-filters-summary .ffb-pill, #active-filters-summary .business-drill-pill'))
      .map(function(node) { return cleanText(node.textContent); })
      .filter(Boolean);
  }

  function collectKpis(selector, groupLabel) {
    return Array.prototype.slice.call(document.querySelectorAll(selector))
      .filter(isVisible)
      .map(function(node) {
        var label = cleanText((node.querySelector('.kpi-lbl, .business-kpi-label, .skpi-lbl') || {}).textContent || '');
        var value = cleanText((node.querySelector('.kpi-val, .business-kpi-value, .skpi-val') || {}).textContent || '');
        var sub = cleanText((node.querySelector('.kpi-sub, .business-kpi-sub, .skpi-sub') || {}).textContent || '');
        if (!label && !value) return null;
        return { group: groupLabel, label: label, value: value, sub: sub };
      })
      .filter(Boolean);
  }

  function collectVisibleCharts() {
    return Array.prototype.slice.call(document.querySelectorAll('.chart-card[data-chart-id]'))
      .filter(isVisible)
      .map(function(card) {
        var chartId = card.getAttribute('data-chart-id') || '';
        var titleNode = card.querySelector('.chart-title');
        var title = cleanText(titleNode ? titleNode.textContent.replace(/ⓘ/g, '') : chartId);
        var hint = cleanText((card.querySelector('.chart-hint') || {}).textContent || '');
        var canvas = card.querySelector('canvas');
        var image = '';
        try {
          if (canvas && typeof canvas.toDataURL === 'function' && canvas.width && canvas.height) {
            image = canvas.toDataURL('image/png', 1.0);
          }
        } catch (_) {}
        var analysisBlock = card.querySelector('.chart-analysis-block .ca-block-text');
        var analysis = analysisBlock ? cleanText(analysisBlock.textContent) : '';
        return {
          chartId: chartId,
          title: title || chartId || 'Graphique',
          hint: hint,
          analysis: analysis,
          image: image
        };
      })
      .filter(function(item) { return item.image || item.analysis || item.title; });
  }

  function getGlobalAnalysis() {
    var block = document.getElementById('analysis-text');
    return block ? cleanText(block.textContent) : '';
  }

  function getMetaRows() {
    var datasetMeta = (typeof window.DashboardDataTransparency !== 'undefined' && typeof window.DashboardDataTransparency.getDatasetMeta === 'function')
      ? window.DashboardDataTransparency.getDatasetMeta()
      : null;
    var projectCount = cleanText((document.getElementById('project-count') || {}).textContent || '');
    var rows = [];
    if (datasetMeta && datasetMeta.sourceName) rows.push('Source active: ' + datasetMeta.sourceName);
    if (projectCount) rows.push(projectCount);
    rows.push('Export HTML sécurisé: aucun dataset brut ni ligne projet n’est embarqué.');
    rows.push('Contenu limité aux KPI, filtres, analyses et captures de graphiques visibles.');
    return rows;
  }

  function buildHtml(payload) {
    var bootstrapScript = "(function(){var tabs=document.querySelectorAll('[data-tab]');var panels=document.querySelectorAll('[data-panel]');tabs.forEach(function(btn){btn.addEventListener('click',function(){tabs.forEach(function(x){x.classList.remove('active');});panels.forEach(function(x){x.classList.remove('active');});btn.classList.add('active');var panel=document.querySelector(\"[data-panel='\" + btn.getAttribute('data-tab') + \"']\");if(panel)panel.classList.add('active');});});})();";
    return '<!doctype html>' +
      '<html lang="fr"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<title>' + escapeHtml(payload.title) + '</title>' +
      '<style>' +
      ':root{--bg:#08111d;--card:#101b2b;--card2:#162235;--rim:rgba(255,255,255,.08);--brand:#00d4aa;--brand2:#38bdf8;--snow:#e8f1fb;--pale:#c5d3e1;--dust:#88a0b8;}' +
      '*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at top left, rgba(0,212,170,.12), transparent 26%),radial-gradient(circle at top right, rgba(56,189,248,.12), transparent 28%),var(--bg);color:var(--snow);font-family:system-ui,-apple-system,sans-serif;}' +
      '.page{max-width:1440px;margin:0 auto;padding:1.4rem}.hero,.tabs,.chips,.kpi-grid,.chart-grid{display:flex;flex-wrap:wrap;gap:.8rem}.hero{justify-content:space-between;align-items:flex-start;margin-bottom:1rem}.title{font-size:1.9rem;font-weight:800;margin:0}.sub{color:var(--dust);margin-top:.5rem;max-width:760px;line-height:1.6}.card,.chart-card{background:var(--card);border:1px solid var(--rim);border-radius:18px;box-shadow:0 18px 55px rgba(0,0,0,.25)}' +
      '.card{padding:1rem 1.1rem}.meta{display:grid;gap:.45rem;margin-top:1rem}.pill,.chip{display:inline-flex;align-items:center;padding:.42rem .72rem;border-radius:999px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04);font-size:.78rem;color:var(--pale)}.chip{cursor:pointer}.chip.active{background:rgba(0,212,170,.14);border-color:rgba(0,212,170,.34);color:#99f6e4}.tabs{margin:1rem 0}.tab-panel{display:none}.tab-panel.active{display:block}.kpi-group{margin-bottom:1rem}.kpi-group h2{font-size:1rem;margin:.2rem 0 .8rem;color:var(--brand)}.kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}.kpi-card{padding:1rem;border-radius:16px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06)}.kpi-label{font-size:.78rem;color:var(--dust);text-transform:uppercase;letter-spacing:.05em}.kpi-value{font-size:1.35rem;font-weight:800;color:var(--snow);margin-top:.45rem}.kpi-sub{font-size:.78rem;color:var(--pale);margin-top:.35rem}' +
      '.chart-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr))}.chart-card{padding:1rem}.chart-title{font-size:1rem;font-weight:700;margin:0 0 .35rem}.chart-hint{font-size:.8rem;color:var(--dust);margin-bottom:.8rem}.chart-image{width:100%;border-radius:14px;border:1px solid rgba(255,255,255,.06);background:#0b1422}.analysis{margin-top:.8rem;padding:.85rem;border-radius:14px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.05);color:var(--pale);line-height:1.55;font-size:.88rem}.kicker{font-size:.72rem;text-transform:uppercase;letter-spacing:.12em;color:var(--brand);font-weight:700;margin-bottom:.35rem}.notice{padding:1rem 1.1rem;background:rgba(255,183,77,.08);border:1px solid rgba(255,183,77,.2);border-radius:16px;color:#ffd98b;line-height:1.6}' +
      '@media(max-width:768px){.page{padding:1rem}.title{font-size:1.45rem}.tabs,.chips{gap:.5rem}.chip{width:100%;justify-content:center}}' +
      '</style></head><body><div class="page">' +
      '<div class="hero"><div><div class="kicker">Export HTML sécurisé</div><h1 class="title">' + escapeHtml(payload.title) + '</h1><div class="sub">' + escapeHtml(payload.subtitle) + '</div></div>' +
      '<div class="card"><div class="kicker">Export</div><div>' + escapeHtml(payload.generatedAt) + '</div></div></div>' +
      '<div class="notice">Ce fichier autonome ne contient ni dataset brut, ni lignes projet, ni accès réseau. Il embarque uniquement des indicateurs visibles, des textes d’analyse et des captures de graphiques agrégés.</div>' +
      '<div class="meta">' + payload.meta.map(function(item) { return '<div class="pill">' + escapeHtml(item) + '</div>'; }).join('') + '</div>' +
      '<div class="chips" id="tabs">' +
      '<button class="chip active" data-tab=\"resume\">Résumé</button>' +
      '<button class="chip" data-tab=\"charts\">Graphiques</button>' +
      '<button class="chip" data-tab=\"analysis\">Analyses</button>' +
      '</div>' +
      '<section class="tab-panel active" data-panel=\"resume\">' +
      payload.kpiGroups.map(function(group) {
        return '<div class="kpi-group"><h2>' + escapeHtml(group.label) + '</h2><div class="kpi-grid">' +
          group.items.map(function(item) {
            return '<article class="kpi-card"><div class="kpi-label">' + escapeHtml(item.label) + '</div><div class="kpi-value">' + escapeHtml(item.value) + '</div><div class="kpi-sub">' + escapeHtml(item.sub || '—') + '</div></article>';
          }).join('') + '</div></div>';
      }).join('') +
      '</section>' +
      '<section class="tab-panel" data-panel=\"charts\"><div class="chart-grid">' +
      payload.charts.map(function(chart) {
        return '<article class="chart-card"><h3 class="chart-title">' + escapeHtml(chart.title) + '</h3>' +
          '<div class="chart-hint">' + escapeHtml(chart.hint || 'Capture agrégée du graphique visible au moment de l’export') + '</div>' +
          (chart.image ? '<img class="chart-image" alt="' + escapeHtml(chart.title) + '" src="' + chart.image + '">' : '<div class="analysis">Aucune capture disponible pour ce graphique.</div>') +
          '</article>';
      }).join('') + '</div></section>' +
      '<section class="tab-panel" data-panel=\"analysis\">' +
      (payload.globalAnalysis ? '<article class="card"><div class="kicker">Analyse globale</div><div class="analysis">' + escapeHtml(payload.globalAnalysis) + '</div></article>' : '') +
      payload.charts.filter(function(chart) { return chart.analysis; }).map(function(chart) {
        return '<article class="card" style="margin-top:1rem;"><div class="kicker">' + escapeHtml(chart.title) + '</div><div class="analysis">' + escapeHtml(chart.analysis) + '</div></article>';
      }).join('') +
      '</section>' +
      '</div><script>' + bootstrapScript + '</script>' +
      '</body></html>';
  }

  function buildPayload() {
    var date = new Date();
    var title = 'Analyse interactive sécurisée du dashboard';
    var subtitle = 'Synthèse autonome exportée depuis le dashboard, limitée aux éléments agrégés visibles.';
    var filters = getFilterPills();
    var kpiGroups = [
      { label: 'KPIs principaux', items: collectKpis('.kpi-grid .kpi', 'KPIs principaux') },
      { label: 'Prise d’affaires / Performance', items: collectKpis('#biz-performance-kpis .business-kpi', 'Prise d’affaires / Performance') },
      { label: 'Pipe commercial', items: collectKpis('#biz-pipe-kpis .business-kpi', 'Pipe commercial') },
      { label: 'KPIs stratégiques', items: collectKpis('#strategic-kpis-bar .skpi-card', 'KPIs stratégiques') }
    ].filter(function(group) { return group.items.length; });

    var meta = getMetaRows();
    if (filters.length) {
      meta = meta.concat(filters.map(function(item) { return 'Filtre actif: ' + item; }));
    } else {
      meta.push('Filtre actif: aucun filtre fort');
    }

    return {
      title: title,
      subtitle: subtitle,
      generatedAt: date.toLocaleString('fr-FR'),
      meta: meta,
      kpiGroups: kpiGroups,
      charts: collectVisibleCharts(),
      globalAnalysis: getGlobalAnalysis()
    };
  }

  function downloadHtml() {
    var payload = buildPayload();
    var html = buildHtml(payload);
    var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    var fileName = 'dashboard_analyse_securisee_' + safeFileText(new Date().toISOString().slice(0, 10)) + '.html';
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
    if (typeof window.notify === 'function') {
      window.notify('Export HTML', 'Synthèse HTML sécurisée générée', 'success', 2200);
    }
  }

  function init() {
    var btn = document.getElementById('btn-export-html');
    if (!btn || btn._htmlExportBound) return;
    btn._htmlExportBound = true;
    btn.addEventListener('click', downloadHtml);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  return {
    exportHTML: downloadHtml
  };
})();
}
