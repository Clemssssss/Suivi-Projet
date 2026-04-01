/**
 * ════════════════════════════════════════════════════════════════
 *  CHART ANALYSIS v2.0 — Explications Dynamiques + Vue Tableau
 * ════════════════════════════════════════════════════════════════
 *
 *  v2.0 améliorations :
 *   • 35+ analyseurs spécifiques par graphique (contexte réel)
 *   • Ratios enrichis : CA/dossier, efficacité client, concentration
 *   • Toggle graphique ↔ tableau synthétique sur chaque chart
 *   • Projection prospective (ciblage N+1 depuis données N)
 *   • Analyse des pertes et opportunités manquées
 *
 *  API :
 *   ChartAnalysis.renderForChart(chartId, data)
 *   ChartAnalysis.renderAll(data)
 *   ChartAnalysis.getAnalysisText(chartId, data)  → string PDF-safe
 * ════════════════════════════════════════════════════════════════
 */

if (!window.ChartAnalysis) {
window.ChartAnalysis = (() => {
  'use strict';

  const TABLE_VIEW_STORAGE_KEY = 'dashboard.chart.tableView';
  const STYLE_STORAGE_KEY = 'dashboard.chart.styles';
  const _STYLE_APPLYING = new WeakSet();
  const _STYLE_SIGNATURES = new WeakMap();

  /* ──────────────────────────────────────────────────────────────
     HELPERS
  ────────────────────────────────────────────────────────────── */

  function _getCA(p, mode) {
    if (typeof Analytics !== 'undefined' && Analytics.getCAValue)
      return Analytics.getCAValue(p, mode || 'ca_etudie');
    return parseFloat(p['Bud']) || 0;
  }

  function _status(p) {
    return (typeof ProjectUtils !== 'undefined' && ProjectUtils.getStatus)
      ? ProjectUtils.getStatus(p)
      : (p['Statut'] || '').toLowerCase();
  }

  function _fmt(v) {
    if (!v || isNaN(v)) return '—';
    if (typeof ProjectUtils !== 'undefined' && ProjectUtils.formatMontant)
      return ProjectUtils.formatMontant(v, true);
    if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + 'M€';
    if (Math.abs(v) >= 1e3) return Math.round(v / 1e3) + 'k€';
    return Math.round(v) + '€';
  }

  function _pct(a, b) {
    if (!b) return null;
    return Math.round(((a - b) / b) * 100);
  }

  function _s(n) { return n > 1 ? 's' : ''; }

  function _resolveChart(chartId) {
    if (typeof Chart === 'undefined') return null;
    const canvas = _getChartCanvas(chartId);
    if (!canvas) return null;
    try {
      if (typeof Chart.getChart === 'function') return Chart.getChart(canvas) || null;
      if (Chart.instances) return Object.values(Chart.instances).find(i => i && i.canvas === canvas) || null;
    } catch (e) { return null; }
    return null;
  }

  function _formatVal(value) {
    const num = Number(value);
    if (!isFinite(num)) return null;
    if (Math.abs(num) <= 1 && num !== 0) return Math.round(num * 100) + '%';
    if (Math.abs(num) > 0 && Math.abs(num) <= 100) return num.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
    return _fmt(num);
  }

  function _storageGet(key, fallback) {
    try {
      const raw = window.localStorage ? localStorage.getItem(key) : null;
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function _storageSet(key, value) {
    try {
      if (window.localStorage) localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {}
  }

  function _storeTablePayload(payload) {
    const token = 'tv-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    try {
      if (window.localStorage) {
        localStorage.setItem(TABLE_VIEW_STORAGE_KEY, JSON.stringify(payload));
        localStorage.setItem(TABLE_VIEW_STORAGE_KEY + '.' + token, JSON.stringify(payload));
      }
    } catch (e) {}
    return token;
  }

  /* Année d'un projet selon champ date courant */
  function _year(p) {
    const fields = ['Date réception','Date de retour demandée','Décidé le '];
    for (const f of fields) {
      const raw = p[f];
      if (!raw) continue;
      const d = (typeof ProjectUtils !== 'undefined' && ProjectUtils.parseDate)
        ? ProjectUtils.parseDate(raw)
        : new Date(raw);
      if (d && !isNaN(d)) return d.getFullYear();
    }
    if (p['_annee']) return parseInt(p['_annee']);
    return null;
  }

  /* Groupe data par clé, retourne tableau trié par valeur desc */
  function _groupBy(data, keyFn, valFn) {
    const map = {};
    data.forEach(p => {
      const k = keyFn(p);
      if (!k) return;
      if (!map[k]) map[k] = { count: 0, ca: 0 };
      map[k].count++;
      map[k].ca += valFn ? valFn(p) : 0;
    });
    return Object.entries(map).sort((a, b) => b[1].ca - a[1].ca);
  }

  /* ──────────────────────────────────────────────────────────────
     TABLE BUILDER — lit Chart.js et génère une table HTML enrichie
  ────────────────────────────────────────────────────────────── */

  function _buildTableFromChart(chartId) {
    const chart = _resolveChart(chartId);
    if (!chart || !chart.data) return null;

    const labels = Array.isArray(chart.data.labels) ? chart.data.labels : [];
    const datasets = (chart.data.datasets || []).filter(ds => ds && Array.isArray(ds.data));
    if (!labels.length && !datasets.length) return null;

    const isMulti = datasets.length > 1;
    let rows = [];

    if (isMulti) {
      rows = labels.map((label, i) => {
        const cells = datasets.map(ds => {
          const raw = ds.data[i];
          const num = typeof raw === 'object' && raw !== null
            ? Number(raw.y != null ? raw.y : raw.x)
            : Number(raw);
          return _formatVal(num) || '—';
        });
        return { label: String(label || ''), cells };
      }).filter(r => r.label);
    } else if (datasets.length === 1) {
      const ds = datasets[0];
      const combined = labels.map((label, i) => {
        const raw = ds.data[i];
        const num = typeof raw === 'object' && raw !== null
          ? Number(raw.y != null ? raw.y : raw.x)
          : Number(raw);
        return { label: String(label || ''), val: isFinite(num) ? num : null };
      }).filter(r => r.label && r.val !== null);
      combined.sort((a, b) => b.val - a.val);
      rows = combined.map(r => ({ label: r.label, cells: [_formatVal(r.val) || '—'] }));
    }

    if (!rows.length) return null;

    const headers = isMulti
      ? ['Catégorie', ...datasets.map(ds => ds.label || 'Valeur')]
      : ['Catégorie', 'Valeur'];

    let thead = '<tr>' + headers.map((h, i) =>
      `<th data-col="${i}" title="Cliquer pour trier">${h}</th>`
    ).join('') + '</tr>';

    let tbody = '';
    rows.forEach(r => {
      tbody += `<tr><td class="ca-dt-label">${r.label}</td>`;
      r.cells.forEach(c => { tbody += `<td class="ca-dt-val">${c}</td>`; });
      tbody += '</tr>';
    });

    return `
      <div class="ca-table-controls">
        <input class="ca-search-input" type="text" placeholder="🔍 Rechercher dans le tableau…" autocomplete="off">
        <span class="ca-row-count"></span>
        <button class="ca-open-table-btn" title="Ouvrir ce tableau dans un nouvel onglet">↗ Pleine page</button>
        <button class="ca-export-btn" title="Exporter vers Excel">⬇ Excel</button>
      </div>
      <div class="ca-scroll-wrap">
        <div class="ca-top-scroll"><div class="ca-top-scroll-inner"></div></div>
        <div class="ca-table-scroll">
          <table class="ca-data-table">
            <thead>${thead}</thead>
            <tbody>${tbody}</tbody>
          </table>
        </div>
      </div>`;
  }

  /* ──────────────────────────────────────────────────────────────
     TABLE FEATURES — tri / recherche / dual-scroll / export Excel
  ────────────────────────────────────────────────────────────── */

  function _initTableFeatures(tableView, chartId) {
    const table      = tableView.querySelector('.ca-data-table');
    const searchInput= tableView.querySelector('.ca-search-input');
    const exportBtn  = tableView.querySelector('.ca-export-btn');
    const openBtn    = tableView.querySelector('.ca-open-table-btn');
    const rowCount   = tableView.querySelector('.ca-row-count');
    const topScroll  = tableView.querySelector('.ca-top-scroll');
    const topInner   = tableView.querySelector('.ca-top-scroll-inner');
    const tblScroll  = tableView.querySelector('.ca-table-scroll');
    if (!table) return;

    const tbody = table.querySelector('tbody');
    const allRows = () => Array.from(tbody.querySelectorAll('tr'));

    /* ── Dual scrollbar (top + bottom sync) ── */
    function _syncScrollWidth() {
      if (topInner) topInner.style.width = table.scrollWidth + 'px';
    }
    _syncScrollWidth();
    if (topScroll && tblScroll) {
      let _lockTop = false, _lockBot = false;
      topScroll.addEventListener('scroll', () => {
        if (_lockTop) return;
        _lockBot = true;
        tblScroll.scrollLeft = topScroll.scrollLeft;
        requestAnimationFrame(() => { _lockBot = false; });
      });
      tblScroll.addEventListener('scroll', () => {
        if (_lockBot) return;
        _lockTop = true;
        topScroll.scrollLeft = tblScroll.scrollLeft;
        requestAnimationFrame(() => { _lockTop = false; });
      });
      try { new ResizeObserver(_syncScrollWidth).observe(table); } catch(e) {}
    }

    /* ── Update row counter ── */
    function _updateCount() {
      if (!rowCount) return;
      const visible = allRows().filter(r => r.style.display !== 'none').length;
      const total   = allRows().length;
      rowCount.textContent = visible < total ? `${visible} / ${total} lignes` : `${total} lignes`;
    }
    _updateCount();

    /* ── Sort on header click ── */
    const ths = Array.from(table.querySelectorAll('thead th'));
    ths.forEach((th, colIdx) => {
      th.addEventListener('click', () => {
        const cur = th.dataset.sort;
        ths.forEach(t => { delete t.dataset.sort; });
        th.dataset.sort = cur === 'asc' ? 'desc' : 'asc';
        const asc = th.dataset.sort === 'asc';
        const rows = allRows();
        rows.sort((a, b) => {
          const av = (a.cells[colIdx]?.textContent || '').trim();
          const bv = (b.cells[colIdx]?.textContent || '').trim();
          const an = parseFloat(av.replace(/[^\d.,-]/g, '').replace(',', '.'));
          const bn = parseFloat(bv.replace(/[^\d.,-]/g, '').replace(',', '.'));
          if (isFinite(an) && isFinite(bn)) return asc ? an - bn : bn - an;
          return asc ? av.localeCompare(bv, 'fr') : bv.localeCompare(av, 'fr');
        });
        rows.forEach(r => tbody.appendChild(r));
      });
    });

    /* ── Search / filter rows ── */
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        const q = searchInput.value.toLowerCase().trim();
        allRows().forEach(row => {
          row.style.display = (!q || row.textContent.toLowerCase().includes(q)) ? '' : 'none';
        });
        _updateCount();
      });
    }

    /* ── Export Excel (.xls HTML format, pas de CDN requis) ── */
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const hdrs = ths.map(th => th.textContent.replace(/[↑↓]$/,'').trim());
        const visibleRows = allRows().filter(r => r.style.display !== 'none');

        const thStyle = 'background:#00836b;color:#ffffff;font-weight:bold;padding:6px 10px;border:1px solid #007a5e;white-space:nowrap;';
        const tdStyleEven = 'background:#f0faf7;padding:5px 8px;border:1px solid #d4e8e0;';
        const tdStyleOdd  = 'background:#ffffff;padding:5px 8px;border:1px solid #d4e8e0;';

        let tblHtml = '<tr>' + hdrs.map((h,i) =>
          `<th style="${thStyle}text-align:${i===0?'left':'right'};">${h}</th>`
        ).join('') + '</tr>';

        visibleRows.forEach((row, i) => {
          const tdStyle = i % 2 === 0 ? tdStyleEven : tdStyleOdd;
          const cells = Array.from(row.cells).map((td, j) =>
            `<td style="${tdStyle}text-align:${j===0?'left':'right'};">${td.textContent.trim()}</td>`
          );
          tblHtml += `<tr>${cells.join('')}</tr>`;
        });

        const xlsHtml = [
          '<html xmlns:o="urn:schemas-microsoft-com:office:office"',
          '      xmlns:x="urn:schemas-microsoft-com:office:excel">',
          '<head><meta charset="UTF-8">',
          '<xml><x:ExcelWorkbook><x:ExcelWorksheets>',
          `<x:ExcelWorksheet><x:Name>${chartId}</x:Name>`,
          '<x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>',
          '</x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml>',
          '</head><body>',
          `<table border="1" cellspacing="0">${tblHtml}</table>`,
          '</body></html>',
        ].join('\n');

        const blob = new Blob(['\uFEFF' + xlsHtml], { type: 'application/vnd.ms-excel;charset=utf-8' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `export-${chartId}.xls`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });
    }

    if (openBtn) {
      openBtn.addEventListener('click', () => {
        _openTableInNewTab({
          source: 'chart-analysis',
          title: _chartTitle(chartId),
          subtitle: 'Vue synthétique du graphique',
          meta: _buildAnalysisMetaPayload(chartId),
          headers: ths.map(th => th.textContent.replace(/[↑↓▲▼↕]$/,'').trim()),
          rows: allRows()
            .filter(r => r.style.display !== 'none')
            .map(row => Array.from(row.cells).map(cell => cell.textContent.trim()))
        });
      });
    }
  }

  function _chartTitle(chartId) {
    const card = document.querySelector('[data-chart-id="' + chartId + '"]');
    const title = card && card.querySelector('.chart-title');
    if (title) return title.textContent.replace(/\s+/g, ' ').trim();
    const canvas = _getChartCanvas(chartId);
    if (!canvas) return chartId;
    const label = canvas.closest('.chart-card')?.querySelector('.chart-title');
    return label ? label.textContent.replace(/\s+/g, ' ').trim() : chartId;
  }

  function _getChartCard(chartId) {
    const byAttr = document.querySelector('.chart-card[data-chart-id="' + chartId + '"]')
      || document.querySelector('[data-chart-id="' + chartId + '"]');
    if (byAttr) return byAttr;
    const canvas = document.getElementById(chartId);
    return canvas ? canvas.closest('.chart-card, [data-chart-id]') : null;
  }

  function _getChartCanvas(chartId) {
    const direct = document.getElementById(chartId);
    if (direct) return direct;
    const card = _getChartCard(chartId);
    return card ? card.querySelector('canvas[id]') : null;
  }

  function _buildAnalysisMetaPayload(chartId) {
    const block = document.getElementById(`ca-block-${chartId}`);
    if (!block) return [];
    return Array.from(block.querySelectorAll('.ca-block-meta span')).map(function(item) {
      return item.textContent.replace(/\s+/g, ' ').trim();
    }).filter(Boolean);
  }

  function _openTableInNewTab(payload) {
    const finalPayload = Object.assign({ generatedAt: new Date().toISOString() }, payload);
    const token = _storeTablePayload(finalPayload);
    window.open('table-view.html?ts=' + Date.now() + '&key=' + encodeURIComponent(token), '_blank', 'noopener');
  }

  function _applyChartStyle(chartId, styleCfg) {
    const chart = _resolveChart(chartId);
    if (!chart) return;
    if (_STYLE_APPLYING.has(chart)) return;

    _STYLE_APPLYING.add(chart);

    const palettes = {
      emerald: ['#00d4aa', '#0099ff', '#8b78f8', '#f5b740', '#ff4d6d', '#10b981'],
      sunset: ['#fb7185', '#f97316', '#f59e0b', '#facc15', '#38bdf8', '#6366f1'],
      ocean: ['#22d3ee', '#38bdf8', '#0ea5e9', '#0284c7', '#14b8a6', '#34d399'],
      graphite: ['#e2e8f0', '#94a3b8', '#64748b', '#cbd5e1', '#14b8a6', '#f59e0b']
    };
    const colors = palettes[styleCfg.palette] || palettes.emerald;
    try {
      (chart.data.datasets || []).forEach(function(ds, index) {
        const color = colors[index % colors.length];
        ds.borderColor = color;
        ds.backgroundColor = Array.isArray(ds.data)
          ? ds.data.map(function(_, idx) { return colors[idx % colors.length]; })
          : color;
        ds.pointBackgroundColor = color;
        ds.pointBorderColor = color;
      });

      chart.options.plugins = chart.options.plugins || {};
      chart.options.plugins.legend = chart.options.plugins.legend || {};
      chart.options.plugins.legend.display = !!styleCfg.legend;
      chart.options.plugins.legend.labels = chart.options.plugins.legend.labels || {};
      chart.options.plugins.legend.labels.color = '#dce8f5';

      const scales = chart.options.scales || {};
      Object.keys(scales).forEach(function(key) {
        const scale = scales[key] || {};
        scale.grid = scale.grid || {};
        scale.ticks = scale.ticks || {};
        scale.title = scale.title || {};
        scale.grid.display = !!styleCfg.grid;
        scale.grid.color = styleCfg.grid ? 'rgba(148,163,184,.14)' : 'rgba(0,0,0,0)';
        scale.ticks.color = '#c0d0e0';
        if (key === 'x' && styleCfg.xTitle != null) {
          scale.title.display = !!String(styleCfg.xTitle).trim();
          scale.title.text = String(styleCfg.xTitle || '').trim();
          scale.title.color = '#94a3b8';
        }
        if (key === 'y' && styleCfg.yTitle != null) {
          scale.title.display = !!String(styleCfg.yTitle).trim();
          scale.title.text = String(styleCfg.yTitle || '').trim();
          scale.title.color = '#94a3b8';
        }
      });
      chart.update('none');

      const styleMap = _storageGet(STYLE_STORAGE_KEY, {});
      styleMap[chartId] = styleCfg;
      _storageSet(STYLE_STORAGE_KEY, styleMap);
    } catch (err) {
      console.error('[ChartAnalysis] apply style failed for', chartId, err);
    } finally {
      _STYLE_APPLYING.delete(chart);
    }
  }

  function _getChartStyle(chartId) {
    const map = _storageGet(STYLE_STORAGE_KEY, {});
    return Object.assign({
      palette: 'emerald',
      legend: true,
      grid: true,
      xTitle: '',
      yTitle: ''
    }, map[chartId] || {});
  }

  function _openStyleEditor(chartId) {
    const current = _getChartStyle(chartId);
    const overlay = document.createElement('div');
    overlay.className = 'ca-style-modal-overlay';
    const modal = document.createElement('div');
    modal.className = 'ca-style-modal';
    modal.innerHTML = `
      <div class="ca-style-modal-head">
        <div class="ca-style-modal-title">Style du graphique</div>
        <button class="ca-style-secondary" data-role="close">Fermer</button>
      </div>
      <div class="ca-style-modal-body">
        <div class="ca-style-row">
          <label>Palette</label>
          <select data-field="palette">
            <option value="emerald"${current.palette === 'emerald' ? ' selected' : ''}>Emerald</option>
            <option value="sunset"${current.palette === 'sunset' ? ' selected' : ''}>Sunset</option>
            <option value="ocean"${current.palette === 'ocean' ? ' selected' : ''}>Ocean</option>
            <option value="graphite"${current.palette === 'graphite' ? ' selected' : ''}>Graphite</option>
          </select>
        </div>
        <div class="ca-style-row">
          <label>Nom graduation X</label>
          <input data-field="xTitle" type="text" value="${current.xTitle || ''}" placeholder="Ex. Mois / Client / Zone">
        </div>
        <div class="ca-style-row">
          <label>Nom graduation Y</label>
          <input data-field="yTitle" type="text" value="${current.yTitle || ''}" placeholder="Ex. CA (€) / Volume">
        </div>
        <div class="ca-style-row">
          <label>Affichage</label>
          <div class="ca-style-checks">
            <label class="ca-style-check"><input data-field="legend" type="checkbox"${current.legend ? ' checked' : ''}> Légende</label>
            <label class="ca-style-check"><input data-field="grid" type="checkbox"${current.grid ? ' checked' : ''}> Graduations / grille</label>
          </div>
        </div>
      </div>
      <div class="ca-style-modal-foot">
        <button class="ca-style-secondary" data-role="reset">Réinitialiser</button>
        <button class="ca-style-primary" data-role="apply">Appliquer</button>
      </div>
    `;

    function close() {
      overlay.remove();
      modal.remove();
    }

    overlay.addEventListener('click', close);
    modal.querySelector('[data-role="close"]').addEventListener('click', close);
    modal.querySelector('[data-role="reset"]').addEventListener('click', function() {
      _applyChartStyle(chartId, {
        palette: 'emerald',
        legend: true,
        grid: true,
        xTitle: '',
        yTitle: ''
      });
      close();
    });
    modal.querySelector('[data-role="apply"]').addEventListener('click', function() {
      _applyChartStyle(chartId, {
        palette: modal.querySelector('[data-field="palette"]').value,
        legend: !!modal.querySelector('[data-field="legend"]').checked,
        grid: !!modal.querySelector('[data-field="grid"]').checked,
        xTitle: modal.querySelector('[data-field="xTitle"]').value || '',
        yTitle: modal.querySelector('[data-field="yTitle"]').value || ''
      });
      close();
    });

    document.body.appendChild(overlay);
    document.body.appendChild(modal);
  }

  function _toggleGlobalMode() {
    if (typeof AE === 'undefined' || typeof AE.getCAMode !== 'function' || typeof AE.setCAMode !== 'function') return;
    const current = AE.getCAMode();
    const next = current === 'Bud' ? 'ca_gagne' : 'Bud';
    AE.setCAMode(next);
    if (typeof update === 'function') update();
  }

  function _formatAnalysisMarkup(text) {
    if (!text) return '';
    const normalized = text.replace(/&nbsp;·&nbsp;/g, ' · ');
    const lines = normalized.split(/<br\s*\/?>/i).map(function(line) { return line.trim(); }).filter(Boolean);
    if (!lines.length) return normalized;

    let lead = '';
    const points = [];
    lines.forEach(function(line) {
      const fragments = line.split(/\s*[·•]\s*/).map(function(part) { return part.trim(); }).filter(Boolean);
      if (!lead && fragments.length) {
        lead = fragments.shift();
      }
      points.push.apply(points, fragments.length ? fragments : (lead ? [] : [line]));
    });

    if (!lead && points.length) lead = points.shift();
    if (!lead) return normalized;

    return `
      <div class="ca-analysis-lead">${lead}</div>
      ${points.length ? `<div class="ca-analysis-grid">${points.map(function(point) {
        return `<div class="ca-analysis-point">${point}</div>`;
      }).join('')}</div>` : ''}
    `;
  }

  /* ──────────────────────────────────────────────────────────────
     PROJECTION N+1 — insights prospectifs depuis données N
  ────────────────────────────────────────────────────────────── */

  function _projectionInsight(data) {
    if (!data || data.length < 5) return null;

    // Trouver l'année la plus récente avec au moins 5 projets décidés
    const byYear = {};
    data.forEach(p => {
      const y = _year(p);
      if (!y) return;
      if (!byYear[y]) byYear[y] = { won: [], lost: [], all: [] };
      byYear[y].all.push(p);
      if (_status(p) === 'obtenu') byYear[y].won.push(p);
      if (_status(p) === 'perdu')  byYear[y].lost.push(p);
    });

    const years = Object.keys(byYear).map(Number).sort((a, b) => b - a);
    if (!years.length) return null;

    const refYear = years.find(y => byYear[y].won.length + byYear[y].lost.length >= 3) || years[0];
    const ref = byYear[refYear];
    if (!ref) return null;

    const nextYear = refYear + 1;
    const decided  = ref.won.length + ref.lost.length;
    const conv     = decided > 0 ? Math.round(ref.won.length / decided * 100) : 0;

    // Top clients de l'année de référence
    const clientCA = {};
    const clientCount = {};
    ref.won.forEach(p => {
      const c = (p['Client'] || '').trim();
      if (!c) return;
      clientCA[c]    = (clientCA[c] || 0)    + _getCA(p, 'ca_gagne');
      clientCount[c] = (clientCount[c] || 0) + 1;
    });
    const topClients = Object.entries(clientCA)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([c, ca]) => `<strong>${c}</strong> (${_fmt(ca)}, ${clientCount[c]} dossier${_s(clientCount[c])})`);

    // Top zones
    const zoneCA = {};
    ref.won.forEach(p => {
      const z = (p['Zone Géographique'] || '').trim();
      if (!z) return;
      zoneCA[z] = (zoneCA[z] || 0) + _getCA(p, 'ca_gagne');
    });
    const topZone = Object.entries(zoneCA).sort((a, b) => b[1] - a[1])[0];

    // Mois pic de l'année de référence
    const byMonth = {};
    ref.won.forEach(p => {
      const raw = p['Date réception'];
      if (!raw) return;
      const d = (typeof ProjectUtils !== 'undefined' && ProjectUtils.parseDate)
        ? ProjectUtils.parseDate(raw)
        : new Date(raw);
      if (!d || isNaN(d)) return;
      const m = d.getMonth();
      byMonth[m] = (byMonth[m] || 0) + 1;
    });
    const monthNames = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Aoû','Sep','Oct','Nov','Déc'];
    const peakMonth = Object.entries(byMonth).sort((a, b) => b[1] - a[1])[0];

    const lines = [
      `🔮 <strong>Projection ${nextYear}</strong> — basée sur ${refYear} (${ref.won.length} obtenus, conv. ${conv}%).`,
      topClients.length ? `🎯 Clients à prioriser : ${topClients.join(' · ')}.` : '',
      topZone ? `🌍 Zone la plus rentable en ${refYear} : <strong>${topZone[0]}</strong> (${_fmt(topZone[1])}).` : '',
      peakMonth ? `📅 Pic historique : <strong>${monthNames[Number(peakMonth[0])]}</strong> — concentrer les relances.` : '',
    ];

    return lines.filter(Boolean).join('<br>');
  }

  function _toChartNumber(raw) {
    const value = typeof raw === 'object' && raw !== null ? Number(raw.y != null ? raw.y : raw.x) : Number(raw);
    return isFinite(value) ? value : null;
  }

  function _summarizeChartData(chartId) {
    const chart = _resolveChart(chartId);
    if (!chart || !chart.data) return null;

    const labels = Array.isArray(chart.data.labels) ? chart.data.labels.map(function(label) {
      return String(label == null ? '' : label).trim();
    }).filter(Boolean) : [];
    const datasets = (chart.data.datasets || []).filter(function(ds) {
      return ds && Array.isArray(ds.data);
    }).map(function(ds, datasetIndex) {
      const points = ds.data.map(function(raw, index) {
        return {
          index: index,
          label: labels[index] || ('#' + (index + 1)),
          value: _toChartNumber(raw)
        };
      }).filter(function(point) { return point.value !== null; });
      const total = points.reduce(function(sum, point) { return sum + point.value; }, 0);
      const top = points.slice().sort(function(a, b) { return b.value - a.value; })[0] || null;
      return {
        index: datasetIndex,
        label: ds.label || 'Valeur',
        total: total,
        points: points,
        top: top
      };
    });

    if (!datasets.length) return null;

    const aggregate = {};
    datasets.forEach(function(ds) {
      ds.points.forEach(function(point) {
        aggregate[point.label] = (aggregate[point.label] || 0) + point.value;
      });
    });

    const categories = Object.keys(aggregate).map(function(label) {
      return { label: label, value: aggregate[label] };
    }).sort(function(a, b) { return b.value - a.value; });

    return {
      chart: chart,
      labels: labels,
      datasets: datasets,
      categories: categories,
      total: categories.reduce(function(sum, item) { return sum + item.value; }, 0),
      topCategory: categories[0] || null,
      secondCategory: categories[1] || null,
      topDataset: datasets.slice().sort(function(a, b) { return b.total - a.total; })[0] || null
    };
  }

  function _chartDrivenBusinessAnalysis(chartId, data, options) {
    options = options || {};
    const summary = _summarizeChartData(chartId);
    if (!summary || !summary.categories.length) return null;

    const top = summary.topCategory;
    const second = summary.secondCategory;
    const topShare = summary.total > 0 ? Math.round(top.value / summary.total * 100) : null;
    const lines = [];

    if (options.emphasis === 'time') {
      lines.push(`📅 Point haut : <strong>${top.label}</strong> (${_formatVal(top.value) || _fmt(top.value)}).`);
      if (second) {
        const delta = second.value !== 0 ? _pct(top.value, second.value) : null;
        lines.push(delta !== null
          ? `📈 Écart avec le 2e point : <strong>${delta >= 0 ? '+' : ''}${delta}%</strong> face à <strong>${second.label}</strong>.`
          : `📊 2e point : <strong>${second.label}</strong> (${_formatVal(second.value) || _fmt(second.value)}).`);
      }
    } else {
      lines.push(`🏆 Leader visible : <strong>${top.label}</strong> (${_formatVal(top.value) || _fmt(top.value)}).`);
      if (second) {
        const gap = top.value - second.value;
        lines.push(`📊 2e niveau : <strong>${second.label}</strong> (${_formatVal(second.value) || _fmt(second.value)}) — écart ${_formatVal(gap) || _fmt(gap)}.`);
      }
    }

    if (summary.datasets.length > 1 && summary.topDataset) {
      lines.push(`📚 Série dominante : <strong>${summary.topDataset.label}</strong> (${_formatVal(summary.topDataset.total) || _fmt(summary.topDataset.total)}).`);
    }

    if (topShare !== null) {
      lines.push(
        topShare >= 45
          ? `⚠️ Concentration marquée : <strong>${top.label}</strong> pèse ${topShare}% du total affiché.`
          : `🧭 Répartition sur <strong>${summary.categories.length}</strong> catégorie${_s(summary.categories.length)} avec un leader à ${topShare}%.`
      );
    }

    if (data && data.length) {
      const offers = data.filter(function(p) { return _status(p) === 'offre'; }).length;
      const won = data.filter(function(p) { return _status(p) === 'obtenu'; }).length;
      if (options.family === 'pipeline') {
        lines.push(`💡 Lecture pipe : <strong>${offers}</strong> offre${_s(offers)} active${_s(offers)} dans le périmètre visible.`);
      } else if (options.family === 'performance') {
        lines.push(`💡 Lecture performance : <strong>${won}</strong> projet${_s(won)} gagné${_s(won)} pour comparer les écarts entre catégories.`);
      }
    }

    if (options.emphasis === 'time' && summary.categories.length >= 3) {
      const last = summary.categories[summary.categories.length - 1] || null;
      const prev = summary.categories[summary.categories.length - 2] || null;
      if (last && prev && prev.value > 0) {
        const trend = _pct(last.value, prev.value);
        if (trend !== null) {
          lines.push(
            trend <= -20
              ? `🎯 Action : investiguer la baisse récente sur <strong>${last.label}</strong> (${trend}%) avant qu’elle ne s’installe.`
              : trend >= 20
              ? `🚀 Action : capitaliser sur la dynamique de <strong>${last.label}</strong> (+${trend}%) et répliquer les leviers du mois.`
              : `🧩 Action : tendance courte stable, utile pour consolider avant de changer les priorités.`
          );
        }
      }
    } else if (options.family === 'pipeline') {
      lines.push(
        topShare !== null && topShare >= 45
          ? `🎯 Action : sécuriser rapidement <strong>${top.label}</strong> puis ouvrir 1 à 2 relais secondaires pour réduire la dépendance.`
          : `🎯 Action : cibler d’abord <strong>${top.label}</strong> puis le 2e niveau pour convertir plus vite le pipe visible.`
      );
    } else if (options.family === 'performance') {
      lines.push(
        topShare !== null && topShare >= 45
          ? `🎯 Action : protéger la catégorie forte <strong>${top.label}</strong> tout en lançant un plan de rattrapage sur les catégories de queue.`
          : `🎯 Action : dupliquer les pratiques de <strong>${top.label}</strong> sur les catégories sous le 2e niveau pour lisser la performance.`
      );
    }

    return lines.filter(Boolean).join(' &nbsp;·&nbsp; ');
  }

  /* ──────────────────────────────────────────────────────────────
     RATIO CLIENT — analyse enrichie avec CA/dossier
  ────────────────────────────────────────────────────────────── */

  function _clientRatioTable(data, topN) {
    topN = topN || 8;
    const clients = {};
    data.forEach(p => {
      const c = (p['Client'] || '').trim();
      if (!c) return;
      if (!clients[c]) clients[c] = { won: 0, lost: 0, offer: 0, caWon: 0, caTotal: 0 };
      const st = _status(p);
      const ca = _getCA(p, 'ca_etudie');
      clients[c].caTotal += ca;
      if (st === 'obtenu') { clients[c].won++;  clients[c].caWon += _getCA(p, 'ca_gagne'); }
      if (st === 'perdu')   clients[c].lost++;
      if (st === 'offre')   clients[c].offer++;
    });

    return Object.entries(clients)
      .map(([name, d]) => {
        const decided  = d.won + d.lost;
        const conv     = decided > 0 ? Math.round(d.won / decided * 100) : null;
        const avgWon   = d.won > 0 ? d.caWon / d.won : 0;
        return { name, ...d, decided, conv, avgWon };
      })
      .sort((a, b) => b.caWon - a.caWon)
      .slice(0, topN);
  }

  /* ──────────────────────────────────────────────────────────────
     ANALYSEURS SPÉCIFIQUES par graphique
  ────────────────────────────────────────────────────────────── */

  const _ANALYZERS = {

    /* ── TENDANCE MENSUELLE ── */
    'chart-monthly': (data) => {
      const byMonth = {};
      data.forEach(p => {
        const raw = p['Date réception'];
        if (!raw) return;
        const d = (typeof ProjectUtils !== 'undefined' && ProjectUtils.parseDate)
          ? ProjectUtils.parseDate(raw) : new Date(raw);
        if (!d || isNaN(d)) return;
        const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
        byMonth[key] = (byMonth[key] || 0) + _getCA(p, 'ca_etudie');
      });
      const months = Object.keys(byMonth).sort();
      if (months.length < 2) return null;
      const last = byMonth[months[months.length-1]];
      const prev = byMonth[months[months.length-2]];
      const delta = _pct(last, prev);
      const peak = months.reduce((a, b) => byMonth[a] > byMonth[b] ? a : b);
      const avg  = Object.values(byMonth).reduce((a,b)=>a+b,0) / months.length;
      return [
        delta !== null
          ? (delta >= 0
            ? `📈 Hausse de <strong>+${delta}%</strong> sur le dernier mois.`
            : `📉 Baisse de <strong>${delta}%</strong> sur le dernier mois.`)
          : '',
        `🏆 Mois record : <strong>${peak}</strong> (${_fmt(byMonth[peak])}).`,
        `📊 ${months.length} mois · moyenne <strong>${_fmt(avg)}</strong>/mois.`,
      ].filter(Boolean).join(' &nbsp;·&nbsp; ');
    },

    /* ── CA PAR ANNÉE ── */
    'chart-ca-year': (data) => {
      const byYear = {};
      data.forEach(p => {
        const y = _year(p);
        if (!y) return;
        byYear[y] = (byYear[y]||0) + _getCA(p,'ca_etudie');
      });
      const entries = Object.entries(byYear).sort((a,b)=>a[0]-b[0]);
      if (entries.length < 2) return null;
      const last = entries[entries.length-1];
      const prev = entries[entries.length-2];
      const delta = _pct(Number(last[1]), Number(prev[1]));
      const proj  = _projectionInsight(data);
      return [
        delta !== null
          ? (delta >= 0
            ? `📈 <strong>${last[0]}</strong> : +${delta}% vs ${prev[0]} (${_fmt(last[1])} vs ${_fmt(prev[1])}).`
            : `📉 <strong>${last[0]}</strong> : ${delta}% vs ${prev[0]} (${_fmt(last[1])} vs ${_fmt(prev[1])}).`)
          : '',
        proj || '',
      ].filter(Boolean).join('<br>');
    },

    'chart-ca-by-year-v2': (data) => {
      return _ANALYZERS['chart-ca-year'](data);
    },

    /* ── PROJETS PERDUS ── */
    'chart-perdu': (data) => {
      const perdu = data.filter(p => _status(p) === 'perdu');
      if (!perdu.length) return '✅ Aucun projet perdu dans la sélection actuelle.';
      const byClient = {};
      const byClientCA = {};
      perdu.forEach(p => {
        const c = (p['Client'] || 'N/A').trim();
        byClient[c]   = (byClient[c]||0)   + 1;
        byClientCA[c] = (byClientCA[c]||0) + _getCA(p,'ca_etudie');
      });
      const topCount = Object.entries(byClient).sort((a,b)=>b[1]-a[1])[0];
      const topCA    = Object.entries(byClientCA).sort((a,b)=>b[1]-a[1])[0];
      const decided  = data.filter(p=>['obtenu','perdu'].includes(_status(p))).length;
      const tauxPerte = decided > 0 ? Math.round(perdu.length/decided*100) : 0;
      const caPerdu  = perdu.reduce((s,p)=>s+_getCA(p,'ca_etudie'),0);
      return [
        tauxPerte > 60
          ? `⚠️ Taux de perte élevé : <strong>${tauxPerte}%</strong> — analyse approfondie recommandée.`
          : `📊 Taux de perte : <strong>${tauxPerte}%</strong> sur ${decided} projets décidés.`,
        `💸 CA perdu total : <strong>${_fmt(caPerdu)}</strong>.`,
        topCount ? `⚠️ Client avec le plus de pertes : <strong>${topCount[0]}</strong> (${topCount[1]} projet${_s(topCount[1])}).` : '',
        topCA && topCA[0] !== topCount[0] ? `💸 CA perdu maximal : <strong>${topCA[0]}</strong> (${_fmt(topCA[1])}).` : '',
        `💡 Analyser les conditions perdantes chez <strong>${topCount?.[0]}</strong> pour cibler les améliorations.`,
      ].filter(Boolean).join(' &nbsp;·&nbsp; ');
    },

    /* ── PERTES CLIENT ── */
    'chart-pertes-client': (data) => {
      return _ANALYZERS['chart-perdu'](data);
    },

    /* ── PROJETS OBTENUS ── */
    'chart-obtenu': (data) => {
      const obtenus = data.filter(p => _status(p) === 'obtenu');
      if (!obtenus.length) return '📭 Aucun projet obtenu dans la sélection actuelle.';
      const ratios = _clientRatioTable(data, 5);
      const top = ratios[0];
      const caTotal = obtenus.reduce((s,p)=>s+_getCA(p,'ca_gagne'),0);
      const nClients = new Set(obtenus.map(p=>(p['Client']||'').trim()).filter(Boolean)).size;
      const conc = top && caTotal > 0 ? Math.round(top.caWon/caTotal*100) : 0;
      return [
        conc > 50
          ? `⚠️ <strong>${top.name}</strong> représente ${conc}% du CA gagné — risque de dépendance.`
          : top
          ? `🏆 Leader : <strong>${top.name}</strong> — ${top.won} dossier${_s(top.won)} · ${_fmt(top.caWon)} · conv. ${top.conv ?? '—'}%.`
          : '',
        `💰 CA total gagné : <strong>${_fmt(caTotal)}</strong> sur ${obtenus.length} projets.`,
        nClients >= 5
          ? `✅ ${nClients} clients différents — bonne diversification.`
          : `⚠️ Seulement ${nClients} client${_s(nClients)} — diversification à améliorer.`,
        top && top.avgWon > 0 ? `📐 CA moyen/dossier (leader) : <strong>${_fmt(top.avgWon)}</strong>.` : '',
      ].filter(Boolean).join(' &nbsp;·&nbsp; ');
    },

    /* ── CA PAR SOCIÉTÉ TOP 8 ── */
    'chart-ca-company': (data) => {
      const ratios = _clientRatioTable(data, 8);
      if (!ratios.length) return null;
      const top = ratios[0];
      const totalCA = ratios.reduce((s,r)=>s+r.caWon,0) || ratios.reduce((s,r)=>s+r.caTotal,0);
      const topPct  = totalCA > 0 ? Math.round((top.caWon||top.caTotal)/totalCA*100) : 0;
      const top3 = ratios.slice(0,3).map(r=>`${r.name} ${_fmt(r.caWon||r.caTotal)}`).join(' · ');
      return [
        topPct > 40
          ? `⚠️ <strong>${top.name}</strong> représente ${topPct}% du CA — risque de concentration.`
          : `🏆 <strong>${top.name}</strong> — ${_fmt(top.caWon||top.caTotal)} · ${top.won} dossier${_s(top.won)} · conv. ${top.conv ?? '—'}%.`,
        top.won > 0 ? `📐 CA moyen par dossier gagné : <strong>${_fmt(top.avgWon)}</strong>.` : '',
        `💡 Top 3 : ${top3}.`,
      ].filter(Boolean).join(' &nbsp;·&nbsp; ');
    },

    /* ── CA CLIENT (horizontal) ── */
    'chart-ca-client': (data) => {
      return _ANALYZERS['chart-ca-company'](data);
    },

    /* ── TOP CLIENTS CA GAGNÉ ── */
    'chart-top-clients-ca': (data) => {
      const ratios = _clientRatioTable(data, 5);
      if (!ratios.length) return null;
      const top = ratios[0];
      return [
        `🏆 <strong>${top.name}</strong> — CA gagné ${_fmt(top.caWon)} · ${top.won} dossier${_s(top.won)} · CA moyen <strong>${_fmt(top.avgWon)}</strong>.`,
        top.conv !== null ? `🎯 Taux de conversion : <strong>${top.conv}%</strong> (${top.won} obtenus sur ${top.decided} décidés).` : '',
        ratios.length >= 2 ? `📊 2e : <strong>${ratios[1].name}</strong> — ${_fmt(ratios[1].caWon)} · ${ratios[1].won} dossier${_s(ratios[1].won)}.` : '',
      ].filter(Boolean).join(' &nbsp;·&nbsp; ');
    },

    /* ── TAUX DE RÉUSSITE PAR SOCIÉTÉ ── */
    'chart-win-rate': (data) => {
      const ratios = _clientRatioTable(data, 10).filter(r => r.decided >= 2);
      if (!ratios.length) return '📭 Pas assez de données (min. 2 projets décidés par client).';
      ratios.sort((a,b) => (b.conv||0) - (a.conv||0));
      const best  = ratios[0];
      const worst = ratios[ratios.length-1];
      const avg   = Math.round(ratios.reduce((s,r)=>s+(r.conv||0),0)/ratios.length);
      return [
        `🏆 Meilleur taux : <strong>${best.name}</strong> ${best.conv}% (${best.won}/${best.decided} · CA moy. ${_fmt(best.avgWon)}).`,
        `📉 Taux le plus faible : <strong>${worst.name}</strong> ${worst.conv}% (${worst.won}/${worst.decided}).`,
        `📊 Moyenne sur ${ratios.length} clients : <strong>${avg}%</strong>.`,
        worst.conv < 30 ? `💡 <strong>${worst.name}</strong> à analyser : taux bas malgré ${worst.decided} projets décidés.` : '',
      ].filter(Boolean).join(' &nbsp;·&nbsp; ');
    },

    /* ── TAUX DE CONVERSION PAR CLIENT ── */
    'chart-win-rate-client': (data) => {
      return _ANALYZERS['chart-win-rate'](data);
    },

    /* ── OBTENUS PAR ZONE ── */
    'chart-obtenu-zone': (data) => {
      const obtenus = data.filter(p => _status(p) === 'obtenu');
      if (!obtenus.length) return '📭 Aucun projet obtenu.';
      const byZone = {};
      const byZoneCount = {};
      obtenus.forEach(p => {
        const z = (p['Zone Géographique'] || 'Non défini').trim();
        byZone[z]      = (byZone[z]||0)      + _getCA(p,'ca_gagne');
        byZoneCount[z] = (byZoneCount[z]||0) + 1;
      });
      const entries = Object.entries(byZone).sort((a,b)=>b[1]-a[1]);
      const top = entries[0];
      const total = entries.reduce((s,[,v])=>s+v,0);
      const topPct = total > 0 ? Math.round(top[1]/total*100) : 0;
      return [
        `🏆 Zone dominante : <strong>${top[0]}</strong> — ${_fmt(top[1])} (${topPct}%) · ${byZoneCount[top[0]]} projet${_s(byZoneCount[top[0]])}.`,
        `📊 ${entries.length} zone${_s(entries.length)} active${_s(entries.length)}.`,
        entries.length < 3 ? `💡 Opportunité : ${entries.length} zone(s) seulement — potentiel de diversification géographique.` : '',
      ].filter(Boolean).join(' &nbsp;·&nbsp; ');
    },

    /* ── CA PAR ZONE ── */
    'chart-ca-zone': (data) => {
      const byZone = {};
      const wonByZone = {};
      const lostByZone = {};
      data.forEach(p => {
        const z = (p['Zone Géographique']||'Non défini').trim();
        byZone[z]     = (byZone[z]||0)     + _getCA(p,'ca_etudie');
        if (_status(p)==='obtenu') wonByZone[z]  = (wonByZone[z]||0)  + _getCA(p,'ca_gagne');
        if (_status(p)==='perdu')  lostByZone[z] = (lostByZone[z]||0) + _getCA(p,'ca_etudie');
      });
      const entries = Object.entries(byZone).sort((a,b)=>b[1]-a[1]);
      if (!entries.length) return null;
      const top   = entries[0];
      const total = entries.reduce((s,[,v])=>s+v,0);
      const topPct = total > 0 ? Math.round(top[1]/total*100) : 0;
      const topWon = wonByZone[top[0]] || 0;
      return [
        `🌍 Zone à fort CA étudié : <strong>${top[0]}</strong> (${_fmt(top[1])}, ${topPct}%).`,
        topWon > 0 ? `✅ CA gagné dans cette zone : <strong>${_fmt(topWon)}</strong>.` : '',
        topPct > 60 ? `⚠️ Forte concentration géographique (${topPct}%) — risque de dépendance.` : '',
        entries.length >= 2 ? `💡 Zones sous-représentées : ${entries.slice(-Math.min(2,entries.length)).map(([z])=>z).join(', ')}.` : '',
      ].filter(Boolean).join(' &nbsp;·&nbsp; ');
    },

    'chart-ca-zone-v2': (data) => {
      return _ANALYZERS['chart-ca-zone'](data);
    },

    /* ── STATUT PAR ZONE ── */
    'chart-status-zone': (data) => {
      const byZone = {};
      data.forEach(p => {
        const z = (p['Zone Géographique']||'Non défini').trim();
        if (!byZone[z]) byZone[z] = { won:0, lost:0, offer:0 };
        const st = _status(p);
        if (st==='obtenu') byZone[z].won++;
        else if (st==='perdu') byZone[z].lost++;
        else byZone[z].offer++;
      });
      const entries = Object.entries(byZone).map(([z,d]) => {
        const decided = d.won + d.lost;
        return { zone: z, ...d, conv: decided > 0 ? Math.round(d.won/decided*100) : null };
      }).filter(z => z.conv !== null).sort((a,b)=>(b.conv||0)-(a.conv||0));
      if (!entries.length) return null;
      const best  = entries[0];
      const worst = entries[entries.length-1];
      return [
        `🏆 Zone la plus performante : <strong>${best.zone}</strong> (conv. ${best.conv}% · ${best.won} gagné${_s(best.won)}).`,
        worst !== best ? `⚠️ Zone la plus difficile : <strong>${worst.zone}</strong> (conv. ${worst.conv}% · ${worst.lost} perdu${_s(worst.lost)}).` : '',
        `💡 Analyse croisée recommandée : comparer les offres perdues entre <strong>${worst.zone}</strong> et <strong>${best.zone}</strong>.`,
      ].filter(Boolean).join(' &nbsp;·&nbsp; ');
    },

    /* ── TAUX DE CONVERSION PAR ZONE ── */
    'chart-win-rate-zone': (data) => {
      return _ANALYZERS['chart-status-zone'](data);
    },

    /* ── CA PAR STATUT ── */
    'chart-ca-status': (data) => {
      const etudie = data.reduce((s,p)=>s+_getCA(p,'ca_etudie'),0);
      const gagne  = data.filter(p=>_status(p)==='obtenu').reduce((s,p)=>s+_getCA(p,'ca_gagne'),0);
      const perdu  = data.filter(p=>_status(p)==='perdu').reduce((s,p)=>s+_getCA(p,'ca_etudie'),0);
      const pipe   = data.filter(p=>_status(p)==='offre').reduce((s,p)=>s+_getCA(p,'ca_etudie'),0);
      const conv   = etudie > 0 ? Math.round(gagne/etudie*100) : 0;
      return [
        `💰 CA sécurisé : <strong>${_fmt(gagne)}</strong> (${Math.round(gagne/etudie*100||0)}% du CA étudié).`,
        `📊 CA perdu : <strong>${_fmt(perdu)}</strong> — Pipeline actif : <strong>${_fmt(pipe)}</strong>.`,
        conv < 20 ? `⚠️ Taux de transformation faible (${conv}%) — actions commerciales recommandées.` : '',
      ].filter(Boolean).join(' &nbsp;·&nbsp; ');
    },

    /* ── CA ÉTUDIÉ VS GAGNÉ ── */
    'chart-ca-compare': (data) => {
      const obtenus = data.filter(p=>_status(p)==='obtenu');
      const offres  = data.filter(p=>_status(p)==='offre');
      const caGagne = obtenus.reduce((s,p)=>s+_getCA(p,'ca_gagne'),0);
      const caPipe  = offres.reduce((s,p)=>s+_getCA(p,'ca_etudie'),0);
      const caEtudie= data.reduce((s,p)=>s+_getCA(p,'ca_etudie'),0);
      const eff     = caEtudie > 0 ? Math.round(caGagne/caEtudie*100) : 0;
      return [
        `✅ CA sécurisé : <strong>${_fmt(caGagne)}</strong> (${obtenus.length} projets obtenus).`,
        `🔮 Pipeline actif : <strong>${_fmt(caPipe)}</strong> (${offres.length} offres en cours).`,
        `📐 Efficacité de transformation : <strong>${eff}%</strong> du CA étudié converti.`,
        caGagne > 0 && caPipe > 0 ? `📊 Ratio pipeline/sécurisé : ${(caPipe/caGagne).toFixed(1)}x.` : '',
      ].filter(Boolean).join(' &nbsp;·&nbsp; ');
    },

    /* ── PUISSANCE PAR ZONE ── */
    'chart-machines-zone': (data) => {
      const byZone = {};
      const wonByZone = {};
      data.forEach(p => {
        const z = (p['Zone Géographique']||'Non défini').trim();
        const mw = parseFloat(p['Puissance (MWc)']) || 0;
        if (mw > 0) {
          byZone[z] = (byZone[z]||0) + mw;
          if (_status(p)==='obtenu') wonByZone[z] = (wonByZone[z]||0) + mw;
        }
      });
      const entries = Object.entries(byZone).sort((a,b)=>b[1]-a[1]);
      if (!entries.length) return null;
      const top = entries[0];
      const total = entries.reduce((s,[,v])=>s+v,0);
      const topWon = wonByZone[top[0]] || 0;
      return [
        `⚡ Zone la plus puissante : <strong>${top[0]}</strong> (${top[1].toFixed(1)} MWc).`,
        topWon > 0 ? `✅ MWc sécurisés dans cette zone : <strong>${topWon.toFixed(1)} MWc</strong>.` : '',
        `📊 Total pipeline : <strong>${total.toFixed(1)} MWc</strong> sur ${entries.length} zone${_s(entries.length)}.`,
      ].filter(Boolean).join(' &nbsp;·&nbsp; ');
    },

    /* ── PUISSANCE PAR STATUT ── */
    'chart-power-status': (data) => {
      const byStatus = { obtenu:0, perdu:0, offre:0 };
      data.forEach(p => {
        const st = _status(p);
        const mw = parseFloat(p['Puissance (MWc)']) || 0;
        if (st in byStatus) byStatus[st] += mw;
      });
      const total = Object.values(byStatus).reduce((a,b)=>a+b,0);
      const secPct = total > 0 ? Math.round(byStatus.obtenu/total*100) : 0;
      return [
        `⚡ MWc sécurisés : <strong>${byStatus.obtenu.toFixed(1)}</strong> (${secPct}% du total).`,
        `📋 MWc en cours : <strong>${byStatus.offre.toFixed(1)}</strong> — Perdu : ${byStatus.perdu.toFixed(1)}.`,
        `📊 Puissance totale analysée : <strong>${total.toFixed(1)} MWc</strong>.`,
      ].join(' &nbsp;·&nbsp; ');
    },

    /* ── TYPES D'OFFRES ── */
    'chart-offer-type': (data) => {
      const byType = {};
      data.forEach(p => {
        const t = (p['Type de projet (Activité)'] || p['Type'] || 'Non défini').trim();
        if (!byType[t]) byType[t] = { total:0, won:0, ca:0 };
        byType[t].total++;
        if (_status(p)==='obtenu') { byType[t].won++; byType[t].ca += _getCA(p,'ca_gagne'); }
      });
      const entries = Object.entries(byType).sort((a,b)=>b[1].total-a[1].total);
      if (!entries.length) return null;
      const top  = entries[0];
      const best = entries.sort((a,b)=> {
        const ca = (b[1].ca/Math.max(b[1].won,1)) - (a[1].ca/Math.max(a[1].won,1));
        return ca;
      })[0];
      return [
        `🎯 Type dominant : <strong>${top[0]}</strong> (${top[1].total} projets, ${Math.round(top[1].total/data.length*100)}%).`,
        `📊 ${entries.length} type${_s(entries.length)} d'activité — portefeuille ${entries.length>=4?'diversifié':'concentré'}.`,
        best && best[1].ca > 0 ? `💰 Type le plus rentable : <strong>${best[0]}</strong> (CA moy. ${_fmt(best[1].ca/Math.max(best[1].won,1))}/dossier).` : '',
      ].filter(Boolean).join(' &nbsp;·&nbsp; ');
    },

    /* ── TAUX DE CONVERSION PAR TYPE ── */
    'chart-conv-par-type': (data) => {
      const byType = {};
      data.forEach(p => {
        const t = (p['Type de projet (Activité)']||p['Type']||'N/D').trim();
        if (!byType[t]) byType[t] = { won:0, lost:0, ca:0 };
        if (_status(p)==='obtenu') { byType[t].won++; byType[t].ca += _getCA(p,'ca_gagne'); }
        if (_status(p)==='perdu')    byType[t].lost++;
      });
      const entries = Object.entries(byType)
        .map(([t,d]) => ({ type:t, ...d, decided:d.won+d.lost, conv: d.won+d.lost>0?Math.round(d.won/(d.won+d.lost)*100):null }))
        .filter(e=>e.conv!==null && e.decided>=2)
        .sort((a,b)=>(b.conv||0)-(a.conv||0));
      if (!entries.length) return null;
      const best  = entries[0];
      const worst = entries[entries.length-1];
      return [
        `🏆 Type le plus convertissant : <strong>${best.type}</strong> (${best.conv}% · ${best.won}/${best.decided}).`,
        worst!==best ? `⚠️ Type le moins performant : <strong>${worst.type}</strong> (${worst.conv}% · ${worst.won}/${worst.decided}).` : '',
        `💡 Prioriser les offres de type <strong>${best.type}</strong> — meilleur ROI commercial.`,
      ].filter(Boolean).join(' &nbsp;·&nbsp; ');
    },

    'chart-type-perf': (data) => {
      return _ANALYZERS['chart-conv-par-type'](data);
    },

    /* ── RÉPARTITION STATUTS MÉTIER ── */
    'chart-statuts-reels': (data) => {
      const counts = {};
      data.forEach(p => {
        const st = p['Statut'] || 'Inconnu';
        counts[st] = (counts[st]||0) + 1;
      });
      const entries = Object.entries(counts).sort((a,b)=>b[1]-a[1]);
      const top = entries[0];
      const nonChiffre = counts['Non Chiffré'] || 0;
      const ncPct = data.length > 0 ? Math.round(nonChiffre/data.length*100) : 0;
      return [
        `📊 Statut dominant : <strong>${top[0]}</strong> (${top[1]} projets, ${Math.round(top[1]/data.length*100)}%).`,
        ncPct > 20 ? `⚠️ ${ncPct}% de projets Non Chiffrés — qualifier ces dossiers pour améliorer la vision pipeline.` : '',
        `🧭 ${entries.length} statuts distincts dans le périmètre.`,
      ].filter(Boolean).join(' &nbsp;·&nbsp; ');
    },

    /* ── FUNNEL COMMERCIAL ── */
    'chart-funnel': (data) => {
      const total   = data.length;
      const offres  = data.filter(p=>['offre','en étude','remis'].some(s=>_status(p).includes(s) || (p['Statut']||'').toLowerCase().includes(s))).length;
      const decided = data.filter(p=>['obtenu','perdu'].includes(_status(p))).length;
      const obtenus = data.filter(p=>_status(p)==='obtenu').length;
      const t1 = total   > 0 ? Math.round(decided/total*100) : 0;
      const t2 = decided > 0 ? Math.round(obtenus/decided*100) : 0;
      return [
        `🔽 Total → Décidés : <strong>${t1}%</strong> des dossiers ont reçu une décision.`,
        `🎯 Décidés → Obtenus : <strong>${t2}%</strong> — taux de conversion final.`,
        t1 < 50 ? `💡 Beaucoup de dossiers non décidés (${100-t1}%) — accélérer les relances.` : '',
      ].filter(Boolean).join(' &nbsp;·&nbsp; ');
    },

    'chart-funnel-ca': (data) => {
      return _ANALYZERS['chart-funnel'](data);
    },

    /* ── PIPELINE PAR TEMPÉRATURE ── */
    'chart-pipeline-stage': (data) => {
      const offres = data.filter(p=>_status(p)==='offre');
      if (!offres.length) return '📭 Aucune offre en cours dans ce périmètre.';
      let chaud=0, tiede=0, froid=0, caChaud=0;
      offres.forEach(p => {
        const proba = parseFloat(p['Win proba']) || 0;
        const ca = _getCA(p,'ca_etudie');
        if (proba>70) { chaud++; caChaud+=ca; }
        else if (proba>=30) tiede++;
        else froid++;
      });
      return [
        `🔥 Offres chaudes (&gt;70%) : <strong>${chaud}</strong> pour <strong>${_fmt(caChaud)}</strong> — à convertir en priorité.`,
        `🟡 Tièdes (30–70%) : <strong>${tiede}</strong> — entretenir la relation.`,
        froid > 0 ? `🧊 Froides (&lt;30%) : <strong>${froid}</strong> — à relancer ou disqualifier.` : '',
        `💡 Pipeline total : <strong>${offres.length}</strong> offres actives.`,
      ].filter(Boolean).join(' &nbsp;·&nbsp; ');
    },

    /* ── PIPELINE PONDÉRÉ TOP OPPORTUNITÉS ── */
    'chart-pipeline-weighted': (data) => {
      const offres = data.filter(p=>_status(p)==='offre');
      if (!offres.length) return '📭 Aucune offre en cours.';
      const weighted = offres.map(p => {
        const proba = parseFloat(p['Win proba']) || 0;
        const ca    = _getCA(p,'ca_etudie');
        return { name: p['Nom Projet']||p['Projet']||'—', client: p['Client']||'', wca: ca*(proba/100), ca };
      }).sort((a,b)=>b.wca-a.wca);
      const totalWCA = weighted.reduce((s,p)=>s+p.wca,0);
      const top1 = weighted[0];
      return [
        `💼 CA pipeline pondéré total : <strong>${_fmt(totalWCA)}</strong>.`,
        top1 ? `🏆 Top opportunité : <strong>${top1.client||top1.name}</strong> — ${_fmt(top1.wca)} pondéré (${_fmt(top1.ca)} brut).` : '',
        `💡 Les offres pondérées &gt; ${_fmt(totalWCA*0.1)} sont à suivre prioritairement.`,
      ].filter(Boolean).join(' &nbsp;·&nbsp; ');
    },

    /* ── PIPELINE MENSUEL ── */
    'chart-pipeline-mensuel': (data) => {
      const offres = data.filter(p=>_status(p)==='offre');
      const ca = offres.reduce((s,p)=>s+_getCA(p,'ca_etudie'),0);
      const gained = data.filter(p=>_status(p)==='obtenu').reduce((s,p)=>s+_getCA(p,'ca_gagne'),0);
      return [
        `🔮 Pipeline actif : <strong>${_fmt(ca)}</strong> sur ${offres.length} offres en cours.`,
        `📊 Ratio pipeline/sécurisé : <strong>${gained > 0 ? (ca/gained).toFixed(1) : '—'}x</strong>.`,
        `💡 Pipeline sain si ratio > 2x.`,
      ].join(' &nbsp;·&nbsp; ');
    },

    /* ── DISTRIBUTION DES MONTANTS ── */
    'chart-ca-histogram': (data) => {
      const cas = data.map(p=>_getCA(p,'ca_etudie')).filter(v=>v>0);
      if (!cas.length) return null;
      const mean   = cas.reduce((a,b)=>a+b,0)/cas.length;
      const median = [...cas].sort((a,b)=>a-b)[Math.floor(cas.length/2)];
      const max    = Math.max(...cas);
      const won    = data.filter(p=>_status(p)==='obtenu');
      const avgWon = won.length ? won.reduce((s,p)=>s+_getCA(p,'ca_gagne'),0)/won.length : 0;
      return [
        `📊 Moyenne : <strong>${_fmt(mean)}</strong> · Médiane : <strong>${_fmt(median)}</strong>.`,
        `🔝 Plus grande offre : <strong>${_fmt(max)}</strong>.`,
        avgWon > 0 ? `✅ CA moyen des projets gagnés : <strong>${_fmt(avgWon)}</strong>.` : '',
        mean > median*1.5 ? `⚠️ Distribution asymétrique — quelques très gros dossiers tirent la moyenne vers le haut.` : '',
      ].filter(Boolean).join(' &nbsp;·&nbsp; ');
    },

    'chart-budget-distribution': (data) => {
      return _ANALYZERS['chart-ca-histogram'](data);
    },

    /* ── SCATTER PUISSANCE VS CA ── */
    'chart-scatter-power-ca': (data) => {
      const pts = data.filter(p=>parseFloat(p['Puissance (MWc)'])>0 && _getCA(p,'ca_etudie')>0);
      if (pts.length < 3) return null;
      const ratios = pts.map(p => ({
        name: (p['Client']||'').trim(),
        ratio: _getCA(p,'ca_etudie') / parseFloat(p['Puissance (MWc)']),
        ca: _getCA(p,'ca_etudie'),
        mw: parseFloat(p['Puissance (MWc)'])
      })).sort((a,b)=>b.ratio-a.ratio);
      const top = ratios[0];
      const avgRatio = ratios.reduce((s,r)=>s+r.ratio,0)/ratios.length;
      return [
        `📐 Meilleur ratio CA/MW : <strong>${top.name||'—'}</strong> (${_fmt(top.ca)} pour ${top.mw.toFixed(1)} MW = ${_fmt(top.ratio)}/MW).`,
        `📊 Ratio moyen : <strong>${_fmt(avgRatio)}</strong>/MW sur ${pts.length} projets.`,
        `💡 Les projets en haut à droite combinent forte puissance ET fort CA — prioriser ces profils.`,
      ].join(' &nbsp;·&nbsp; ');
    },

    /* ── SCATTER WIN RATE VS CA ── */
    'chart-scatter-conv-ca': (data) => {
      const ratios = _clientRatioTable(data, 15).filter(r=>r.decided>=2);
      if (!ratios.length) return null;
      const stars  = ratios.filter(r=>(r.conv||0)>=50 && r.caWon > 0).sort((a,b)=>b.caWon-a.caWon);
      const toWork = ratios.filter(r=>(r.conv||0)<30  && r.caWon > 0);
      return [
        stars.length  ? `⭐ <strong>Stars</strong> (conv. ≥ 50% + CA élevé) : ${stars.slice(0,2).map(r=>`${r.name} ${r.conv}%`).join(' · ')}.` : '',
        toWork.length ? `🔧 <strong>À travailler</strong> (conv. &lt; 30%) : ${toWork.slice(0,2).map(r=>`${r.name} ${r.conv}%`).join(' · ')}.` : '',
        `💡 Quadrant idéal = fort CA gagné + fort taux. Investir sur les Stars, analyser les blocages des autres.`,
      ].filter(Boolean).join(' &nbsp;·&nbsp; ');
    },

    /* ── DÉLAI DE DÉCISION PAR STATUT ── */
    'chart-delay-status': (data) => {
      const calcDelais = (subset) => {
        const delays = subset.map(p => {
          const d1 = (typeof ProjectUtils!=='undefined'&&ProjectUtils.parseDate) ? ProjectUtils.parseDate(p['Date réception']) : new Date(p['Date réception']);
          const d2 = (typeof ProjectUtils!=='undefined'&&ProjectUtils.parseDate) ? ProjectUtils.parseDate(p['Date de retour demandée']) : new Date(p['Date de retour demandée']);
          if (!d1||!d2||isNaN(d1)||isNaN(d2)) return null;
          return Math.round(Math.abs(d2-d1)/(1000*60*60*24));
        }).filter(v=>v!==null&&v>0);
        return delays.length ? Math.round(delays.reduce((a,b)=>a+b,0)/delays.length) : null;
      };
      const won  = calcDelais(data.filter(p=>_status(p)==='obtenu'));
      const lost = calcDelais(data.filter(p=>_status(p)==='perdu'));
      return [
        won  !== null ? `✅ Délai moyen projets gagnés : <strong>${won} j</strong>.` : '',
        lost !== null ? `❌ Délai moyen projets perdus : <strong>${lost} j</strong>.` : '',
        won && lost && lost > won
          ? `💡 Les projets perdus ont un délai plus long (${lost-won} j de plus) — les décisions tardives favorisent la concurrence.`
          : won && lost && won > lost
          ? `✅ Cycles courts sur les projets gagnés — bonne réactivité.` : '',
      ].filter(Boolean).join(' &nbsp;·&nbsp; ');
    },

    'chart-cycle-time': (data) => {
      return _ANALYZERS['chart-delay-status'](data);
    },

    /* ── CA CUMULÉ ── */
    'chart-ca-cumule': (data) => {
      const won    = data.filter(p=>_status(p)==='obtenu');
      const total  = won.reduce((s,p)=>s+_getCA(p,'ca_gagne'),0);
      const byMonth = {};
      won.forEach(p => {
        const raw = p['Date réception'];
        if (!raw) return;
        const d = (typeof ProjectUtils!=='undefined'&&ProjectUtils.parseDate)?ProjectUtils.parseDate(raw):new Date(raw);
        if (!d||isNaN(d)) return;
        const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
        byMonth[key] = (byMonth[key]||0) + _getCA(p,'ca_gagne');
      });
      const months = Object.keys(byMonth).sort();
      const lastMonth = months[months.length-1];
      const lastVal   = byMonth[lastMonth];
      const avgMonthly = months.length > 0 ? total/months.length : 0;
      return [
        `💰 CA gagné cumulé : <strong>${_fmt(total)}</strong> sur ${won.length} projets.`,
        lastMonth ? `📅 Dernier mois renseigné : <strong>${lastMonth}</strong> (+${_fmt(lastVal)}).` : '',
        avgMonthly > 0 ? `📊 Rythme moyen : <strong>${_fmt(avgMonthly)}</strong>/mois.` : '',
      ].filter(Boolean).join(' &nbsp;·&nbsp; ');
    },

    /* ── CA PAR MOIS ── */
    'chart-ca-by-month': (data) => {
      return _ANALYZERS['chart-monthly'](data);
    },

    /* ── TAUX CONVERSION MENSUEL ── */
    'chart-winrate-month': (data) => {
      const byMonth = {};
      data.forEach(p => {
        const raw = p['Date réception'];
        if (!raw) return;
        const d = (typeof ProjectUtils!=='undefined'&&ProjectUtils.parseDate)?ProjectUtils.parseDate(raw):new Date(raw);
        if (!d||isNaN(d)) return;
        const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
        if (!byMonth[key]) byMonth[key]={won:0,lost:0};
        if (_status(p)==='obtenu') byMonth[key].won++;
        if (_status(p)==='perdu')  byMonth[key].lost++;
      });
      const entries = Object.entries(byMonth).map(([m,d])=>({
        month:m, ...d, conv: d.won+d.lost>0?Math.round(d.won/(d.won+d.lost)*100):null
      })).filter(e=>e.conv!==null).sort((a,b)=>b.conv-a.conv);
      if (!entries.length) return null;
      const best  = entries[0];
      const worst = entries[entries.length-1];
      const avg   = Math.round(entries.reduce((s,e)=>s+(e.conv||0),0)/entries.length);
      return [
        `🏆 Meilleur mois : <strong>${best.month}</strong> (${best.conv}%).`,
        `📉 Mois difficile : <strong>${worst.month}</strong> (${worst.conv}%).`,
        `📊 Conversion moyenne : <strong>${avg}%</strong> sur ${entries.length} mois.`,
      ].join(' &nbsp;·&nbsp; ');
    },

    /* ── ÉVOLUTION TAUX CONVERSION ── */
    'chart-conv-trend': (data) => {
      return _ANALYZERS['chart-winrate-month'](data);
    },

    /* ── CA TENDANCE CUMULÉE ── */
    'chart-ca-trend': (data) => {
      const proj = _projectionInsight(data);
      const base = _ANALYZERS['chart-ca-year'](data);
      return [base, proj].filter(Boolean).join('<br>');
    },

    /* ── HEATMAP TEMPORELLE ── */
    'chart-temporal-heatmap': (data) => {
      const byMonth = {};
      data.forEach(p => {
        const raw = p['Date réception'];
        if (!raw) return;
        const d = (typeof ProjectUtils!=='undefined'&&ProjectUtils.parseDate)?ProjectUtils.parseDate(raw):new Date(raw);
        if (!d||isNaN(d)) return;
        const m = d.getMonth();
        byMonth[m] = (byMonth[m]||0)+1;
      });
      const monthNames = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Aoû','Sep','Oct','Nov','Déc'];
      const entries = Object.entries(byMonth).sort((a,b)=>b[1]-a[1]);
      if (!entries.length) return null;
      const peak = entries[0];
      const slow = entries[entries.length-1];
      return [
        `🔥 Mois le plus actif : <strong>${monthNames[Number(peak[0])]}</strong> (${peak[1]} projets).`,
        `🧊 Mois le plus calme : <strong>${monthNames[Number(slow[0])]}</strong> (${slow[1]} projets).`,
        `💡 Anticiper les pics d'activité pour planifier les ressources commerciales.`,
      ].join(' &nbsp;·&nbsp; ');
    },

    /* ── ANALYSE AUTO / BILAN ── */
    'annual-analysis-block': (data) => {
      const proj = _projectionInsight(data);
      return proj || null;
    },

    /* ── BIZ CHARTS (Pilotage métier) ── */
    'biz-chart-perf-month':       (data) => _chartDrivenBusinessAnalysis('biz-chart-perf-month', data, { family: 'performance', emphasis: 'time' }) || _ANALYZERS['chart-monthly'](data),
    'biz-chart-perf-zone':        (data) => _chartDrivenBusinessAnalysis('biz-chart-perf-zone', data, { family: 'performance' }) || _ANALYZERS['chart-status-zone'](data),
    'biz-chart-perf-client':      (data) => _chartDrivenBusinessAnalysis('biz-chart-perf-client', data, { family: 'performance' }) || _ANALYZERS['chart-obtenu'](data),
    'biz-chart-perf-type':        (data) => _chartDrivenBusinessAnalysis('biz-chart-perf-type', data, { family: 'performance' }) || _ANALYZERS['chart-conv-par-type'](data),
    'biz-chart-perf-zone-client': (data) => _chartDrivenBusinessAnalysis('biz-chart-perf-zone-client', data, { family: 'performance' }),
    'biz-chart-perf-client-type': (data) => _chartDrivenBusinessAnalysis('biz-chart-perf-client-type', data, { family: 'performance' }),
    'biz-chart-pipe-zone':        (data) => _chartDrivenBusinessAnalysis('biz-chart-pipe-zone', data, { family: 'pipeline' }) || _ANALYZERS['chart-ca-zone'](data),
    'biz-chart-pipe-client':      (data) => _chartDrivenBusinessAnalysis('biz-chart-pipe-client', data, { family: 'pipeline' }) || _ANALYZERS['chart-ca-company'](data),
    'biz-chart-pipe-type':        (data) => _chartDrivenBusinessAnalysis('biz-chart-pipe-type', data, { family: 'pipeline' }) || _ANALYZERS['chart-offer-type'](data),
    'biz-chart-pipe-zone-client': (data) => _chartDrivenBusinessAnalysis('biz-chart-pipe-zone-client', data, { family: 'pipeline' }),
    'biz-chart-pipe-client-type': (data) => _chartDrivenBusinessAnalysis('biz-chart-pipe-client-type', data, { family: 'pipeline' }),
  };

  /* ──────────────────────────────────────────────────────────────
     ANALYSE GÉNÉRIQUE (fallback contextualisé)
  ────────────────────────────────────────────────────────────── */

  function _defaultAnalysis(chartId, data) {
    const total   = data.length;
    const obtenus = data.filter(p=>_status(p)==='obtenu').length;
    const perdus  = data.filter(p=>_status(p)==='perdu').length;
    const decided = obtenus + perdus;
    const conv    = decided > 0 ? Math.round(obtenus/decided*100) : null;
    const caTotal = data.reduce((s,p)=>s+_getCA(p,'ca_etudie'),0);
    const summary = _summarizeChartData(chartId);

    // Texte de base
    const parts = [
      `📁 <strong>${total}</strong> projet${_s(total)} analysé${_s(total)}.`,
      conv !== null ? `🎯 Taux de conversion : <strong>${conv}%</strong> (${obtenus}/${decided}).` : '',
      caTotal > 0   ? `📊 CA total étudié : <strong>${_fmt(caTotal)}</strong>.` : '',
    ];

    if (summary) {
      if (summary.categories.length) {
        parts.push(`🧭 <strong>${summary.categories.length}</strong> catégorie${_s(summary.categories.length)} visible${_s(summary.categories.length)}.`);
      }
      if (summary.topCategory) {
        parts.push(`🏆 Point fort : <strong>${summary.topCategory.label}</strong> (${_formatVal(summary.topCategory.value) || _fmt(summary.topCategory.value)}).`);
      }
      if (summary.datasets.length > 1 && summary.topDataset) {
        parts.push(`📚 Série dominante : <strong>${summary.topDataset.label}</strong> (${_formatVal(summary.topDataset.total) || _fmt(summary.topDataset.total)}).`);
      }
      if (summary.topCategory && summary.secondCategory && summary.total > 0) {
        const share = Math.round(summary.topCategory.value / summary.total * 100);
        parts.push(share >= 45
          ? `⚠️ La catégorie leader concentre <strong>${share}%</strong> du total visible.`
          : `📊 Répartition équilibrée : leader à <strong>${share}%</strong> du total.`);
      }
    }

    return parts.filter(Boolean).join(' &nbsp;·&nbsp; ');
  }

  /* ──────────────────────────────────────────────────────────────
     CSS
  ────────────────────────────────────────────────────────────── */

  function _injectCSS() {
    if (document.getElementById('ca-styles')) return;
    const style = document.createElement('style');
    style.id = 'ca-styles';
    style.textContent = `
      /* ── BLOC ANALYSE ── */
      .chart-analysis-block {
        margin: .4rem .5rem .7rem;
        padding: 0;
        border: 1px solid rgba(0,212,170,.14);
        border-radius: 8px;
        overflow: hidden;
        font-family: 'DM Mono', monospace;
        font-size: .69rem;
        color: #9fb3c8;
        line-height: 1.65;
        animation: caBlockIn .25s ease-out;
        background: rgba(6,12,20,.4);
      }
      .chart-analysis-block strong { color: #dce8f5; font-weight: 700; }
      .chart-analysis-block.ca-updating { opacity: .45; }
      @keyframes caBlockIn { from { opacity:0;transform:translateY(3px); } to { opacity:1;transform:translateY(0); } }

      /* ── EN-TÊTE AVEC TOGGLE ── */
      .ca-block-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: .35rem .75rem;
        border-bottom: 1px solid rgba(0,212,170,.1);
        gap: .5rem;
        background: rgba(0,212,170,.035);
      }
      .ca-block-actions {
        display: inline-flex;
        align-items: center;
        gap: .4rem;
        flex-wrap: wrap;
        justify-content: flex-end;
      }
      .ca-block-text {
        flex: 1;
        padding: .7rem .8rem .55rem;
      }
      .ca-analysis-lead {
        color: #e6f1fb;
        font-size: .72rem;
        line-height: 1.65;
      }
      .ca-analysis-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
        gap: .45rem;
        margin-top: .55rem;
      }
      .ca-analysis-point {
        padding: .52rem .6rem;
        border-radius: 10px;
        border: 1px solid rgba(255,255,255,.06);
        background: rgba(255,255,255,.025);
        color: rgba(220,232,245,.88);
        line-height: 1.55;
      }
      .ca-block-meta {
        display: flex;
        flex-wrap: wrap;
        gap: .35rem .7rem;
        padding: 0 .75rem .55rem;
        color: rgba(159,179,200,.82);
        font-size: .58rem;
        border-bottom: 1px solid rgba(0,212,170,.08);
      }
      .ca-block-meta span {
        display: inline-flex;
        align-items: center;
        gap: .2rem;
      }
      .ca-block-meta strong {
        color: #dce8f5;
        font-weight: 600;
      }
      .ca-toggle-btn {
        flex-shrink: 0;
        background: rgba(0,153,255,.12);
        border: 1px solid rgba(0,153,255,.28);
        color: #60a5fa;
        font-family: 'DM Mono', monospace;
        font-size: .6rem;
        padding: .2rem .55rem;
        border-radius: 5px;
        cursor: pointer;
        transition: all .18s;
        white-space: nowrap;
      }
      .ca-toggle-btn:hover { background: rgba(0,153,255,.22); color: #93c5fd; }
      .ca-toggle-btn.is-table { background: rgba(0,212,170,.12); border-color: rgba(0,212,170,.3); color: #34d399; }
      .ca-open-btn,
      .ca-style-btn,
      .ca-mode-btn {
        flex-shrink: 0;
        border-radius: 5px;
        cursor: pointer;
        transition: all .18s;
        white-space: nowrap;
        font-family: 'DM Mono', monospace;
        font-size: .6rem;
        padding: .2rem .55rem;
      }
      .ca-open-btn {
        background: rgba(16,185,129,.1);
        border: 1px solid rgba(16,185,129,.24);
        color: #6ee7b7;
      }
      .ca-open-btn:hover { background: rgba(16,185,129,.18); color: #a7f3d0; }
      .ca-style-btn {
        background: rgba(245,183,64,.1);
        border: 1px solid rgba(245,183,64,.25);
        color: #f5d77f;
      }
      .ca-style-btn:hover { background: rgba(245,183,64,.18); color: #fde68a; }
      .ca-mode-btn {
        background: rgba(139,120,248,.1);
        border: 1px solid rgba(139,120,248,.25);
        color: #c4b5fd;
      }
      .ca-mode-btn:hover { background: rgba(139,120,248,.18); color: #ddd6fe; }

      /* ── TABLE WRAPPER ── */
      .ca-table-view { display: none; }
      .ca-table-view.is-visible { display: block; }

      /* ── CONTROLS (search + export) ── */
      .ca-table-controls {
        display: flex;
        align-items: center;
        gap: .4rem;
        padding: .4rem .65rem;
        border-bottom: 1px solid rgba(0,212,170,.1);
        background: rgba(0,212,170,.025);
        flex-wrap: wrap;
      }
      .ca-search-input {
        flex: 1;
        min-width: 120px;
        background: rgba(255,255,255,.05);
        border: 1px solid rgba(255,255,255,.1);
        border-radius: 4px;
        color: #c0d0e0;
        font-family: 'DM Mono', monospace;
        font-size: .6rem;
        padding: .22rem .5rem;
        outline: none;
        transition: border-color .15s;
      }
      .ca-search-input::placeholder { color: rgba(155,175,195,.45); }
      .ca-search-input:focus { border-color: rgba(0,212,170,.45); }
      .ca-row-count {
        font-family: 'DM Mono', monospace;
        font-size: .58rem;
        color: rgba(155,175,195,.55);
        white-space: nowrap;
      }
      .ca-export-btn {
        flex-shrink: 0;
        background: rgba(16,185,129,.1);
        border: 1px solid rgba(16,185,129,.3);
        color: #34d399;
        font-family: 'DM Mono', monospace;
        font-size: .58rem;
        padding: .22rem .6rem;
        border-radius: 4px;
        cursor: pointer;
        white-space: nowrap;
        transition: all .15s;
      }
      .ca-export-btn:hover { background: rgba(16,185,129,.22); color: #6ee7b7; }
      .ca-open-table-btn {
        flex-shrink: 0;
        background: rgba(0,153,255,.12);
        border: 1px solid rgba(0,153,255,.28);
        color: #7dd3fc;
        font-family: 'DM Mono', monospace;
        font-size: .58rem;
        padding: .22rem .6rem;
        border-radius: 4px;
        cursor: pointer;
        white-space: nowrap;
        transition: all .15s;
      }
      .ca-open-table-btn:hover { background: rgba(0,153,255,.22); color: #bae6fd; }

      .ca-style-modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(2,6,12,.72);
        backdrop-filter: blur(4px);
        z-index: 10000;
      }
      .ca-style-modal {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        z-index: 10001;
        width: min(520px, calc(100vw - 2rem));
        border-radius: 16px;
        border: 1px solid rgba(255,255,255,.09);
        background: linear-gradient(180deg, rgba(12,22,38,.98), rgba(8,15,28,.98));
        box-shadow: 0 22px 65px rgba(0,0,0,.52);
        overflow: hidden;
        color: #dce8f5;
      }
      .ca-style-modal-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: .75rem;
        padding: .95rem 1rem;
        border-bottom: 1px solid rgba(255,255,255,.07);
      }
      .ca-style-modal-title {
        font-family: 'DM Mono', monospace;
        font-size: .72rem;
        letter-spacing: .06em;
        text-transform: uppercase;
        color: #e6f1fb;
      }
      .ca-style-modal-body {
        padding: 1rem;
        display: grid;
        gap: .85rem;
      }
      .ca-style-row {
        display: grid;
        gap: .38rem;
      }
      .ca-style-row label {
        font-family: 'DM Mono', monospace;
        font-size: .6rem;
        text-transform: uppercase;
        letter-spacing: .06em;
        color: rgba(159,179,200,.82);
      }
      .ca-style-row input,
      .ca-style-row select {
        background: rgba(255,255,255,.04);
        border: 1px solid rgba(255,255,255,.09);
        border-radius: 10px;
        color: #dce8f5;
        padding: .62rem .75rem;
        font-family: 'DM Mono', monospace;
        font-size: .67rem;
      }
      .ca-style-checks {
        display: flex;
        gap: .8rem;
        flex-wrap: wrap;
      }
      .ca-style-check {
        display: inline-flex;
        align-items: center;
        gap: .4rem;
        font-size: .67rem;
        color: #c0d0e0;
      }
      .ca-style-check input { accent-color: #00d4aa; }
      .ca-style-modal-foot {
        display: flex;
        justify-content: flex-end;
        gap: .55rem;
        padding: 0 1rem 1rem;
      }
      .ca-style-primary,
      .ca-style-secondary {
        border-radius: 10px;
        padding: .55rem .8rem;
        font-family: 'DM Mono', monospace;
        font-size: .64rem;
        cursor: pointer;
        transition: all .15s;
      }
      .ca-style-primary {
        background: rgba(0,212,170,.15);
        border: 1px solid rgba(0,212,170,.36);
        color: #6ee7b7;
      }
      .ca-style-secondary {
        background: rgba(255,255,255,.04);
        border: 1px solid rgba(255,255,255,.08);
        color: #c0d0e0;
      }

      /* ── DUAL SCROLLBAR ── */
      .ca-scroll-wrap { position: relative; }
      .ca-top-scroll {
        overflow-x: auto;
        overflow-y: hidden;
        height: 8px;
        border-bottom: 1px solid rgba(0,212,170,.08);
      }
      .ca-top-scroll::-webkit-scrollbar { height: 5px; }
      .ca-top-scroll::-webkit-scrollbar-track { background: rgba(255,255,255,.03); }
      .ca-top-scroll::-webkit-scrollbar-thumb { background: rgba(0,212,170,.35); border-radius: 3px; }
      .ca-top-scroll-inner { height: 1px; }
      .ca-table-scroll {
        overflow-x: auto;
        overflow-y: auto;
        max-height: 290px;
      }
      .ca-table-scroll::-webkit-scrollbar { height: 5px; width: 5px; }
      .ca-table-scroll::-webkit-scrollbar-track { background: rgba(255,255,255,.03); }
      .ca-table-scroll::-webkit-scrollbar-thumb { background: rgba(0,212,170,.35); border-radius: 3px; }

      /* ── TABLE ── */
      .ca-data-table {
        width: max-content;
        min-width: 100%;
        border-collapse: collapse;
        font-family: 'DM Mono', monospace;
        font-size: .65rem;
      }
      .ca-data-table thead th {
        background: rgba(0,30,22,.85);
        color: #9fb3c8;
        padding: .35rem .75rem;
        text-align: left;
        border-bottom: 2px solid rgba(0,212,170,.25);
        border-right: 1px solid rgba(0,212,170,.08);
        font-weight: 600;
        white-space: nowrap;
        position: sticky;
        top: 0;
        z-index: 2;
        cursor: pointer;
        user-select: none;
        transition: background .12s;
      }
      .ca-data-table thead th:hover { background: rgba(0,212,170,.1); color: #c0d8f0; }
      .ca-data-table thead th::after { content: ''; display: inline-block; margin-left: 4px; opacity: .3; font-size: .55rem; }
      .ca-data-table thead th[data-sort="asc"]::after  { content: '▲'; opacity: 1; color: #00d4aa; }
      .ca-data-table thead th[data-sort="desc"]::after { content: '▼'; opacity: 1; color: #00d4aa; }

      /* ── ROWS alternance ── */
      .ca-data-table tbody tr:nth-child(odd)  td { background: rgba(6,18,12,.55); }
      .ca-data-table tbody tr:nth-child(even) td { background: rgba(0,35,25,.45); }
      .ca-data-table tbody tr:hover td { background: rgba(0,212,170,.1) !important; }
      .ca-data-table td {
        padding: .3rem .75rem;
        border-bottom: 1px solid rgba(255,255,255,.035);
        border-right: 1px solid rgba(255,255,255,.025);
        white-space: nowrap;
      }
      .ca-dt-label { color: #c0d0e0; font-weight: 500; min-width: 120px; }
      .ca-dt-val { text-align: right; color: #9fb3c8; min-width: 80px; }

      @media (max-width:600px) {
        .chart-analysis-block { font-size: .62rem; }
        .ca-data-table { font-size: .6rem; }
        .ca-table-controls { gap: .3rem; }
      }
    `;
    document.head.appendChild(style);
  }

  /* ──────────────────────────────────────────────────────────────
     BLOC ANALYSIS — création / toggle
  ────────────────────────────────────────────────────────────── */

  function _getOrCreateBlock(chartId) {
    const blockId = `ca-block-${chartId}`;
    let block = document.getElementById(blockId);
    const card = _getChartCard(chartId);
    const canvas = _getChartCanvas(chartId);
    if (!card || !canvas) return null;

    const container = card.querySelector('.chart-container') || canvas.closest('.chart-container') || canvas.parentElement;
    const host = container && container.parentElement ? container.parentElement : card;

    if (!block) {
      block = document.createElement('div');
      block.id = blockId;
      block.className = 'chart-analysis-block';

      block.innerHTML = `
        <div class="ca-block-header">
          <span class="ca-block-kicker" style="font-size:.58rem;text-transform:uppercase;letter-spacing:.08em;color:rgba(0,212,170,.7);">Analyse</span>
          <div class="ca-block-actions">
            <button class="ca-mode-btn" title="Basculer entre volume et valeur">📈 / 💰 Mode</button>
            <button class="ca-style-btn" title="Personnaliser les couleurs, axes et graduations">🎨 Style</button>
            <button class="ca-toggle-btn" title="Afficher ou masquer le tableau synthétique">📊 Afficher le tableau</button>
          </div>
        </div>
        <div class="ca-block-text"></div>
        <div class="ca-block-meta"></div>
        <div class="ca-table-view"></div>
      `;
    }

    if (host && block.parentElement !== host) {
      host.insertBefore(block, container ? container.nextSibling : host.firstChild);
    }

      // Toggle logique
      const btn       = block.querySelector('.ca-toggle-btn');
      const tableView = block.querySelector('.ca-table-view');
      const styleBtn  = block.querySelector('.ca-style-btn');
      const modeBtn   = block.querySelector('.ca-mode-btn');

      if (!block.dataset.bound) {
      btn.addEventListener('click', () => {
        const isTableNow = tableView.classList.toggle('is-visible');
        btn.textContent = isTableNow ? '📕 Masquer le tableau' : '📊 Afficher le tableau';
        btn.classList.toggle('is-table', isTableNow);

        if (isTableNow && !tableView.dataset.built) {
          const tbl = _buildTableFromChart(chartId);
          if (tbl) {
            tableView.innerHTML = tbl;
            _initTableFeatures(tableView, chartId);
          } else {
            tableView.innerHTML = '<div style="padding:.6rem .9rem;color:#6b7d8f;font-size:.68rem;">Données non disponibles pour ce graphique.</div>';
          }
          tableView.dataset.built = '1';
        }
      });

      if (styleBtn) styleBtn.addEventListener('click', () => _openStyleEditor(chartId));
      if (modeBtn) modeBtn.addEventListener('click', () => _toggleGlobalMode());
      block.dataset.bound = '1';
    }
    return block;
  }

  /* ──────────────────────────────────────────────────────────────
     RENDER PUBLIC API
  ────────────────────────────────────────────────────────────── */

  function renderForChart(chartId, data) {
    const block = _getOrCreateBlock(chartId);
    if (!block) return;

    block.classList.add('ca-updating');

    const analyzer = _ANALYZERS[chartId];
    let text;
    try {
      text = analyzer ? analyzer(data) : '';
      if (!text) text = _defaultAnalysis(chartId, data);
    } catch (e) {
      console.warn('[ChartAnalysis] Erreur pour', chartId, e);
      text = _defaultAnalysis(chartId, data);
    }

    const textEl = block.querySelector('.ca-block-text');
    const metaEl = block.querySelector('.ca-block-meta');
    if (textEl) {
      if (!text) {
        block.style.display = 'none';
      } else {
        textEl.innerHTML = _formatAnalysisMarkup(text);
        block.style.display = '';
      }
    }
    if (metaEl) {
      if (typeof DashboardDataTransparency !== 'undefined'
          && typeof DashboardDataTransparency.describeChartContext === 'function') {
        metaEl.innerHTML = DashboardDataTransparency.describeChartContext(chartId, data);
      } else {
        metaEl.innerHTML = '';
      }
    }
    var modeBtn = block.querySelector('.ca-mode-btn');
    if (modeBtn && typeof AE !== 'undefined' && typeof AE.getCAMode === 'function') {
      modeBtn.textContent = AE.getCAMode() === 'Bud' ? '💰 Passer en valeur' : '📈 Passer en volume';
    }

    // Invalider le tableau en cache si les données ont changé
    const tableView = block.querySelector('.ca-table-view');
    if (tableView) {
      tableView.dataset.built = '';
      if (tableView.classList.contains('is-visible')) {
        const tbl = _buildTableFromChart(chartId);
        if (tbl) {
          tableView.innerHTML = tbl;
          _initTableFeatures(tableView, chartId);
        } else {
          tableView.innerHTML = '<div style="padding:.6rem .9rem;color:#6b7d8f;font-size:.68rem;">Données non disponibles.</div>';
        }
        tableView.dataset.built = '1';
      }
    }

    block.classList.remove('ca-updating');

    const savedStyle = _getChartStyle(chartId);
    if (savedStyle) {
      const nextStyleSig = JSON.stringify(savedStyle);
      const chart = _resolveChart(chartId);
      if (chart && _STYLE_SIGNATURES.get(chart) !== nextStyleSig) {
        _applyChartStyle(chartId, savedStyle);
        _STYLE_SIGNATURES.set(chart, nextStyleSig);
      }
    }
  }

  function renderAll(data) {
    if (!data) {
      data = typeof DataFilterEngine !== 'undefined' && DataFilterEngine.getFilteredData
        ? DataFilterEngine.getFilteredData()
        : (window.DATA || []);
    }
    const chartIds = new Set();
    Array.from(document.querySelectorAll('.chart-card[data-chart-id], [data-chart-id]')).forEach(function(card) {
      const chartId = card.getAttribute('data-chart-id');
      if (!chartId) return;
      if (card.classList && card.classList.contains('hidden-chart')) return;
      chartIds.add(chartId);
    });
    Object.keys(_ANALYZERS).forEach(function(chartId) {
      if (_getChartCanvas(chartId) || _getChartCard(chartId)) chartIds.add(chartId);
    });
    chartIds.forEach(id => renderForChart(id, data));
  }

  function getAnalysisText(chartId, data) {
    const analyzer = _ANALYZERS[chartId];
    let text;
    try {
      text = analyzer ? analyzer(data) : '';
      if (!text) text = _defaultAnalysis(chartId, data);
    } catch (e) { text = _defaultAnalysis(chartId, data); }
    if (!text) return '';
    return text
      .replace(/<strong>/g,'').replace(/<\/strong>/g,'')
      .replace(/<br>/g,' | ')
      .replace(/&nbsp;·&nbsp;/g,' • ')
      .replace(/<[^>]+>/g,'');
  }

  /* ──────────────────────────────────────────────────────────────
     INIT
  ────────────────────────────────────────────────────────────── */

  function init() {
    _injectCSS();

    if (typeof AE !== 'undefined' && AE.subscribe) {
      AE.subscribe(() => {
        const d = typeof AE.getFiltered==='function' ? AE.getFiltered() : (window.DATA||[]);
        renderAll(d);
      });
    }
    if (typeof FilterManager !== 'undefined' && FilterManager.subscribe) {
      FilterManager.subscribe(() => {
        const d = typeof DataFilterEngine!=='undefined' && DataFilterEngine.getFilteredData
          ? DataFilterEngine.getFilteredData() : (window.DATA||[]);
        renderAll(d);
      });
    }

    console.log('%c📊 ChartAnalysis v2.1 — tableau avancé : tri, recherche, dual-scroll, export Excel', 'color:#00d4aa;font-weight:700');
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      setTimeout(init, 300);
    }
  }

  return { init, renderForChart, renderAll, getAnalysisText };
})();
} // end guard
