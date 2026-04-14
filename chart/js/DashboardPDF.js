/**
 * ════════════════════════════════════════════════════════════════
 *  DASHBOARD PDF — Export professionnel du tableau de bord v2.0
 * ════════════════════════════════════════════════════════════════
 *
 *  Génère un rapport PDF côté client, sans dépendance serveur.
 *  Utilise jsPDF pour la génération PDF. Graphiques capturés via chartInstance.canvas.toDataURL().
 *
 *  Contenu du PDF :
 *   ① Page de couverture  — titre, date, période, filtres actifs
 *   ② KPI stratégiques    — 6 métriques clés
 *   ③ Graphiques          — sélection libre, 1 / 2 / 4 par page
 *   ④ Tableau synthèse    — projets filtrés (optionnel)
 *
 *  Usage :
 *   DashboardPDF.export()              — ouvre le composeur PDF
 *   DashboardPDF.export({ noTable })   — préremplit sans tableau
 *
 *  Dépendances :
 *   - jsPDF  (chargé dynamiquement depuis CDN si absent)
 *   - Analytics, DataFilterEngine, ProjectUtils, FilterManager
 * ════════════════════════════════════════════════════════════════
 */

// ── GUARD ANTI-REDÉCLARATION ─────────────────────────────────────────────────
if (!window.DashboardPDF) {
window.DashboardPDF = (() => {
  'use strict';

  /* ── Palette couleurs (dark theme) ───────────────────────────── */
  const C = {
    bg:       [6, 12, 20],
    card:     [16, 25, 40],
    brand:    [0, 212, 170],
    blue:     [0, 153, 255],
    red:      [255, 77, 109],
    gold:     [245, 183, 64],
    pale:     [159, 179, 200],
    snow:     [220, 232, 245],
    dust:     [90, 112, 137],
    white:    [255, 255, 255],
    border:   [30, 45, 65],
  };

  /* ── Chargement dynamique d'un script CDN ────────────────────── */
  function _loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload  = resolve;
      s.onerror = () => reject(new Error('Impossible de charger : ' + src));
      document.head.appendChild(s);
    });
  }

  async function _ensureDeps() {
    const promises = [];
    if (!window.jspdf && !window.jsPDF)
      promises.push(_loadScript('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js'));
    await Promise.all(promises);
  }

  /* ════════════════════════════════════════════════════════════════
     GESTION UTF-8 ROBUSTE — v2.0
     jsPDF avec helvetica ne supporte pas tous les Unicode.
     On normalise systématiquement avant tout _docText(doc, ).
  ════════════════════════════════════════════════════════════════ */

  /** Table de remplacement emoji → texte ASCII neutre */
  const _EMOJI_MAP = {
    '\uD83D\uDCCA': '[Graph]', '\uD83D\uDCC8': '[+]',   '\uD83D\uDCC9': '[-]',
    '\uD83D\uDCB0': '[CA]',    '\uD83C\uDFAF': '[Cible]','\uD83C\uDFC6': '[Top]',
    '\u26A0\uFE0F': '[!]',     '\u26A0': '[!]',          '\u2705': '[OK]',
    '\u274C': '[X]',           '\uD83D\uDD2E': '[~]',    '\uD83D\uDCBC': '[Proj]',
    '\uD83C\uDFE6': '[Banq]',  '\uD83D\uDCC5': '[Date]', '\uD83C\uDF0D': '[Zone]',
    '\uD83C\uDFE2': '[Cli]',   '\uD83D\uDD0D': '[Filtr]','\uD83D\uDCCB': '[Liste]',
    '\uD83D\uDCC1': '[Dos]',   '\uD83D\uDCA1': '[>]',    '\uD83D\uDCC4': '[PDF]',
    '\u26A1': '[kW]',          '\uD83D\uDDD3\uFE0F': '[Cal]',
    '\u2197': '[^]',           '\u2198': '[v]',          '\u2192': '->',
    '\u2190': '<-',            '\u2026': '...',           '\u2715': 'x',
    '\u2717': 'x',             '\u2713': 'v',             '\u2014': '-',
    '\u2013': '-',             '\u00B7': '.',             '\u2022': '-',
    '\u00A0': ' ',
  };

  /**
   * Nettoyer une chaîne pour insertion PDF — gestion UTF-8 robuste.
   * @param {string}  str
   * @param {boolean} [keepAccents=true]
   */
  function _safeText(str, keepAccents) {
    if (str === null || str === undefined) return '';
    let s = String(str);

    // 1. Remplacements emoji connus
    Object.entries(_EMOJI_MAP).forEach(([emoji, rep]) => {
      s = s.split(emoji).join(rep);
    });

    // 2. Supprimer les emoji restants (unicode ranges)
    try {
      s = s.replace(/[\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{27BF}][\u{FE00}-\u{FEFF}]?|[\u{1F300}-\u{1F9FF}]/gu, '');
    } catch (e) {
      // Navigateur sans support regexp unicode étendu
      s = s.replace(/[\uD800-\uDFFF]/g, '');
    }

    // 3. Normalisation accents (optionnel)
    if (keepAccents === false) {
      try { s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (_) {}
    }

    // 4. Supprimer caractères de contrôle
    s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    return s.trim();
  }

  /**
   * Wrapper sécurisé pour doc.text() — toujours utiliser à la place de doc.text().
   */
  function _docText(doc, str, x, y, opts) {
    const clean = _safeText(str);
    if (!clean) return;
    try {
      doc.text(clean, x, y, opts || {});
    } catch (e) {
      // Fallback sans accents
      try { doc.text(_safeText(str, false), x, y, opts || {}); } catch (_) {}
    }
  }

  /* ── Helpers données ─────────────────────────────────────────── */
  function _getData() {

    if (typeof DataFilterEngine !== 'undefined' && DataFilterEngine.getFilteredData)
      return DataFilterEngine.getFilteredData();
    return (typeof window !== 'undefined' && window.DATA) ? window.DATA : [];
  }

  function _readBusinessKpiValue(id, fallback) {
    const el = document.getElementById(id);
    if (!el) return fallback || '—';
    const valueNode = el.querySelector('.business-kpi-value');
    const raw = (valueNode ? valueNode.textContent : el.textContent) || '';
    const txt = String(raw).replace(/\s+/g, ' ').trim();
    return txt || (fallback || '—');
  }

  function _getFilters() {
    if (typeof FilterManager !== 'undefined' && FilterManager.getFilters)
      return FilterManager.getFilters();
    return [];
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
    if (!v || isNaN(v) || v === 0) return '—';
    if (typeof ProjectUtils !== 'undefined' && ProjectUtils.formatMontant)
      return ProjectUtils.formatMontant(v, true);
    if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(2) + 'M€';
    if (Math.abs(v) >= 1e3) return Math.round(v / 1e3) + 'k€';
    return Math.round(v) + '€';
  }

  function _fmtDate(raw) {
    if (!raw || raw === 'x' || raw === 'X') return '—';
    if (typeof ProjectUtils !== 'undefined' && ProjectUtils.parseDate) {
      const d = ProjectUtils.parseDate(raw);
      if (!d) return String(raw).trim() || '—';
      return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
    }
    const d = new Date(raw);
    return isNaN(d.getTime()) ? (String(raw).trim() || '—') : d.toLocaleDateString('fr-FR');
  }

  /* ── Barre de progression (export) ──────────────────────────── */
  let _progressEl = null;

  function _showProgress(label) {
    if (!_progressEl) {
      _progressEl = document.createElement('div');
      _progressEl.style.cssText = `
        position:fixed;bottom:1.5rem;right:1.5rem;z-index:99999;
        background:linear-gradient(135deg,#0f1723,#101928);
        border:1px solid rgba(0,212,170,.4);border-radius:12px;
        padding:.85rem 1.25rem;min-width:260px;
        box-shadow:0 8px 32px rgba(0,0,0,.6);
        font-family:'DM Mono',monospace;font-size:.78rem;color:#dce8f5;
        display:flex;flex-direction:column;gap:.4rem;
      `;
      document.body.appendChild(_progressEl);
    }
    _progressEl.innerHTML = `
      <div style="display:flex;align-items:center;gap:.6rem;">
        <span style="font-size:.9rem;">📄</span>
        <span style="font-weight:700;color:#00d4aa;">Export PDF en cours…</span>
      </div>
      <div style="color:#9fb3c8;font-size:.72rem;">${label}</div>
      <div style="height:3px;background:rgba(255,255,255,.08);border-radius:99px;overflow:hidden;">
        <div id="_pdf-bar" style="height:100%;background:linear-gradient(90deg,#00d4aa,#0099ff);width:10%;
          border-radius:99px;transition:width .3s ease;"></div>
      </div>
    `;
  }

  function _setProgress(pct, label) {
    const bar = document.getElementById('_pdf-bar');
    if (bar) bar.style.width = pct + '%';
    if (_progressEl && label) {
      const labelEl = _progressEl.querySelector('div:nth-child(2)');
      if (labelEl) labelEl.textContent = label;
    }
  }

  function _hideProgress() {
    if (_progressEl) {
      _progressEl.style.opacity = '0';
      _progressEl.style.transition = 'opacity .4s ease';
      setTimeout(() => { if (_progressEl) { _progressEl.remove(); _progressEl = null; } }, 500);
    }
  }

  /* ── Constructeur PDF ────────────────────────────────────────── */

  /**
   * Dessiner le fond sombre de la page
   */
  function _drawPageBg(doc) {
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();
    doc.setFillColor(...C.bg);
    doc.rect(0, 0, w, h, 'F');
  }

  /**
   * Ajouter un en-tête de section (barre colorée + titre)
   */
  function _drawSectionHeader(doc, y, title, color = C.brand) {
    const w = doc.internal.pageSize.getWidth();
    doc.setFillColor(...color);
    doc.rect(14, y, w - 28, 0.6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...color);
    _docText(doc, title, 14, y - 2);
    return y + 6;
  }

  /**
   * Page 1 — Couverture
   */
  function _buildCoverPage(doc, filters) {
    _drawPageBg(doc);
    const w = doc.internal.pageSize.getWidth();

    // Fond dégradé titre (rectangle supérieur)
    doc.setFillColor(...C.card);
    doc.rect(0, 0, w, 80, 'F');

    // Barre de couleur brand en haut
    doc.setFillColor(...C.brand);
    doc.rect(0, 0, w, 3, 'F');

    // Titre principal
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(28);
    doc.setTextColor(...C.snow);
    _docText(doc, 'Dashboard Analytique', w / 2, 30, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(13);
    doc.setTextColor(...C.brand);
    _docText(doc, 'Rapport de Performance Commerciale', w / 2, 42, { align: 'center' });

    // Date d'export
    const now = new Date();
    const dateStr = `${String(now.getDate()).padStart(2,'0')}/${String(now.getMonth()+1).padStart(2,'0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

    doc.setFontSize(9);
    doc.setTextColor(...C.dust);
    _docText(doc, `Généré le ${dateStr}`, w / 2, 56, { align: 'center' });

    // Période active
    const activeField = (typeof Analytics !== 'undefined' && Analytics.config)
      ? Analytics.config.activeDateField : 'Date réception';
    doc.setFontSize(9);
    doc.setTextColor(...C.pale);
    _docText(doc, `Champ date : ${activeField}`, w / 2, 65, { align: 'center' });

    // Filtres actifs
    let y = 92;
    if (filters.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...C.brand);
      _docText(doc, 'Filtres actifs', 14, y);
      y += 7;

      filters.forEach(f => {
        doc.setFillColor(...C.card);
        doc.roundedRect(14, y - 4, 80, 7, 1.5, 1.5, 'F');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...C.pale);
        _docText(doc, `${f.type}`, 17, y);
        doc.setTextColor(...C.snow);
        _docText(doc, String(f.label || f.value), 50, y);
        y += 9;
      });
    } else {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...C.dust);
      _docText(doc, 'Aucun filtre actif — toutes les données', 14, y);
      y += 10;
    }

    // Résumé données
    const data = _getData();
    const won  = data.filter(p => _getStatus(p) === 'obtenu').length;
    const lost = data.filter(p => _getStatus(p) === 'perdu').length;
    const offre= data.filter(p => _getStatus(p) === 'offre').length;
    const caTotal  = data.reduce((s, p) => s + _getCA(p, 'ca_etudie'), 0);
    const caGagne  = data.reduce((s, p) => s + _getCA(p, 'ca_gagne'),  0);

    y = Math.max(y + 10, 130);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...C.brand);
    _docText(doc, 'Synthèse des données', 14, y);
    y += 8;

    const summaryItems = [
      { label: 'Total projets',    value: String(data.length)   },
      { label: 'Obtenus',          value: String(won)           },
      { label: 'En cours',         value: String(offre)         },
      { label: 'Perdus',           value: String(lost)          },
      { label: 'CA Total (Bud)',   value: _fmt(caTotal)         },
      { label: 'CA Gagné',         value: _fmt(caGagne)         },
    ];

    const decided = won + lost;
    if (decided > 0)
      summaryItems.push({ label: 'Taux conversion', value: Math.round(won / decided * 100) + '%' });

    summaryItems.forEach((item, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x   = 14 + col * 95;
      const cy  = y + row * 12;
      doc.setFillColor(...C.card);
      doc.roundedRect(x, cy - 5, 88, 10, 2, 2, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...C.dust);
      _docText(doc, item.label, x + 4, cy);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...C.snow);
      _docText(doc, item.value, x + 4, cy + 5);
    });

    // Pied de page
    _drawFooter(doc, 1);
  }

  /**
   * Page 2 — KPIs stratégiques
   */
  function _buildKPIsPage(doc) {
    doc.addPage();
    _drawPageBg(doc);
    let y = 18;

    y = _drawSectionHeader(doc, y, '📊  KPIs Stratégiques');

    const data = _getData();
    if (!data.length) {
      doc.setFontSize(9);
      doc.setTextColor(...C.dust);
      _docText(doc, 'Aucune donnée disponible.', 14, y + 10);
      _drawFooter(doc, 2);
      return;
    }

    const won   = data.filter(p => _getStatus(p) === 'obtenu');
    const lost  = data.filter(p => _getStatus(p) === 'perdu');
    const offre = data.filter(p => _getStatus(p) === 'offre');
    const decided = won.length + lost.length;

    const caTotal  = data.reduce((s, p) => s + _getCA(p, 'ca_etudie'), 0);
    const caGagne  = won.reduce((s, p)  => s + _getCA(p, 'ca_gagne'),  0);
    const caParP   = won.length > 0 ? Math.round(caGagne / won.length) : 0;
    const tauxConv = decided > 0 ? Math.round(won.length / decided * 100) : null;
    const tauxPert = decided > 0 ? Math.round(lost.length / decided * 100) : null;

    // Pipeline pondéré
    let pipeline = won.reduce((s, p) => s + _getCA(p, 'ca_etudie'), 0);
    offre.forEach(p => {
      if (typeof Analytics !== 'undefined' && Analytics.getCAValue)
        pipeline += Analytics.getCAValue(p, 'pipeline');
    });
    pipeline = Math.round(pipeline);

    // Concentration client
    const byClient = {};
    won.forEach(p => {
      const c = (p['Client'] || '').trim();
      if (!c) return;
      byClient[c] = (byClient[c] || 0) + _getCA(p, 'ca_gagne');
    });
    const topEntries = Object.entries(byClient).sort((a, b) => b[1] - a[1]);
    const topClient  = topEntries[0];
    const concPct    = topClient && caGagne > 0
      ? Math.round(topClient[1] / caGagne * 100) : null;

    const kpiPipeMargin = _readBusinessKpiValue('biz-kpi-pipe-margin', '—');
    const kpiPipeMarginVsBud = _readBusinessKpiValue('biz-kpi-pipe-margin-vs-bud', '—');
    const kpiPipeWeightedVsMargin = _readBusinessKpiValue('biz-kpi-pipe-margin-ratio', '—');

    const kpis = [
      { icon: '📊', label: 'CA Total (Bud)',     value: _fmt(caTotal),                    sub: `dont ${_fmt(caGagne)} obtenus`,   color: C.pale   },
      { icon: '🔮', label: 'Pipeline Pondéré',   value: _fmt(pipeline),                   sub: `${offre.length} offres en cours`,  color: C.blue   },
      { icon: '🎯', label: 'Taux de Conversion', value: tauxConv !== null ? tauxConv + '%' : '—', sub: `${won.length}/${decided} décidés`, color: C.brand  },
      { icon: '📉', label: 'Taux de Perte',      value: tauxPert !== null ? tauxPert + '%' : '—', sub: `${lost.length} perdus`,    color: C.red    },
      { icon: '💼', label: 'CA Moy. Gagné',      value: caParP > 0 ? _fmt(caParP) : '—', sub: `sur ${won.length} projet(s)`,     color: C.brand  },
      { icon: '🏦', label: 'Concentration',       value: concPct !== null ? concPct + '%' : '—', sub: topClient ? topClient[0].substring(0, 22) : '—', color: C.gold },
      { icon: '🧮', label: 'Marge Brute Latente', value: kpiPipeMargin,                    sub: 'Pipe remis + en étude',            color: C.blue   },
      { icon: '⚖️', label: '% Marge / Bud',       value: kpiPipeMarginVsBud,               sub: 'Hors marges vides',                color: C.pale   },
      { icon: '🔁', label: '% CA Win / Marge',    value: kpiPipeWeightedVsMargin,          sub: 'Hors marges vides',                color: C.brand  },
    ];

    const cardW = 88;
    const cardH = 28;
    const rowGap = 32;
    y += 4;
    kpis.forEach((kpi, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x   = 14 + col * 95;
      const cy  = y + row * rowGap;

      // Carte
      doc.setFillColor(...C.card);
      doc.roundedRect(x, cy, cardW, cardH, 3, 3, 'F');

      // Barre colorée supérieure
      doc.setFillColor(...kpi.color);
      doc.roundedRect(x, cy, cardW, 1.2, 0.5, 0.5, 'F');

      // Icône + label
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...C.dust);
      _docText(doc, `${kpi.icon}  ${kpi.label}`, x + 5, cy + 9);

      // Valeur principale
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(...C.snow);
      _docText(doc, kpi.value, x + 5, cy + 20);

      // Sous-texte
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...C.dust);
      _docText(doc, kpi.sub, x + 5, cy + 25);
    });

    _drawFooter(doc, 2);
  }

  /**
   * Pages graphiques — capture canvas Chart.js  (v2.1 corrigé)
   *
   *  CORRECTIONS v2.1 :
   *   ✅ 1 graphique par page — lisibilité maximale
   *   ✅ Proportions conservées — ratio natif du canvas réel
   *   ✅ Capture directe fiable (pas de clone — détruit les callbacks)
   *   ✅ Légende rendue sous le graphique avec pastilles couleur
   *   ✅ Titre du graphique en bandeau
   *   ✅ Analyse contextuelle si ChartAnalysis disponible
   */
  function _listExportableCharts() {
    return Array.from(document.querySelectorAll('canvas[id]'))
      .filter(c => c.offsetParent !== null && (c.width || 0) > 50 && (c.height || 0) > 50)
      .map(canvas => {
        const card = canvas.closest('.chart-card, .chart-section, [class*="card"]');
        const title = card
          ?.querySelector('h3, h4, .chart-title, .card-title')?.textContent?.trim()
          || canvas.id.replace(/-/g, ' ').replace(/\bchart\b/gi, '').trim();
        return { id: canvas.id, canvas, title: _safeText(title || canvas.id) };
      });
  }

  function _createExportDialog(charts) {
    return new Promise(resolve => {
      function presetMatches(presetName, chartId) {
        if (presetName === 'direction') {
          return /^biz-chart-perf-(month|zone|client|type|zone-client|client-type)$/.test(chartId)
            || /^biz-chart-pipe-(zone|client|type|zone-client|client-type)$/.test(chartId);
        }
        if (presetName === 'commercial') {
          return /^biz-chart-pipe-/.test(chartId)
            || chartId === 'biz-chart-perf-client'
            || chartId === 'biz-chart-perf-zone-client';
        }
        if (presetName === 'performance') {
          return /^biz-chart-perf-/.test(chartId);
        }
        return false;
      }

      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;z-index:100001;background:rgba(3,8,15,.72);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:1rem;';
      const modal = document.createElement('div');
      modal.style.cssText = 'width:min(920px,100%);max-height:min(88vh,900px);overflow:hidden;border-radius:20px;border:1px solid rgba(0,212,170,.2);background:linear-gradient(180deg,#0c1524,#0b1220);box-shadow:0 28px 80px rgba(0,0,0,.55);display:flex;flex-direction:column;';
      const rows = charts.map(function(chart, index) {
        return '<label style="display:flex;align-items:flex-start;gap:.75rem;padding:.7rem .8rem;border:1px solid rgba(255,255,255,.06);border-radius:12px;background:rgba(255,255,255,.02);cursor:pointer;">'
          + '<input type="checkbox" data-pdf-chart="' + chart.id + '" ' + (index < 8 ? 'checked' : '') + ' style="margin-top:.15rem;accent-color:#00d4aa;">'
          + '<span style="display:flex;flex-direction:column;gap:.18rem;">'
          + '<span style="color:#dce8f5;font:600 .86rem var(--sans, system-ui);">' + chart.title + '</span>'
          + '<span style="color:#6b7f96;font:500 .68rem var(--mono, monospace);">' + chart.id + '</span>'
          + '</span></label>';
      }).join('');
      modal.innerHTML =
        '<div style="padding:1rem 1.1rem;border-bottom:1px solid rgba(255,255,255,.08);display:flex;justify-content:space-between;gap:1rem;align-items:flex-start;flex-wrap:wrap;">'
        + '<div><div style="color:#dce8f5;font:700 1.05rem var(--serif, Georgia, serif);">Composer le PDF</div>'
        + '<div style="color:#8fa6bf;font:500 .82rem var(--sans, system-ui);margin-top:.25rem;">Choisis les graphiques à exporter et combien tu veux en mettre sur chaque page.</div></div>'
        + '<button type="button" data-pdf-close style="border:none;background:transparent;color:#8fa6bf;font-size:1.15rem;cursor:pointer;">✕</button></div>'
        + '<div style="padding:1rem 1.1rem;display:grid;grid-template-columns:minmax(0,1fr) 240px;gap:1rem;overflow:auto;">'
        + '<div><div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:.8rem;">'
        + '<button type="button" data-pdf-all class="btn-hdr">Tout sélectionner</button>'
        + '<button type="button" data-pdf-none class="btn-hdr">Tout retirer</button>'
        + '<button type="button" data-pdf-business class="btn-hdr">Graphiques métier</button>'
        + '<button type="button" data-pdf-preset="direction" class="btn-hdr">PDF direction</button>'
        + '<button type="button" data-pdf-preset="commercial" class="btn-hdr">PDF commercial</button>'
        + '<button type="button" data-pdf-preset="performance" class="btn-hdr">PDF performance</button>'
        + '</div><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:.7rem;max-height:52vh;overflow:auto;padding-right:.2rem;">'
        + rows
        + '</div></div>'
        + '<div style="display:flex;flex-direction:column;gap:.9rem;">'
        + '<label style="display:flex;flex-direction:column;gap:.35rem;"><span style="color:#8fa6bf;font:600 .66rem var(--mono, monospace);text-transform:uppercase;letter-spacing:.06em;">Graphiques par page</span>'
        + '<select id="pdf-charts-per-page" style="min-height:42px;border-radius:12px;border:1px solid rgba(255,255,255,.1);background:#101928;color:#dce8f5;padding:.7rem .8rem;"><option value="1">1 par page</option><option value="2" selected>2 par page</option><option value="4">4 par page</option></select></label>'
        + '<label style="display:flex;align-items:flex-start;gap:.55rem;color:#dce8f5;font-size:.86rem;"><input type="checkbox" id="pdf-include-table" checked style="margin-top:.2rem;accent-color:#00d4aa;"><span>Inclure le tableau des projets filtrés</span></label>'
        + '<div style="padding:.75rem;border-radius:14px;background:rgba(0,212,170,.06);border:1px solid rgba(0,212,170,.15);color:#9fd9ff;font:.76rem var(--sans, system-ui);line-height:1.45;">Astuce : 2 par page donne en général le meilleur compromis entre lisibilité et densité.</div>'
        + '<div style="display:flex;gap:.55rem;flex-wrap:wrap;margin-top:auto;">'
        + '<button type="button" data-pdf-cancel class="btn-hdr" style="flex:1 1 120px;">Annuler</button>'
        + '<button type="button" data-pdf-start class="btn-hdr" style="flex:1 1 160px;background:linear-gradient(135deg,rgba(0,212,170,.22),rgba(0,153,255,.14));border-color:rgba(0,212,170,.45);color:#00d4aa;">Générer le PDF</button>'
        + '</div></div></div>';
      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      function close(payload) { overlay.remove(); resolve(payload); }
      overlay.addEventListener('click', function(e) { if (e.target === overlay) close(null); });
      modal.querySelector('[data-pdf-close]').addEventListener('click', function() { close(null); });
      modal.querySelector('[data-pdf-cancel]').addEventListener('click', function() { close(null); });
      modal.querySelector('[data-pdf-all]').addEventListener('click', function() {
        modal.querySelectorAll('[data-pdf-chart]').forEach(function(input) { input.checked = true; });
      });
      modal.querySelector('[data-pdf-none]').addEventListener('click', function() {
        modal.querySelectorAll('[data-pdf-chart]').forEach(function(input) { input.checked = false; });
      });
      modal.querySelector('[data-pdf-business]').addEventListener('click', function() {
        modal.querySelectorAll('[data-pdf-chart]').forEach(function(input) {
          input.checked = input.getAttribute('data-pdf-chart').indexOf('biz-chart-') === 0;
        });
      });
      modal.querySelectorAll('[data-pdf-preset]').forEach(function(button) {
        button.addEventListener('click', function() {
          var presetName = button.getAttribute('data-pdf-preset');
          modal.querySelectorAll('[data-pdf-chart]').forEach(function(input) {
            input.checked = presetMatches(presetName, input.getAttribute('data-pdf-chart'));
          });
          var select = modal.querySelector('#pdf-charts-per-page');
          if (select) {
            select.value = presetName === 'direction' ? '2' : '1';
          }
        });
      });
      modal.querySelector('[data-pdf-start]').addEventListener('click', function() {
        const selectedChartIds = Array.from(modal.querySelectorAll('[data-pdf-chart]:checked')).map(function(input) {
          return input.getAttribute('data-pdf-chart');
        });
        if (!selectedChartIds.length) {
          alert('Sélectionne au moins un graphique pour générer le PDF.');
          return;
        }
        close({
          selectedChartIds: selectedChartIds,
          chartsPerPage: parseInt(modal.querySelector('#pdf-charts-per-page').value, 10) || 2,
          noTable: !modal.querySelector('#pdf-include-table').checked
        });
      });
    });
  }

  async function _buildChartPages(doc, startPage, options) {
    options = options || {};
    const allCharts = _listExportableCharts();
    const selectedIds = Array.isArray(options.selectedChartIds) && options.selectedChartIds.length ? new Set(options.selectedChartIds) : null;
    const canvases = allCharts.filter(item => !selectedIds || selectedIds.has(item.id)).map(item => item.canvas);
    if (!canvases.length) return startPage;

    const docW   = doc.internal.pageSize.getWidth();
    const MARGIN = 14;
    const AVAIL  = docW - MARGIN * 2;
    let pageNum = startPage;

    function _resolveInst(canvas) {
      if (typeof ChartsEnrichis !== 'undefined' && ChartsEnrichis.charts) {
        const inst = ChartsEnrichis.charts[canvas.id];
        if (inst && inst.canvas === canvas) return inst;
      }
      if (typeof Chart !== 'undefined') {
        if (typeof Chart.getChart === 'function') {
          const inst = Chart.getChart(canvas);
          if (inst) return inst;
        }
        if (Chart.instances) {
          const inst = Object.values(Chart.instances).find(c => c.canvas === canvas);
          if (inst) return inst;
        }
      }
      return null;
    }

    function _captureCanvas(canvas) {
      const inst = _resolveInst(canvas);
      if (inst) {
        const savedAnim = inst.options.animation;
        const savedResponsive = inst.options.responsive;
        try {
          inst.options.animation = false;
          inst.options.responsive = false;
          inst.update('none');
          const dataURL = inst.canvas.toDataURL('image/png', 1.0);
          inst.options.animation = savedAnim;
          inst.options.responsive = savedResponsive;
          return { dataURL, width: inst.canvas.width || canvas.offsetWidth || 600, height: inst.canvas.height || canvas.offsetHeight || 300, inst };
        } catch (e) {
          inst.options.animation = savedAnim;
          inst.options.responsive = savedResponsive;
          console.warn('[DashboardPDF] update/toDataURL échoué pour', canvas.id, e);
        }
      }
      try {
        return { dataURL: canvas.toDataURL('image/png', 1.0), width: canvas.width || 600, height: canvas.height || 300, inst: null };
      } catch (e) {
        console.warn('[DashboardPDF] toDataURL fallback échoué pour', canvas.id, e);
        return null;
      }
    }

    function _isDenseHorizontalChart(canvas) {
      const inst = _resolveInst(canvas);
      if (!inst || !inst.data) return false;
      const labelsCount = Array.isArray(inst.data.labels) ? inst.data.labels.length : 0;
      const axis = (inst.options && inst.options.indexAxis) ? inst.options.indexAxis : 'x';
      return (axis === 'y' && labelsCount >= 9) || labelsCount >= 14;
    }

    function _getLayout(count, forceTallSingle) {
      if (count >= 4) {
        const half = (AVAIL - 4) / 2;
        return { perPage: 4, cells: [
          { x: MARGIN, y: 18, w: half, h: 118 },
          { x: MARGIN + half + 4, y: 18, w: half, h: 118 },
          { x: MARGIN, y: 142, w: half, h: 118 },
          { x: MARGIN + half + 4, y: 142, w: half, h: 118 }
        ] };
      }
      if (count === 1) return { perPage: 1, cells: [{ x: MARGIN, y: 18, w: AVAIL, h: forceTallSingle ? 246 : 238 }] };
      return { perPage: 2, cells: [{ x: MARGIN, y: 18, w: AVAIL, h: 114 }, { x: MARGIN, y: 141, w: AVAIL, h: 114 }] };
    }

    function _drawChartCard(cell, canvas, captured, index, total) {
      const card = canvas.closest('.chart-card, .chart-section, [class*="card"]');
      const title = card?.querySelector('h3, h4, .chart-title, .card-title')?.textContent?.trim()
        || canvas.id.replace(/-/g, ' ').replace(/\bchart\b/gi, '').trim();
      const imgData = captured.dataURL;
      const cw = captured.width;
      const ch = captured.height;
      const inst = captured.inst;
      doc.setFillColor(...C.card);
      doc.roundedRect(cell.x, cell.y, cell.w, cell.h, 2, 2, 'F');
      doc.setFillColor(...C.brand);
      doc.roundedRect(cell.x, cell.y, 3, 9, 0.5, 0.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(cell.w < 100 ? 7.3 : 8.5);
      doc.setTextColor(...C.snow);
      _docText(doc, title || canvas.id, cell.x + 7, cell.y + 6);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(...C.dust);
      _docText(doc, index + ' / ' + total, cell.x + cell.w - 4, cell.y + 6, { align: 'right' });

      const pad = 4;
      const imgTop = cell.y + 12;
      const imgW = cell.w - pad * 2;
      let imgH = Math.round(imgW * ((ch || 1) / (cw || 1)));
      const maxH = cell.h - (inst ? 18 : 12);
      if (imgH > maxH) imgH = maxH;
      if (imgH < 28) imgH = 28;
      try {
        doc.addImage(imgData, 'PNG', cell.x + pad, imgTop, imgW, imgH);
      } catch (e) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...C.dust);
        _docText(doc, '[Graphique non rendu]', cell.x + (cell.w / 2), imgTop + 20, { align: 'center' });
      }

      if (inst && inst.data && Array.isArray(inst.data.datasets) && inst.data.datasets.length > 1) {
        const series = inst.data.datasets.slice(0, cell.w < 100 ? 2 : 4);
        const parseColor = function(raw) {
          const txt = String(raw || '#0099ff');
          const rgba = txt.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/);
          if (rgba) return { r: +rgba[1], g: +rgba[2], b: +rgba[3] };
          const hex = txt.match(/^#([0-9a-f]{6})$/i);
          if (hex) {
            const n = parseInt(hex[1], 16);
            return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
          }
          return { r: 0, g: 153, b: 255 };
        };
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(5.8);
        series.forEach(function(ds, idx) {
          const colorSample = Array.isArray(ds.backgroundColor) ? ds.backgroundColor[0] : (ds.borderColor || ds.backgroundColor);
          const c = parseColor(colorSample);
          const cols = cell.w < 100 ? 1 : 2;
          const lx = cell.x + pad + ((idx % cols) * ((imgW - 6) / cols));
          const ly = Math.min(cell.y + cell.h - 6, imgTop + imgH + 7 + Math.floor(idx / cols) * 4.2);
          doc.setFillColor(c.r, c.g, c.b);
          doc.circle(lx + 1.2, ly - 1.1, .9, 'F');
          doc.setTextColor(...C.pale);
          _docText(doc, _safeText(String(ds.label || ('Série ' + (idx + 1)))).substring(0, cell.w < 100 ? 14 : 18), lx + 3.2, ly);
        });
      }
    }

    const preferredPerPage = Math.max(1, Math.min(4, Number(options.chartsPerPage) || 2));
    let chartIdx = 0;
    while (chartIdx < canvases.length) {
      const probeSlice = canvases.slice(chartIdx, chartIdx + preferredPerPage);
      const hasDenseChart = probeSlice.some(_isDenseHorizontalChart);
      const layout = _getLayout(hasDenseChart ? 1 : preferredPerPage, hasDenseChart);
      doc.addPage();
      _drawPageBg(doc);
      pageNum++;
      const slice = canvases.slice(chartIdx, chartIdx + layout.perPage);
      for (let i = 0; i < slice.length; i++) {
        const canvas = slice[i];
        _setProgress(30 + Math.round(((chartIdx + i) / canvases.length) * 55), 'Capture : ' + canvas.id + '…');
        const captured = _captureCanvas(canvas);
        if (!captured || !captured.dataURL || captured.dataURL === 'data:,') {
          console.warn('[DashboardPDF] Canvas ignoré (vide):', canvas.id);
          continue;
        }
        _drawChartCard(layout.cells[i], canvas, captured, chartIdx + i + 1, canvases.length);
      }
      _drawFooter(doc, pageNum);
      chartIdx += layout.perPage;
    }
    return pageNum;
  }
  /**
   * Page tableau — synthèse projets filtrés
   */
  function _buildTablePage(doc, startPage) {
    const data = _getData();
    if (!data.length) return startPage;

    doc.addPage();
    _drawPageBg(doc);
    const w      = doc.internal.pageSize.getWidth();
    const pageH  = doc.internal.pageSize.getHeight();
    let y        = 18;
    let pageNum  = startPage + 1;

    y = _drawSectionHeader(doc, y, '📋  Tableau des Projets');
    y += 4;

    const cols = [
      { header: 'Projet',    key: 'projet',     w: 52 },
      { header: 'Client',    key: 'Client',     w: 36 },
      { header: 'Date',      key: 'Date réception', w: 22, type: 'date' },
      { header: 'Année',     key: '_annee',     w: 14 },
      { header: 'Budget',    key: 'Bud',        w: 22, type: 'money' },
      { header: 'Statut',    key: '_status',    w: 18, type: 'status' },
    ];
    const rowH = 7;

    // Entête tableau
    let cx = 14;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    cols.forEach(c => {
      doc.setFillColor(...C.card);
      doc.rect(cx, y - 4, c.w, rowH, 'F');
      doc.setTextColor(...C.dust);
      _docText(doc, c.header, cx + 2, y);
      cx += c.w;
    });
    y += rowH - 2;

    // Lignes
    const STATUS_COLORS = {
      obtenu: C.brand,
      perdu:  C.red,
      offre:  C.blue,
      autre:  C.gold,
    };

    const sorted = data.slice().sort((a, b) => {
      const sa = _getStatus(a), sb = _getStatus(b);
      if (sa === 'obtenu' && sb !== 'obtenu') return -1;
      if (sb === 'obtenu' && sa !== 'obtenu') return  1;
      return _getCA(b, 'ca_etudie') - _getCA(a, 'ca_etudie');
    });

    for (const p of sorted) {
      if (y + rowH > pageH - 15) {
        _drawFooter(doc, pageNum);
        doc.addPage();
        _drawPageBg(doc);
        y = 18;
        pageNum++;
        // Ré-afficher l'entête
        cx = 14;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        cols.forEach(c => {
          doc.setFillColor(...C.card);
          doc.rect(cx, y - 4, c.w, rowH, 'F');
          doc.setTextColor(...C.dust);
          _docText(doc, c.header, cx + 2, y);
          cx += c.w;
        });
        y += rowH - 2;
      }

      const st = _getStatus(p);
      cx = 14;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);

      cols.forEach(c => {
        let val = '';
        let textColor = C.pale;

        if (c.type === 'date') {
          val = _fmtDate(p[c.key]);
          textColor = C.dust;
        } else if (c.type === 'money') {
          val = _fmt(_getCA(p, st === 'obtenu' ? 'ca_gagne' : 'ca_etudie'));
          textColor = st === 'obtenu' ? C.brand : C.pale;
        } else if (c.type === 'status') {
          val = { obtenu: 'Gagné', perdu: 'Perdu', offre: 'En cours' }[st] || 'Autre';
          textColor = STATUS_COLORS[st] || C.gold;
        } else if (c.key === '_annee') {
          val = p._annee ? String(p._annee) : '—';
          textColor = C.dust;
        } else {
          val = String(p[c.key] || '—');
        }

        // Tronquer pour tenir dans la colonne
        const maxChars = Math.floor(c.w / 2);
        if (val.length > maxChars) val = val.substring(0, maxChars - 1) + '…';

        doc.setTextColor(...textColor);
        _docText(doc, val, cx + 2, y);
        cx += c.w;
      });

      // Ligne séparatrice légère
      doc.setDrawColor(...C.border);
      doc.setLineWidth(0.1);
      doc.line(14, y + 2, w - 14, y + 2);

      y += rowH;
    }

    _drawFooter(doc, pageNum);
    return pageNum;
  }

  /**
   * Pied de page — numéro + titre
   */
  function _drawFooter(doc, pageNum) {
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();
    doc.setFillColor(...C.card);
    doc.rect(0, h - 10, w, 10, 'F');
    doc.setFillColor(...C.brand);
    doc.rect(0, h - 10, w, 0.4, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...C.dust);
    _docText(doc, 'Dashboard Analytique — Confidentiel', 14, h - 4);
    _docText(doc, `Page ${pageNum}`, w - 14, h - 4, { align: 'right' });
  }

  /* ── API publique : export ───────────────────────────────────── */
  /**
   * Lancer l'export PDF du dashboard.
   * @param {Object} [options]
   * @param {boolean} [options.noTable=false]  Sauter le tableau des projets
   */
  async function exportPDF(options = {}) {
    if (!options._fromDialog) {
      const chartChoices = _listExportableCharts();
      const picked = await _createExportDialog(chartChoices);
      if (!picked) return;
      options = Object.assign({}, options, picked, { _fromDialog: true });
    }

    _showProgress('Chargement des dépendances…');
    _setProgress(5, 'Chargement des dépendances…');

    try {
      await _ensureDeps();
    } catch (e) {
      _hideProgress();
      alert('Impossible de charger jsPDF. Vérifiez votre connexion internet.');
      console.error('[DashboardPDF]', e);
      return;
    }

    const jsPDFConstructor = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    if (!jsPDFConstructor) {
      _hideProgress();
      alert('[DashboardPDF] jsPDF non disponible.');
      return;
    }

    _setProgress(10, 'Initialisation du document…');

    const doc = new jsPDFConstructor({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const filters = _getFilters();

    // ① Couverture
    _setProgress(15, 'Page de couverture…');
    _buildCoverPage(doc, filters);

    // ② KPIs
    _setProgress(22, 'KPIs stratégiques…');
    _buildKPIsPage(doc);

    // ③ Graphiques
    _setProgress(30, 'Capture des graphiques…');
    let lastPage = 2;
    try {
      lastPage = await _buildChartPages(doc, lastPage, options);
    } catch (e) {
      console.error('[DashboardPDF] Erreur capture graphiques:', e);
    }

    // ④ Tableau (optionnel)
    if (!options.noTable) {
      _setProgress(85, 'Tableau des projets…');
      _buildTablePage(doc, lastPage);
    }

    // Sauvegarde
    _setProgress(95, 'Génération du fichier…');
    const now = new Date();
    const dateTag = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
    const filename = `dashboard-analytique-${dateTag}.pdf`;

    doc.save(filename);

    _setProgress(100, 'Terminé ✅');
    setTimeout(_hideProgress, 1500);
    console.log(`%c📄 DashboardPDF — "${filename}" généré`, 'color:#00d4aa;font-weight:700');
  }

  /* ── Injection bouton Export PDF dans l'UI ───────────────────── */
  function injectExportButton() {
    if (document.getElementById('btn-export-pdf')) return;

    // Chercher la barre d'actions existante
    const actionBar = document.querySelector('[data-header-menu-panel="exports"]')
      || document.querySelector('.hdr-actions-main')
      || document.querySelector('.btn-hdr')?.parentElement
      || document.querySelector('.header-actions, .dashboard-actions, .toolbar');

    const btn = document.createElement('button');
    btn.id          = 'btn-export-pdf';
    btn.className   = 'btn-hdr';  // cohérent avec le style existant
    btn.innerHTML   = '📄 Export PDF';
    btn.title       = 'Exporter le dashboard en PDF';
    btn.style.cssText = `
      background: linear-gradient(135deg, rgba(0,212,170,.18), rgba(0,153,255,.12));
      border: 1px solid rgba(0,212,170,.4);
      border-radius: 8px;
      color: #00d4aa;
      font-family: 'DM Mono', monospace;
      font-size: .78rem;
      font-weight: 600;
      padding: .4rem .9rem;
      cursor: pointer;
      transition: all .18s ease;
      white-space: nowrap;
    `;
    btn.addEventListener('mouseenter', () => {
      btn.style.background    = 'linear-gradient(135deg, rgba(0,212,170,.3), rgba(0,153,255,.2))';
      btn.style.borderColor   = 'rgba(0,212,170,.7)';
      btn.style.transform     = 'translateY(-1px)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background    = 'linear-gradient(135deg, rgba(0,212,170,.18), rgba(0,153,255,.12))';
      btn.style.borderColor   = 'rgba(0,212,170,.4)';
      btn.style.transform     = 'translateY(0)';
    });
    btn.addEventListener('click', () => exportPDF());

    if (actionBar) {
      actionBar.appendChild(btn);
    } else {
      // Fallback : ajouter directement dans le header ou body
      const header = document.querySelector('header, .dashboard-header, nav');
      if (header) {
        btn.style.position = 'fixed';
        btn.style.bottom   = '1.5rem';
        btn.style.left     = '1.5rem';
        btn.style.zIndex   = '9000';
        btn.style.boxShadow = '0 4px 16px rgba(0,0,0,.5)';
        document.body.appendChild(btn);
      } else {
        btn.style.cssText += 'position:fixed;bottom:1.5rem;left:1.5rem;z-index:9000;box-shadow:0 4px 16px rgba(0,0,0,.5);';
        document.body.appendChild(btn);
      }
    }

    console.log('[DashboardPDF] ✅ Bouton Export PDF injecté');
  }

  /* ── Init auto ───────────────────────────────────────────────── */
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', injectExportButton);
    } else {
      setTimeout(injectExportButton, 200);
    }
  }

  console.log('%c📄 DashboardPDF v2.0 chargé — UTF-8 robuste + ChartAnalysis intégré', 'color:#00d4aa;font-weight:700');

  /* ── API publique ────────────────────────────────────────────── */
  return {
    export: exportPDF,
    injectExportButton,
  };
})();
} // end guard !window.DashboardPDF
