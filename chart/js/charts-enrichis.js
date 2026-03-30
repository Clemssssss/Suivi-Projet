/**
 * ============================================================
 * CHARTS-ENRICHIS.JS — Rendu visuel centralisé v2.0
 * ============================================================
 *
 * Responsabilité UNIQUE : Rendu Chart.js.
 * AUCUN calcul métier ici → tout via Analytics.*
 *
 * Nouveaux graphiques :
 *  - Funnel commercial complet
 *  - CA par année (étudié vs gagné)
 *  - Délai moyen par statut (bar horizontal)
 *  - Scatter Puissance MW vs CA
 *  - Taux de conversion par client
 *  - CA par zone géographique
 *
 * Améliorations :
 *  - Tooltips enrichis (%, CA, évolution)
 *  - Sous-titre dynamique via AnalyticsInsights
 *  - Animation cohérente
 *  - Segments critiques mis en évidence
 *
 * Dépendances :
 *  - Chart.js 4.x
 *  - analytics.js  (ProjectUtils inclus dedans via dépendance)
 *  - projectUtils.js
 * ============================================================
 */

(function (global) {
  'use strict';

  /* ──────────────────────────────────────────────────────
     PALETTE & THÈME
  ────────────────────────────────────────────────────── */
  const THEME = {
    bg:      '#060c14',
    card:    '#101928',
    brand:   '#00d4aa',
    blue:    '#0099ff',
    red:     '#ff4d6d',
    gold:    '#f5b740',
    violet:  '#8b78f8',
    green:   '#10b981',
    pale:    '#9fb3c8',
    snow:    '#dce8f5',
    // status
    obtenu:  '#00d4aa',
    perdu:   '#ff4d6d',
    offre:   '#0099ff',
    autre:   '#f5b740',
  };

  // Palette étendue à 20 couleurs distinctes — évite les doublons pour les graphiques
  // avec > 10 éléments (top12, types de projet sans limite, zones géographiques, etc.)
  const PALETTE = [
    THEME.brand,  // #00d4aa  vert turquoise
    THEME.blue,   // #0099ff  bleu
    THEME.gold,   // #f5b740  or
    THEME.violet, // #8b78f8  violet
    THEME.green,  // #10b981  vert émeraude
    '#ec4899',    // rose
    '#f97316',    // orange
    '#06b6d4',    // cyan
    '#a855f7',    // pourpre
    '#84cc16',    // vert lime
    // 10 couleurs supplémentaires pour les graphiques avec > 10 éléments
    '#e11d48',    // rose foncé
    '#0ea5e9',    // bleu ciel
    '#d97706',    // ambre
    '#7c3aed',    // violet foncé
    '#059669',    // vert forêt
    '#db2777',    // magenta
    '#ea580c',    // orange foncé
    '#0891b2',    // bleu canard
    '#9333ea',    // violet vif
    '#65a30d',    // olive
  ];

  /**
   * _getCA — PONT VERS Analytics.getCAValue (Source Unique de Vérité)
   * Aucune lecture directe de p['Bud'] dans les graphiques.
   * @param {Object} p
   * @param {string} [mode='ca_etudie']  'ca_etudie' | 'ca_gagne' | 'pipeline'
   */
  function _getCA(p, mode) {
    if (typeof Analytics !== 'undefined' && Analytics.getCAValue)
      return Analytics.getCAValue(p, mode || 'ca_etudie');
    // Fallback si Analytics non chargé (ne devrait pas arriver)
    const bud = (typeof ProjectUtils !== 'undefined' && ProjectUtils.parseMontant)
      ? (ProjectUtils.parseMontant(p['Bud']) || 0)
      : (parseFloat(p['Bud']) || 0);
    if (mode === 'ca_gagne')
      return (typeof ProjectUtils !== 'undefined' ? ProjectUtils.getStatus(p) : (p['Statut']||'').toLowerCase()) === 'obtenu' ? bud : 0;
    return bud;
  }

  /** Couleur avec opacité */
  const alpha = (hex, a) => {
    if (hex.startsWith('rgba')) return hex.replace(/[\d.]+\)$/, `${a})`);
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${a})`;
  };

  const BASE_TOOLTIP = {
    backgroundColor: 'rgba(6,12,20,0.97)',
    borderColor:     'rgba(0,212,170,0.35)',
    borderWidth:     1,
    titleColor:      THEME.snow,
    bodyColor:       THEME.pale,
    padding:         14,
    cornerRadius:    10,
    displayColors:   true,
    boxWidth:        10,
    boxHeight:       10,
  };

  const BASE_ANIMATION = {
    duration: 600,
    easing:   'easeOutQuart'
  };

  const GRID_STYLE = {
    color: 'rgba(255,255,255,0.05)',
    drawBorder: false
  };

  const TICK_STYLE = {
    color: THEME.pale,
    font:  { size: 11 }
  };

  /* ──────────────────────────────────────────────────────
     HELPERS
  ────────────────────────────────────────────────────── */

  /** Injecter le sous-titre dynamique sous un canvas */
  function _renderSubtitle(canvasId, text) {
    if (!text) return;
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const container = canvas.parentElement;
    let sub = container.querySelector('.chart-subtitle');
    if (!sub) {
      sub = document.createElement('p');
      sub.className = 'chart-subtitle';
      sub.style.cssText = `
        font-size:0.72rem;color:${THEME.pale};margin:6px 4px 0;
        line-height:1.45;font-style:italic;min-height:1.1em;
      `;
      canvas.insertAdjacentElement('afterend', sub);
    }
    sub.innerHTML = text;
  }

  /** Formater un montant compact pour les tooltips */
  const fmt = v => ProjectUtils.formatMontant(v, true);

  /** Compter le total d'un dataset pour calculer % */
  const _sum = (arr) => arr.reduce((a, b) => a + (b || 0), 0);

  /* ──────────────────────────────────────────────────────
     REGISTRE DES GRAPHIQUES
  ────────────────────────────────────────────────────── */

  const ChartsEnrichis = {
    charts: {},
    // caMode supprimé — config locale par graphique via ChartConfigManager
    onChartClick: null,

    // [SUPPRIMÉ] setCAMode — remplacé par ChartConfigManager.register() par graphique
    // Conservé en no-op pour rétrocompatibilité si appelé depuis du code existant
    setCAMode(mode) {
      console.warn('[ChartsEnrichis] setCAMode() est déprécié. Utiliser ChartConfigManager.register() par graphique.');
    },

    /**
     * _getMode(chartId) — Lire le mode CA depuis ChartConfigManager.
     * Retourne la valeur locale du graphique, ou 'ca_etudie' par défaut.
     * Remplace this.caMode global — chaque graphique a sa propre config.
     */
    _getMode(chartId) {
      if (typeof ChartConfigManager !== 'undefined' && ChartConfigManager.getConfig) {
        const cfg = ChartConfigManager.getConfig(chartId);
        if (cfg && cfg.valeur) return cfg.valeur;
      }
      return 'ca_etudie'; // défaut sûr
    },


    /* ── Guard anti-double-init ───────────────────────────────────
       _initialized passe à true après le premier createAllCharts().
       Si createAllCharts() est rappelé (ex: update()), on détruit
       proprement les instances existantes avant de recréer.
    ── */
    _initialized: false,

    _createChart(id, config) {
      const ctx = document.getElementById(id);
      if (!ctx) return null;
      // CORRECTION 10 : destroy + unregisterChart avant toute recréation
      if (this.charts[id]) {
        try { this.charts[id].destroy(); } catch (_) {}
        delete this.charts[id];
        // Libérer le listener dans ChartFilterController
        if (typeof ChartFilterController !== 'undefined' && ChartFilterController.unregisterChart) {
          ChartFilterController.unregisterChart(id);
        }
      }
      config.options = config.options || {};
      config.options.animation = { ...BASE_ANIMATION, ...(config.options.animation || {}) };
      this.charts[id] = new Chart(ctx, config);
      return this.charts[id];
    },

    /**
     * _makeClickable — DÉLÉGUÉ à ChartFilterController (v2.0)
     *
     * Toute logique de clic, filtrage et DrillDown est centralisée dans
     * ChartFilterController.registerChart(). Cette méthode enregistre
     * simplement le graphique s'il ne l'est pas déjà, sans poser de
     * onclick direct sur le canvas.
     *
     * Si ChartFilterController n'est pas disponible, fallback minimal.
     */
    _makeClickable(id, filterType, extraFilters) {
      const chart = this.charts[id];
      if (!chart) return;

      if (typeof ChartFilterController !== 'undefined') {
        // Enregistrement centralisé — ChartFilterController pose son propre
        // event listener et gère FilterManager + ChartDrillDown
        ChartFilterController.registerChart(id, chart, {
          filterType,
          clickable:        true,
          highlightOnFilter: true,
          reRenderOnFilter: true,
          dataSource:       null,
          extraFilters:     extraFilters || null
        });
        return;
      }

      // ── Fallback si ChartFilterController absent ──────────────────
      chart.canvas.style.cursor = 'pointer';
      chart.canvas.onclick = (e) => {
        const els = chart.getElementsAtEventForMode(e, 'nearest', { intersect: true }, true);
        if (!els.length) return;
        const label = chart.data.labels[els[0].index];
        if (this.onChartClick) {
          this.onChartClick(filterType, label);
        } else if (typeof FilterManager !== 'undefined') {
          FilterManager.toggleFilter(filterType, label);
        }
      };
    },

    /* ────────────────────────────────────────────────────
       GRAPHIQUES EXISTANTS AMÉLIORÉS
    ──────────────────────────────────────────────────── */

    /** Projets perdus par société */
    createChartPerdu(projects, id = 'chart-perdu') {
      const data = Analytics.lostByClient(projects, {}, 10);
      const total = data.reduce((s, [, n]) => s + n, 0);
      if (!data.length) return;

      this._createChart(id, {
        type: 'bar',
        data: {
          labels: data.map(([c]) => c.substring(0, 22)),
          datasets: [{
            label: 'Projets perdus',
            data:  data.map(([, n]) => n),
            backgroundColor: data.map((_, i) => alpha(THEME.red, Math.max(0.35, 0.8 - i * 0.06))),
            borderColor:     THEME.red,
            borderWidth:     2,
            borderRadius:    8,
            hoverBackgroundColor: alpha(THEME.red, 0.95),
            hoverBorderWidth: 3
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: { display: false },
            tooltip: {
              ...BASE_TOOLTIP,
              borderColor: THEME.red,
              callbacks: {
                title: ctx => ctx[0].label,
                label: ctx => {
                  const pct = total > 0 ? Math.round((ctx.raw / total) * 100) : 0;
                  return ` ${ctx.raw} perdu${ctx.raw > 1 ? 's' : ''} (${pct}% du total)`;
                }
              }
            }
          },
          scales: {
            x: { beginAtZero: true, grid: GRID_STYLE, ticks: TICK_STYLE },
            y: { grid: { display: false }, ticks: { ...TICK_STYLE } }
          }
        }
      });

      // BUG FIX #1/#2 : extraFilters garantit que le DrillDown n'affiche que les projets perdus
      this._makeClickable(id, 'Client', { status: 'perdu' });
      _renderSubtitle(id, Analytics.insights.summaryFor('perdu', projects));
    },

    /** Projets obtenus par société */
    createChartObtenu(projects, id = 'chart-obtenu') {
      const data = Analytics.wonByClient(projects, {}, 10);
      const total = data.reduce((s, [, n]) => s + n, 0);
      if (!data.length) return;

      this._createChart(id, {
        type: 'bar',
        data: {
          labels: data.map(([c]) => c.substring(0, 22)),
          datasets: [{
            label: 'Projets obtenus',
            data:  data.map(([, n]) => n),
            backgroundColor: data.map((_, i) => alpha(THEME.brand, Math.max(0.35, 0.8 - i * 0.06))),
            borderColor:     THEME.brand,
            borderWidth:     2,
            borderRadius:    8,
            hoverBackgroundColor: alpha(THEME.brand, 0.95),
            hoverBorderWidth: 3
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: { display: false },
            tooltip: {
              ...BASE_TOOLTIP,
              borderColor: THEME.brand,
              callbacks: {
                title: ctx => ctx[0].label,
                label: ctx => {
                  const pct = total > 0 ? Math.round((ctx.raw / total) * 100) : 0;
                  return ` ${ctx.raw} obtenu${ctx.raw > 1 ? 's' : ''} (${pct}%)`;
                }
              }
            }
          },
          scales: {
            x: { beginAtZero: true, grid: GRID_STYLE, ticks: TICK_STYLE },
            y: { grid: { display: false }, ticks: { ...TICK_STYLE } }
          }
        }
      });

      // BUG FIX #1/#2 : extraFilters garantit que le DrillDown n'affiche que les projets obtenus
      this._makeClickable(id, 'Client', { status: 'obtenu' });
      _renderSubtitle(id, Analytics.insights.summaryFor('obtenu', projects));
    },

    /** Projets obtenus par zone géographique */
    createChartObtenuZone(projects, id = 'chart-obtenu-zone') {
      const raw = Analytics.wonByZone(projects);
      const entries = Object.entries(raw).sort((a, b) => b[1] - a[1]);
      if (!entries.length) return;

      const total = entries.reduce((s, [, n]) => s + n, 0);

      this._createChart(id, {
        type: 'doughnut',
        data: {
          labels: entries.map(([z]) => z),
          datasets: [{
            data: entries.map(([, n]) => n),
            backgroundColor: entries.map((_, i) => alpha(PALETTE[i % PALETTE.length], 0.8)),
            borderColor:     '#101928',
            borderWidth:     3,
            hoverBorderColor: THEME.snow,
            hoverBorderWidth: 4,
            hoverOffset: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: {
              position: 'right',
              labels: { color: THEME.pale, font: { size: 11 }, padding: 14, usePointStyle: true }
            },
            tooltip: {
              ...BASE_TOOLTIP,
              callbacks: {
                label: ctx => {
                  const pct = total > 0 ? Math.round((ctx.raw / total) * 100) : 0;
                  return ` ${ctx.label}: ${ctx.raw} projet${ctx.raw > 1 ? 's' : ''} (${pct}%)`;
                }
              }
            }
          }
        }
      });

      this._makeClickable(id, 'Zone Géographique');
    },

    /** CA par société Top 8 */
    createCAByCompanyChart(projects, id = 'chart-montant') {
      const raw   = Analytics.caByClient(projects, {}, this._getMode(id), 8);
      const total = _sum(Object.values(raw));
      const entries = Object.entries(raw);
      if (!entries.length) return;

      this._createChart(id, {
        type: 'bar',
        data: {
          labels: entries.map(([c]) => c.substring(0, 20)),
          datasets: [{
            label: 'CA',
            data:  entries.map(([, v]) => v),
            backgroundColor: entries.map((_, i) => alpha(PALETTE[i % PALETTE.length], 0.8)),
            borderColor:     entries.map((_, i) => PALETTE[i % PALETTE.length]),
            borderWidth:     2,
            borderRadius:    8,
            hoverBorderWidth: 3
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: { display: false },
            tooltip: {
              ...BASE_TOOLTIP,
              callbacks: {
                label: ctx => {
                  const pct = total > 0 ? Math.round((ctx.raw / total) * 100) : 0;
                  return ` ${fmt(ctx.raw)} (${pct}% du total)`;
                }
              }
            }
          },
          scales: {
            x: {
              beginAtZero: true, grid: GRID_STYLE, ticks: {
                ...TICK_STYLE,
                callback: v => fmt(v)
              }
            },
            y: { grid: { display: false }, ticks: TICK_STYLE }
          }
        }
      });

      this._makeClickable(id, 'Client');
      _renderSubtitle(id, Analytics.insights.summaryFor('ca-client', projects, this._getMode(id)));
    },

    /** CA total par statut */
    createCAByStatusChart(projects, id = 'chart-montant-statut') {
      const raw  = Analytics.caByStatus(projects, {}, this._getMode(id));
      const data = [
        { label: 'Obtenu', value: raw.obtenu, color: THEME.obtenu },
        { label: 'Perdu',  value: raw.perdu,  color: THEME.perdu  },
        { label: 'Offre',  value: raw.offre,  color: THEME.offre  }
      ].filter(d => d.value > 0);

      if (!data.length) return;
      const total = _sum(data.map(d => d.value));

      this._createChart(id, {
        type: 'bar',
        data: {
          labels: data.map(d => d.label),
          datasets: [{
            data:            data.map(d => d.value),
            backgroundColor: data.map(d => alpha(d.color, 0.8)),
            borderColor:     data.map(d => d.color),
            borderWidth:     2,
            borderRadius:    10,
            hoverBorderWidth: 3
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: { display: false },
            tooltip: {
              ...BASE_TOOLTIP,
              callbacks: {
                label: ctx => {
                  const pct = total > 0 ? Math.round((ctx.raw / total) * 100) : 0;
                  return ` ${fmt(ctx.raw)} (${pct}%)`;
                }
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true, grid: GRID_STYLE,
              ticks: { ...TICK_STYLE, callback: v => fmt(v) }
            },
            x: { grid: { display: false }, ticks: TICK_STYLE }
          }
        }
      });
      this._makeClickable(id, 'Statut');
    },

    /* ────────────────────────────────────────────────────
       NOUVEAUX GRAPHIQUES
    ──────────────────────────────────────────────────── */

    /**
     * Funnel commercial complet.
     * Étapes : Consultations → Offres → Déposées → Obtenus
     */
    createFunnelChart(projects, id = 'chart-funnel') {
      const funnel = Analytics.commercialFunnel(projects, {}, this._getMode(id));
      if (!funnel.stages.length) return;

      const labels = funnel.stages.map(s => s.label);
      const values = funnel.stages.map(s => s.count);
      const cas    = funnel.stages.map(s => s.ca);
      const maxV   = Math.max(...values);

      // Funnel "simulé" avec barres horizontales de largeur décroissante
      this._createChart(id, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Projets',
            data:  values,
            backgroundColor: funnel.stages.map(s => alpha(s.color, 0.82)),
            borderColor:     funnel.stages.map(s => s.color),
            borderWidth:     2,
            borderRadius:    8,
            hoverBorderWidth: 3
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: { display: false },
            tooltip: {
              ...BASE_TOOLTIP,
              callbacks: {
                title: ctx => ctx[0].label,
                label: ctx => {
                  const pct = maxV > 0 ? Math.round((ctx.raw / maxV) * 100) : 0;
                  const caStr = cas[ctx.dataIndex] > 0 ? ` — ${fmt(cas[ctx.dataIndex])}` : '';
                  return ` ${ctx.raw} projets (${pct}% du pipeline)${caStr}`;
                },
                afterBody: (ctx) => {
                  if (ctx[0].dataIndex === funnel.stages.length - 1) {
                    return [`→ Taux de conversion final : ${funnel.conversionRate ?? '?'}%`];
                  }
                  return [];
                }
              }
            }
          },
          scales: {
            x: { beginAtZero: true, max: maxV * 1.15, grid: GRID_STYLE, ticks: TICK_STYLE },
            y: { grid: { display: false }, ticks: TICK_STYLE }
          }
        }
      });

      this._makeClickable(id, 'Statut'); // BUG FIX #1 : funnel = filtre par statut
      _renderSubtitle(id, Analytics.insights.summaryFor('funnel', projects));
    },

    /**
     * CA par année — switch dynamique ca_etudie / ca_gagne.
     *
     * Modes :
     *   ca_etudie  → 2 lignes : Étudié (bleu) + Gagné (vert)
     *                + ligne taux de réalisation % (axe droit, or)
     *   ca_gagne   → 1 ligne Gagné + deltas N-1 dans tooltips
     *
     * Source : Analytics.caByYearAllModes()
     * Aucun calcul ici — rendu seul.
     *
     * @param {Array}  projects
     * @param {string} id       id du canvas cible
     */
 /**
 * CA par année — switch dynamique ca_etudie / ca_gagne.
 * v7.1 — Protection contre datasets vides
 */
createCAByYearChart(projects, id = 'chart-ca-by-year-v2') {
  if (typeof Analytics === 'undefined' ||
      typeof Analytics.caByYearAllModes !== 'function') return;

  const rows = Analytics.caByYearAllModes(projects);
  
  // ✅ CORRECTION : Vérification robuste
  if (!rows || rows.length < 1) {
    console.warn(`[ChartsEnrichis] createCAByYearChart : aucune donnée pour ${id}`);
    // Afficher un message dans le canvas
    const canvas = document.getElementById(id);
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#9fb3c8';
      ctx.font = '14px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('Aucune donnée disponible', canvas.width / 2, canvas.height / 2);
    }
    return;
  }

  const years = rows.map(r => String(r.year)); // String() obligatoire
  const mode = this._getMode(id);

  // ── Palette ────────────────────────────────────────────────────
  const C = {
    etudie:  THEME.blue,
    gagne:   THEME.brand,
    taux:    THEME.gold,
  };

  // ── Point background : intensité = valeur relative ─────────────
  const _ptBg = (values, color) => {
    const max = Math.max(...values.filter(v => v != null), 1);
    return values.map(v =>
      v == null ? 'transparent' : alpha(color, 0.4 + (v / max) * 0.6)
    );
  };

  // ── Base commune d'une série ligne ─────────────────────────────
  const _line = (label, values, color, opts = {}) => ({
    label,
    data:                 values,
    borderColor:          color,
    backgroundColor:      alpha(color, opts.fill ? 0.10 : 0),
    fill:                 !!opts.fill,
    tension:              0.38,
    borderWidth:          opts.thin ? 2 : 2.5,
    borderDash:           opts.dash || [],
    pointRadius:          opts.noPoints ? 0 : 5,
    pointHoverRadius:     opts.noPoints ? 0 : 7,
    pointBackgroundColor: opts.noPoints ? 'transparent' : _ptBg(values, color),
    pointBorderColor:     '#101928',
    pointBorderWidth:     opts.noPoints ? 0 : 2,
    yAxisID:              opts.yRight ? 'y2' : 'y',
    spanGaps:             true,
    order:                opts.order ?? 2,
  });

  // ── Datasets selon mode ────────────────────────────────────────
  let datasets;
  let showY2 = false;

  if (mode === 'Bud') {
    datasets = [
      _line('CA Gagné', rows.map(r => r.gagne), C.gagne, { fill: true, order: 1 }),
    ];

  } else {
    showY2 = true;
    datasets = [
      _line('CA Étudié',         rows.map(r => r.etudie),          C.etudie,  { fill: true, order: 2 }),
      _line('CA Gagné',          rows.map(r => r.gagne),            C.gagne,   { fill: true, order: 3 }),
      _line('Taux réalisation %',rows.map(r => r.tauxRealisation),  C.taux,
            { yRight: true, noPoints: false, thin: true, dash: [4, 3], order: 1 }),
    ];
  }

  // ── Tooltips callbacks ────────────────────────────────────────
  const _tooltipCallbacks = {
    title: ctx => {
      const row = rows[ctx[0].dataIndex];
      return `Année commerciale ${row.year}`;
    },

    label: ctx => {
      const raw = ctx.raw;
      if (raw === null || raw === undefined) return null;
      if (ctx.dataset.label === 'Taux réalisation %') {
        return ` Taux réalisation : ${raw}%`;
      }
      return ` ${ctx.dataset.label} : ${fmt(raw)}`;
    },

    afterBody: ctxArr => {
      const row = rows[ctxArr[0]?.dataIndex];
      if (!row) return [];
      const lines = [];

      let delta, deltaLabel;
      if (mode === 'Bud') {
        delta = row.deltaGagne;
        deltaLabel = 'CA gagné';
      } else {
        delta = row.deltaEtudie;
        deltaLabel = 'CA étudié';
      }

      if (delta !== null) {
        const sign = delta >= 0 ? '+' : '';
        const icon = delta >= 0 ? '▲' : '▼';
        lines.push(`${icon} ${deltaLabel} vs N-1 : ${sign}${delta}%`);
      }

      if (row.countAll > 0) {
        const countLabel = `${row.countAll} projet${row.countAll !== 1 ? 's' : ''} (${row.countObtenu} obtenu${row.countObtenu !== 1 ? 's' : ''})`;
        lines.push(`→ ${countLabel}`);
      }

      return lines;
    }
  };

  // ── Axes secondaires ──────────────────────────────────────────
  const scaleY2 = {
    type:       'linear',
    position:   'right',
    display:    showY2,
    beginAtZero: true,
    max:        120,
    grid:       { display: false },
    ticks: {
      ...TICK_STYLE,
      callback: v => `${v}%`,
      stepSize: 20,
    },
    title: {
      display: showY2,
      text:    'Taux réal. %',
      color:   THEME.pale,
      font:    { size: 10 }
    }
  };

  // ── Créer le graphique ────────────────────────────────────────
  this._createChart(id, {
    type: 'line',
    data: { labels: years, datasets },
    options: {
      responsive:          true,
      maintainAspectRatio: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          labels: {
            color:           THEME.pale,
            font:            { size: 11 },
            usePointStyle:   true,
            pointStyleWidth: 10,
          }
        },
        tooltip: {
          ...BASE_TOOLTIP,
          borderColor: mode === 'Bud' ? C.gagne : C.etudie,
          callbacks: _tooltipCallbacks,
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid:   GRID_STYLE,
          ticks:  { ...TICK_STYLE, callback: v => fmt(v) }
        },
        y2: scaleY2,
        x: {
          grid:  { display: false },
          ticks: TICK_STYLE
        }
      }
    }
  });

  this._makeClickable(id, '_annee');

  _renderSubtitle(id, Analytics.insights.summaryFor('ca-year', projects, mode));
},
    /* ──────────────────────────────────────────────────────
       CA PAR ANNÉE — FIN v7.0
    ────────────────────────────────────────────────────── */

    /* ────────────────────────────────────────────────────
       CA MULTI-DIMENSIONNEL PAR ANNÉE — v8.0
    ──────────────────────────────────────────────────── */

    /**
     * Graphique CA multi-dimensionnel par année commerciale.
     *
     * Mode ca_gagne  → barre CA gagné + ligne taux réal.
     * Mode ca_etudie → barres étudié + gagné + ligne taux réal.
     *
     * Source : Analytics.caByYearAllModes() — aucun calcul ici.
     *
     * @param {Array}  projects
     * @param {string} id  id du canvas cible
     */
/**
 * CA MULTI-DIMENSIONNEL PAR ANNÉE — v8.1 (corrigé)
 * Protection contre datasets vides
 */
createCAMultiDimChart(projects, id = 'chart-ca-multidim') {
  if (typeof Analytics === 'undefined' ||
      typeof Analytics.caByYearAllModes !== 'function') return;

  const rows = Analytics.caByYearAllModes(projects);
  
  // ✅ CORRECTION : Vérification robuste
  if (!rows || !rows.length) {
    console.warn(`[ChartsEnrichis] createCAMultiDimChart : aucune donnée pour ${id}`);
    const canvas = document.getElementById(id);
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#9fb3c8';
      ctx.font = '14px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('Aucune donnée disponible', canvas.width / 2, canvas.height / 2);
    }
    return;
  }

  const years = rows.map(r => String(r.year));
  const mode = this._getMode(id);

  const colorEtudie  = THEME.blue;
  const colorGagne   = THEME.brand;
  const colorLine    = THEME.gold;

  const _barColor = (row) => {
    if (mode === 'Bud') {
      const tx = row.tauxRealisation;
      return tx === null   ? alpha(colorGagne, 0.55)
           : tx >= 60      ? alpha(colorGagne, 0.85)
           : tx >= 35      ? alpha(colorGagne, 0.65)
           :                 alpha(THEME.gold,  0.75);
    }
    return alpha(colorEtudie, 0.75);
  };

  let datasets;

  if (mode === 'Bud') {
    datasets = [
      {
        type: 'bar',
        label: 'CA Gagné',
        data: rows.map(r => r.gagne),
        backgroundColor: rows.map(r => _barColor(r)),
        borderColor: colorGagne,
        borderWidth: 2,
        borderRadius: 9,
        hoverBackgroundColor: alpha(colorGagne, 0.95),
        hoverBorderWidth: 3,
        order: 3,
        yAxisID: 'y',
      },
      {
        type: 'line',
        label: 'Taux réalisation %',
        data: rows.map(r => r.tauxRealisation),
        borderColor: colorLine,
        backgroundColor: 'transparent',
        borderWidth: 2.5,
        borderDash: [4, 3],
        pointBackgroundColor: colorLine,
        pointBorderColor: '#101928',
        pointBorderWidth: 2,
        pointRadius: 5,
        tension: 0.35,
        order: 1,
        yAxisID: 'y2',
        spanGaps: true,
      }
    ];

  } else {
    datasets = [
      {
        type: 'bar',
        label: 'CA Étudié',
        data: rows.map(r => r.etudie),
        backgroundColor: alpha(colorEtudie, 0.65),
        borderColor: colorEtudie,
        borderWidth: 2,
        borderRadius: 9,
        hoverBackgroundColor: alpha(colorEtudie, 0.92),
        hoverBorderWidth: 3,
        order: 3,
        yAxisID: 'y',
      },
      {
        type: 'bar',
        label: 'CA Gagné',
        data: rows.map(r => r.gagne),
        backgroundColor: alpha(colorGagne, 0.65),
        borderColor: colorGagne,
        borderWidth: 2,
        borderRadius: 9,
        hoverBackgroundColor: alpha(colorGagne, 0.92),
        hoverBorderWidth: 3,
        order: 4,
        yAxisID: 'y',
      },
      {
        type: 'line',
        label: 'Taux réalisation %',
        data: rows.map(r => r.tauxRealisation),
        borderColor: colorLine,
        backgroundColor: 'transparent',
        borderWidth: 2.5,
        borderDash: [4, 3],
        pointBackgroundColor: colorLine,
        pointBorderColor: '#101928',
        pointBorderWidth: 2,
        pointRadius: 5,
        tension: 0.35,
        order: 1,
        yAxisID: 'y2',
        spanGaps: true,
      }
    ];
  }

  this._createChart(id, {
    type: 'bar',
    data: { labels: years, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          labels: {
            color: THEME.pale,
            font: { size: 11 },
            usePointStyle: true,
            pointStyleWidth: 10,
          }
        },
        tooltip: {
          ...BASE_TOOLTIP,
          borderColor: colorGagne,
          callbacks: {
            title: ctx => {
              const row = rows[ctx[0].dataIndex];
              return `Année commerciale ${row.year}`;
            },
            label: ctx => {
              if (ctx.raw === null) return null;
              if (ctx.dataset.label === 'Taux réalisation %')
                return ` Taux réalisation : ${ctx.raw}%`;
              return ` ${ctx.dataset.label} : ${fmt(ctx.raw)}`;
            },
            afterBody: ctxArr => {
              const row = rows[ctxArr[0]?.dataIndex];
              if (!row) return [];
              const lines = [];
              if (row.countAll > 0) {
                lines.push(`→ ${row.countAll} projets (${row.countObtenu} obtenu${row.countObtenu !== 1 ? 's' : ''})`);
              }
              if (row.deltaGagne !== null) {
                const sign = row.deltaGagne >= 0 ? '+' : '';
                lines.push(`${row.deltaGagne >= 0 ? '▲' : '▼'} CA gagné vs N-1 : ${sign}${row.deltaGagne}%`);
              }
              return lines;
            }
          }
        }
      },
      scales: {
        y: {
          type: 'linear',
          position: 'left',
          beginAtZero: true,
          grid: GRID_STYLE,
          ticks: { ...TICK_STYLE, callback: v => fmt(v) },
        },
        y2: {
          type: 'linear',
          position: 'right',
          display: true,
          beginAtZero: true,
          max: 120,
          grid: { display: false },
          ticks: { ...TICK_STYLE, callback: v => `${v}%`, stepSize: 20 },
          title: {
            display: true,
            text: 'Taux réal. %',
            color: THEME.pale,
            font: { size: 10 }
          }
        },
        x: { grid: { display: false }, ticks: TICK_STYLE }
      }
    }
  });

  this._makeClickable(id, '_annee');

  _renderSubtitle(id, Analytics.insights.summaryFor('ca-year', projects, mode));
},

    /**
     * Délai moyen par statut (bar horizontal).
     */
    createDelayByStatusChart(projects, id = 'chart-delay-status') {
      const delays = Analytics.avgDelayByStatus(projects);
      const data = [
        { label: '✅ Obtenu', value: delays.obtenu, color: THEME.obtenu },
        { label: '❌ Perdu',  value: delays.perdu,  color: THEME.perdu  },
        { label: '📋 Offre',  value: delays.offre,  color: THEME.offre  }
      ].filter(d => d.value !== null);

      if (!data.length) return;

      this._createChart(id, {
        type: 'bar',
        data: {
          labels: data.map(d => d.label),
          datasets: [{
            label: 'Jours moyens',
            data:  data.map(d => d.value),
            backgroundColor: data.map(d => alpha(d.color, 0.8)),
            borderColor:     data.map(d => d.color),
            borderWidth:     2,
            borderRadius:    10,
            hoverBorderWidth: 3
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: { display: false },
            tooltip: {
              ...BASE_TOOLTIP,
              callbacks: {
                label: ctx => ` ${ctx.raw} jours en moyenne`
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true, grid: GRID_STYLE,
              ticks: { ...TICK_STYLE, callback: v => `${v}j` }
            },
            x: { grid: { display: false }, ticks: TICK_STYLE }
          }
        }
      });

      _renderSubtitle(id, Analytics.insights.summaryFor('delay-status', projects));
      this._makeClickable(id, 'Statut');
    },

    /**
     * Scatter : Puissance MW vs CA.
     * Couleur par statut, rayon proportionnel au CA.
     */
    createScatterPowerCAChart(projects, id = 'chart-scatter-power-ca') {
      const pts = Analytics.scatterPowerVsCA(projects, {}, this._getMode(id));
      if (pts.length < 2) return;

      const spreadBubblePoints = (points) => {
        const groups = {};
        points.forEach((p, idx) => {
          const key = [Math.round((Number(p.x) || 0) * 2) / 2, Math.round((Number(p.y) || 0) / 100000)].join('|');
          (groups[key] = groups[key] || []).push({ point: p, index: idx });
        });

        return points.map((p) => Object.assign({}, p)).map((copy) => copy).map((copy, idx) => {
          const key = [Math.round((Number(copy.x) || 0) * 2) / 2, Math.round((Number(copy.y) || 0) / 100000)].join('|');
          const bucket = groups[key] || [];
          if (bucket.length <= 1) return copy;

          const localIndex = bucket.findIndex((item) => item.index === idx);
          const angle = (Math.PI * 2 * localIndex) / bucket.length;
          const baseX = Math.max(0.18, (Number(copy.x) || 0) * 0.018);
          const baseY = Math.max(45000, (Number(copy.y) || 0) * 0.02);

          copy.xDisplay = copy.x + Math.cos(angle) * baseX;
          copy.yDisplay = Math.max(0, copy.y + Math.sin(angle) * baseY);
          copy.clusterSize = bucket.length;
          copy.clusterIndex = localIndex;
          return copy;
        });
      };

      const displayPts = spreadBubblePoints(pts);

      const powerValues = pts
        .map(p => Number(p.x) || 0)
        .filter(v => v > 0)
        .sort((a, b) => a - b);

      const percentile = (arr, ratio) => {
        if (!arr.length) return 0;
        const idx = Math.min(arr.length - 1, Math.max(0, Math.floor((arr.length - 1) * ratio)));
        return arr[idx];
      };

      const p50 = percentile(powerValues, 0.5);
      const p90 = percentile(powerValues, 0.9);
      const maxPower = powerValues.length ? powerValues[powerValues.length - 1] : 0;
      const useLogScale = p50 > 0 && maxPower > Math.max(250, p90 * 6, p50 * 15);

      const colorByStatus = {
        obtenu: THEME.brand,
        perdu:  THEME.red,
        offre:  THEME.blue,
        autre:  THEME.gold
      };

      this._createChart(id, {
        type: 'bubble',
        data: {
          datasets: [{
            label: 'Projets',
            data:  displayPts.map(p => ({
              x: p.xDisplay != null ? p.xDisplay : p.x,
              y: p.yDisplay != null ? p.yDisplay : p.y,
              r: p.r,
              label: p.label,
              filterValue: p.label,
              client: p.label,
              projet: p.projet || '',
              status: p.status,
              rawX: p.x,
              rawY: p.y,
              clusterSize: p.clusterSize || 1,
              clusterIndex: p.clusterIndex || 0
            })),
            backgroundColor: pts.map(p => alpha(colorByStatus[p.status] || THEME.pale, 0.65)),
            borderColor:     pts.map(p => colorByStatus[p.status] || THEME.pale),
            borderWidth:     1.5,
            hoverBorderWidth: 3,
            hoverBorderColor: THEME.snow
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: { display: false },
            tooltip: {
              ...BASE_TOOLTIP,
              mode: 'nearest',
              intersect: true,
              callbacks: {
                title: (ctx) => {
                  const p = ctx && ctx[0] && ctx[0].raw ? ctx[0].raw : null;
                  if (!p) return '';
                  return p.projet || p.label || '';
                },
                label: (ctx) => {
                  const p = ctx.raw || {};
                  return [
                    ` Client: ${p.label || 'N/A'}`,
                    ` Puissance: ${p.rawX != null ? p.rawX : p.x} MW`,
                    ` CA: ${fmt(p.rawY != null ? p.rawY : p.y)}`,
                    ` Statut: ${p.status}`
                  ];
                },
                footer: (ctx) => {
                  const p = ctx && ctx[0] && ctx[0].raw ? ctx[0].raw : null;
                  if (!p || !p.clusterSize || p.clusterSize <= 1) return '';
                  return 'Bulles proches detectees: ' + p.clusterSize + ' (dispersion visuelle active)';
                }
              }
            }
          },
          interaction: {
            mode: 'nearest',
            intersect: true,
            axis: 'xy'
          },
          scales: {
            x: {
              type: useLogScale ? 'logarithmic' : 'linear',
              title: {
                display: true,
                text: useLogScale ? 'Puissance (MW, échelle log)' : 'Puissance (MW)',
                color: THEME.pale,
                font: { size: 11 }
              },
              grid: GRID_STYLE,
              min: useLogScale ? Math.max(0.1, Math.min.apply(null, powerValues)) : 0,
              ticks: Object.assign({}, TICK_STYLE, {
                callback: function(value) {
                  if (!useLogScale) return value;
                  if (value >= 1000) return value.toLocaleString('fr-FR');
                  if (value >= 1) return String(value);
                  return Number(value).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
                }
              })
            },
            y: {
              title: { display: true, text: 'CA (€)', color: THEME.pale, font: { size: 11 } },
              grid: GRID_STYLE,
              ticks: { ...TICK_STYLE, callback: v => fmt(v) }
            }
          }
        }
      });

      var scatterSummary = Analytics.insights.summaryFor('scatter-power-ca', projects, this._getMode(id));
      if (useLogScale) {
        scatterSummary += (scatterSummary ? ' ' : '') + 'Échelle X adaptative pour conserver les outliers lisibles.';
      }
      _renderSubtitle(id, scatterSummary);
    },

    /**
     * Taux de conversion par client (top 12, barres horizontales).
     * Couleur conditionnelle : vert si > moyenne, orange sinon.
     */
    createWinRateByClientChart(projects, id = 'chart-win-rate-client') {
      const raw     = Analytics.winRateByClient(projects, {}, 3);
      const entries = Object.entries(raw)
        .sort((a, b) => b[1].winRate - a[1].winRate)
        .slice(0, 12);

      if (!entries.length) return;

      const avgRate = entries.reduce((s, [, v]) => s + v.winRate, 0) / entries.length;

      this._createChart(id, {
        type: 'bar',
        data: {
          labels: entries.map(([c]) => c.substring(0, 20)),
          datasets: [{
            label: 'Taux de conversion (%)',
            data:  entries.map(([, v]) => v.winRate),
            backgroundColor: entries.map(([, v]) =>
              alpha(v.winRate >= avgRate ? THEME.brand : THEME.gold, 0.8)
            ),
            borderColor: entries.map(([, v]) =>
              v.winRate >= avgRate ? THEME.brand : THEME.gold
            ),
            borderWidth:     2,
            borderRadius:    8,
            hoverBorderWidth: 3
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: { display: false },
            tooltip: {
              ...BASE_TOOLTIP,
              callbacks: {
                label: (ctx) => {
                  const stats = entries[ctx.dataIndex][1];
                  return [
                    ` Taux: ${ctx.raw}%`,
                    ` Obtenus: ${stats.won} / Perdus: ${stats.lost}`,
                    ` Décidés: ${stats.totalDecided}`
                  ];
                }
              }
            },
            annotation: {
              annotations: {
                avgLine: {
                  type: 'line',
                  xMin: avgRate,
                  xMax: avgRate,
                  borderColor: alpha(THEME.snow, 0.3),
                  borderWidth: 1.5,
                  borderDash: [4, 4],
                  label: {
                    display: true,
                    content: `Moy. ${Math.round(avgRate)}%`,
                    color: THEME.pale,
                    font: { size: 10 },
                    position: 'end'
                  }
                }
              }
            }
          },
          scales: {
            x: {
              beginAtZero: true, max: 105, grid: GRID_STYLE,
              ticks: { ...TICK_STYLE, callback: v => `${v}%` }
            },
            y: { grid: { display: false }, ticks: TICK_STYLE }
          }
        }
      });

      _renderSubtitle(id, Analytics.insights.summaryFor('win-rate', projects));
      this._makeClickable(id, 'Client');
    },

    /**
     * CA par zone géographique pondéré (doughnut + CA en tooltip).
     */
    createCAByZoneChart(projects, id = 'chart-ca-zone') {
      const raw   = Analytics.caByZone(projects, {}, this._getMode(id));
      const total = _sum(Object.values(raw));
      const entries = Object.entries(raw)
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1]);

      if (!entries.length) return;

      this._createChart(id, {
        type: 'doughnut',
        data: {
          labels: entries.map(([z]) => z),
          datasets: [{
            data: entries.map(([, v]) => v),
            backgroundColor: entries.map((_, i) => alpha(PALETTE[i % PALETTE.length], 0.8)),
            borderColor:     '#101928',
            borderWidth:     3,
            hoverBorderColor: THEME.snow,
            hoverBorderWidth: 4,
            hoverOffset: 8
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: {
              position: 'right',
              labels: { color: THEME.pale, font: { size: 11 }, padding: 14, usePointStyle: true }
            },
            tooltip: {
              ...BASE_TOOLTIP,
              callbacks: {
                label: ctx => {
                  const pct = total > 0 ? Math.round((ctx.raw / total) * 100) : 0;
                  return ` ${ctx.label}: ${fmt(ctx.raw)} (${pct}%)`;
                }
              }
            }
          }
        }
      });

      this._makeClickable(id, 'Zone Géographique');
      _renderSubtitle(id, Analytics.insights.summaryFor('ca-zone', projects, this._getMode(id)));
    },

    /* ────────────────────────────────────────────────────
       GRAPHIQUES ADDITIONNELS (existants, refactorisés)
    ──────────────────────────────────────────────────── */

    createOfferTypeChart(projects, id = 'chart-offer-type') {
      const raw     = Analytics.countByOfferType(projects);
      const entries = Object.entries(raw).sort((a, b) => b[1] - a[1]);
      const total   = _sum(entries.map(([, n]) => n));
      if (!entries.length) return;

      this._createChart(id, {
        type: 'pie',
        data: {
          labels: entries.map(([t]) => t),
          datasets: [{
            data:            entries.map(([, n]) => n),
            backgroundColor: entries.map((_, i) => alpha(PALETTE[i % PALETTE.length], 0.82)),
            borderColor:     '#101928',
            borderWidth:     3,
            hoverBorderColor: THEME.snow,
            hoverOffset: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: {
              position: 'right',
              labels: { color: THEME.pale, font: { size: 11 }, padding: 12, usePointStyle: true }
            },
            tooltip: {
              ...BASE_TOOLTIP,
              callbacks: {
                label: ctx => {
                  const pct = total > 0 ? Math.round((ctx.raw / total) * 100) : 0;
                  return ` ${ctx.label}: ${ctx.raw} (${pct}%)`;
                }
              }
            }
          }
        }
      });

      this._makeClickable(id, 'Type de projet (Activité)');
    },

    createPartnerChart(projects, id = 'chart-partner') {
      const raw     = Analytics.countByPartner(projects);
      const entries = Object.entries(raw)
        .filter(([, n]) => n > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
      const total = _sum(entries.map(([, n]) => n));
      if (!entries.length) return;

      this._createChart(id, {
        type: 'bar',
        data: {
          labels: entries.map(([p]) => p.substring(0, 20)),
          datasets: [{
            label: 'Projets',
            data:  entries.map(([, n]) => n),
            backgroundColor: entries.map((_, i) => alpha(PALETTE[i % PALETTE.length], 0.8)),
            borderColor:     entries.map((_, i) => PALETTE[i % PALETTE.length]),
            borderWidth:     2,
            borderRadius:    8,
            hoverBorderWidth: 3
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: { display: false },
            tooltip: {
              ...BASE_TOOLTIP,
              callbacks: {
                label: ctx => {
                  const pct = total > 0 ? Math.round((ctx.raw / total) * 100) : 0;
                  return ` ${ctx.raw} projet${ctx.raw > 1 ? 's' : ''} (${pct}%)`;
                }
              }
            }
          },
          scales: {
            x: { beginAtZero: true, grid: GRID_STYLE, ticks: TICK_STYLE },
            y: { grid: { display: false }, ticks: TICK_STYLE }
          }
        }
      });
      this._makeClickable(id, 'Client');
    },

    createMachinesByZoneChart(projects, id = 'chart-machines-zone') {
      const data = _applyGroupBy(projects, 'Zone Géographique', '_nombre_machines');
      const entries = Object.entries(data).sort((a, b) => b[1] - a[1]).slice(0, 8);
      if (!entries.length) return;

      this._createChart(id, {
        type: 'bar',
        data: {
          labels: entries.map(([z]) => z),
          datasets: [{
            label: 'Machines',
            data:  entries.map(([, n]) => n),
            backgroundColor: entries.map((_, i) => alpha(PALETTE[i % PALETTE.length], 0.8)),
            borderColor:     entries.map((_, i) => PALETTE[i % PALETTE.length]),
            borderWidth:     2,
            borderRadius:    8,
            hoverBorderWidth: 3
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: { display: false },
            tooltip: { ...BASE_TOOLTIP }
          },
          scales: {
            y: { beginAtZero: true, grid: GRID_STYLE, ticks: TICK_STYLE },
            x: { grid: { display: false }, ticks: TICK_STYLE }
          }
        }
      });
      this._makeClickable(id, 'Zone Géographique');
    },

    /** Puissance moyenne par statut */
    createPowerByStatusChart(projects, id = 'chart-power-status') {
      const statuses = ['obtenu', 'perdu', 'offre'];
      const labels   = ['✅ Obtenu', '❌ Perdu', '📋 Offre'];
      const colors   = [THEME.obtenu, THEME.perdu, THEME.offre];

      const avgs = statuses.map(s => {
        const sub = projects.filter(p => ProjectUtils.getStatus(p) === s && parseFloat(p['Puissance (MWc)']) > 0);
        if (!sub.length) return 0;
        return parseFloat((sub.reduce((acc, p) => acc + parseFloat(p['Puissance (MWc)']), 0) / sub.length).toFixed(2));
      });

      if (avgs.every(v => v === 0)) return;

      this._createChart(id, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'MW moyen',
            data:  avgs,
            backgroundColor: colors.map(c => alpha(c, 0.8)),
            borderColor:     colors,
            borderWidth:     2,
            borderRadius:    10,
            hoverBorderWidth: 3
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: { display: false },
            tooltip: {
              ...BASE_TOOLTIP,
              callbacks: {
                label: ctx => ` ${ctx.raw} MW en moyenne`
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true, grid: GRID_STYLE,
              ticks: { ...TICK_STYLE, callback: v => `${v} MW` }
            },
            x: { grid: { display: false }, ticks: TICK_STYLE }
          }
        }
      });
      this._makeClickable(id, 'Statut');
    },

    /** Taux de conversion par zone */
    createWinRateZoneChart(projects, id = 'chart-win-rate-zone') {
      const raw     = Analytics.winRateByZone(projects);
      const entries = Object.entries(raw)
        .filter(([, v]) => v.totalDecided >= 2)
        .sort((a, b) => b[1].winRate - a[1].winRate)
        .slice(0, 10);
      if (!entries.length) return;

      this._createChart(id, {
        type: 'bar',
        data: {
          labels: entries.map(([z]) => z),
          datasets: [{
            label: 'Taux de conversion (%)',
            data:  entries.map(([, v]) => v.winRate),
            backgroundColor: entries.map(([, v]) =>
              alpha(v.winRate >= 50 ? THEME.brand : THEME.gold, 0.8)
            ),
            borderColor: entries.map(([, v]) =>
              v.winRate >= 50 ? THEME.brand : THEME.gold
            ),
            borderWidth:     2,
            borderRadius:    8,
            hoverBorderWidth: 3
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: { display: false },
            tooltip: {
              ...BASE_TOOLTIP,
              callbacks: {
                label: ctx => {
                  const stats = entries[ctx.dataIndex][1];
                  return [
                    ` Taux: ${ctx.raw}%`,
                    ` Won: ${stats.won} / Lost: ${stats.lost}`
                  ];
                }
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true, max: 110, grid: GRID_STYLE,
              ticks: { ...TICK_STYLE, callback: v => `${v}%` }
            },
            x: { grid: { display: false }, ticks: TICK_STYLE }
          }
        }
      });

      this._makeClickable(id, 'Zone Géographique');
    },

    /* ────────────────────────────────────────────────────
       NOUVEAUX GRAPHIQUES v3.0
    ──────────────────────────────────────────────────── */

    /**
     * A. Évolution du CA mensuel — Line chart dynamique.
     * Deux lignes : CA Étudié et CA Gagné. Tooltip enrichi avec variations.
     */
    createCAByMonthChart(projects, id = 'chart-ca-by-month') {
      const data = Analytics.caByMonth(projects);
      if (data.length < 2) return;

      const labels  = data.map(d => d.label);
      const etudie  = data.map(d => d.etudie);
      const gagne   = data.map(d => d.gagne);

      this._createChart(id, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'CA Étudié',
              data: etudie,
              borderColor: THEME.blue,
              backgroundColor: alpha(THEME.blue, 0.08),
              pointBackgroundColor: THEME.blue,
              pointRadius: 4,
              pointHoverRadius: 7,
              borderWidth: 2.5,
              tension: 0.4,
              fill: true
            },
            {
              label: 'CA Gagné',
              data: gagne,
              borderColor: THEME.brand,
              backgroundColor: alpha(THEME.brand, 0.08),
              pointBackgroundColor: THEME.brand,
              pointRadius: 4,
              pointHoverRadius: 7,
              borderWidth: 2.5,
              tension: 0.4,
              fill: true
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: {
              display: true,
              labels: { color: THEME.pale, font: { size: 11 }, usePointStyle: true }
            },
            tooltip: {
              ...BASE_TOOLTIP,
              callbacks: {
                title: ctx => ctx[0].label,
                label: ctx => {
                  const idx  = ctx.dataIndex;
                  const d    = data[idx];
                  const isEt = ctx.datasetIndex === 0;
                  const val  = isEt ? d.etudie : d.gagne;
                  const varV = isEt ? d.varEtudie : d.varGagne;
                  const varStr = varV !== null
                    ? ` (${varV >= 0 ? '▲' : '▼'}${Math.abs(varV)}% vs mois préc.)`
                    : '';
                  return ` ${ctx.dataset.label}: ${fmt(val)}${varStr}`;
                }
              }
            }
          },
          scales: {
            x: { grid: { display: false }, ticks: TICK_STYLE },
            y: {
              beginAtZero: true, grid: GRID_STYLE,
              ticks: { ...TICK_STYLE, callback: v => fmt(v) }
            }
          }
        }
      });

      this._makeClickable(id, '_annee'); // BUG FIX #1 : CA par mois → filtre par année
      _renderSubtitle(id, Analytics.insights.summaryCAMonth(projects));
    },

    /**
     * B. Pipeline commercial par étape (Stacked Bar).
     * Froid / Tiède / Chaud / Obtenu / Perdu
     */
    createPipelineByStageChart(projects, id = 'chart-pipeline-stage') {
      const st = Analytics.pipelineByStage(projects);
      const total = st.chaud + st.tiede + st.froid + st.obtenu + st.perdu;
      if (!total) return;

      const labels  = ['🥶 Froid (<30%)', '🟡 Tiède (30-70%)', '🔥 Chaud (>70%)', '✅ Obtenu', '❌ Perdu'];
      const counts  = [st.froid, st.tiede, st.chaud, st.obtenu, st.perdu];
      const caVals  = [st.caFroid, st.caTiede, st.caChaud, st.caObtenu, st.caPerdu];
      const colors  = [THEME.blue, THEME.gold, alpha('#ff6b35', 1), THEME.brand, THEME.red];

      this._createChart(id, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Projets',
            data:  counts,
            backgroundColor: colors.map(c => alpha(c, 0.82)),
            borderColor:     colors,
            borderWidth: 2,
            borderRadius: 8,
            hoverBorderWidth: 3
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: { display: false },
            tooltip: {
              ...BASE_TOOLTIP,
              callbacks: {
                label: ctx => {
                  const n  = ctx.raw;
                  const ca = caVals[ctx.dataIndex];
                  const pct = total > 0 ? Math.round((n / total) * 100) : 0;
                  return [
                    ` ${n} projet${n > 1 ? 's' : ''} (${pct}%)`,
                    ` CA : ${fmt(ca)}`
                  ];
                }
              }
            }
          },
          scales: {
            y: { beginAtZero: true, grid: GRID_STYLE, ticks: TICK_STYLE },
            x: { grid: { display: false }, ticks: { ...TICK_STYLE, maxRotation: 0 } }
          }
        }
      });

      this._makeClickable(id, 'Statut'); // BUG FIX #1 : pipeline par étape → filtre statut
      _renderSubtitle(id, Analytics.insights.summaryPipelineStage(projects));
    },

    /**
     * D. Distribution des montants — Histogram empilé par statut.
     */
    createCAHistogramChart(projects, id = 'chart-ca-histogram') {
      const hist = Analytics.caHistogram(projects);
      if (hist.every(h => h.total === 0)) return;

      const labels   = hist.map(h => h.label);
      const statusKeys = ['obtenu', 'perdu', 'offre'];
      const statusLabels = ['✅ Obtenu', '❌ Perdu', '📋 Offre'];
      const statusColors = [THEME.brand, THEME.red, THEME.blue];

      this._createChart(id, {
        type: 'bar',
        data: {
          labels,
          datasets: statusKeys.map((key, i) => ({
            label: statusLabels[i],
            data:  hist.map(h => h[key]),
            backgroundColor: alpha(statusColors[i], 0.82),
            borderColor:     statusColors[i],
            borderWidth: 1.5,
            borderRadius: i === statusKeys.length - 1 ? 6 : 0,
            stack: 'stack'
          }))
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: {
              display: true,
              labels: { color: THEME.pale, font: { size: 11 }, usePointStyle: true }
            },
            tooltip: {
              ...BASE_TOOLTIP,
              mode: 'index',
              callbacks: {
                title: ctx => ctx[0].label,
                label: ctx => {
                  const n = ctx.raw;
                  if (!n) return null;
                  return ` ${ctx.dataset.label}: ${n} projet${n > 1 ? 's' : ''}`;
                },
                afterBody: ctx => {
                  const idx = ctx[0].dataIndex;
                  const total = hist[idx].total;
                  const won   = hist[idx].obtenu;
                  const pct   = total > 0 ? Math.round((won / total) * 100) : 0;
                  return total > 0 ? [`→ ${pct}% convertis sur ${total} décidés`] : [];
                }
              }
            }
          },
          scales: {
            x: { stacked: true, grid: { display: false }, ticks: TICK_STYLE },
            y: { stacked: true, beginAtZero: true, grid: GRID_STYLE, ticks: TICK_STYLE }
          }
        }
      });

      this._makeClickable(id, 'Statut'); // BUG FIX #1 : histogramme CA → filtre par statut
      _renderSubtitle(id, Analytics.insights.summaryHistogram(projects));
    },

    /**
     * C. Heatmap temporelle Mois × Statut — rendu canvas custom.
     * Utilise un Chart.js bar stacked horizontal pour simuler la heatmap.
     */
    createTemporalHeatmapChart(projects, id = 'chart-temporal-heatmap') {
      const rows  = Analytics.temporalHeatmap(projects);
      if (rows.length < 2) return;

      const labels  = rows.map(r => r.label);
      const maxVal  = Math.max(...rows.map(r => r.total), 1);

      // Intensité de couleur basée sur total
      const intensityColor = (val, base) => {
        const t = Math.min(val / maxVal, 1);
        return alpha(base, 0.12 + t * 0.75);
      };

      this._createChart(id, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: '✅ Obtenu',
              data:   rows.map(r => r.obtenu),
              backgroundColor: rows.map(r => intensityColor(r.obtenu, THEME.brand)),
              borderColor:     alpha(THEME.brand, 0.3),
              borderWidth: 0.5,
              borderRadius: 4,
              stack: 'hm'
            },
            {
              label: '📋 Offre',
              data:   rows.map(r => r.offre),
              backgroundColor: rows.map(r => intensityColor(r.offre, THEME.blue)),
              borderColor:     alpha(THEME.blue, 0.3),
              borderWidth: 0.5,
              borderRadius: 4,
              stack: 'hm'
            },
            {
              label: '❌ Perdu',
              data:   rows.map(r => r.perdu),
              backgroundColor: rows.map(r => intensityColor(r.perdu, THEME.red)),
              borderColor:     alpha(THEME.red, 0.3),
              borderWidth: 0.5,
              borderRadius: 4,
              stack: 'hm'
            }
          ]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: true,
              labels: { color: THEME.pale, font: { size: 11 }, usePointStyle: true }
            },
            tooltip: {
              ...BASE_TOOLTIP,
              mode: 'index',
              callbacks: {
                title: ctx => ctx[0].label,
                label: ctx => {
                  const n = ctx.raw;
                  if (!n) return null;
                  return ` ${ctx.dataset.label}: ${n}`;
                },
                afterBody: ctx => {
                  const idx   = ctx[0].dataIndex;
                  const total = rows[idx].total;
                  return total > 0 ? [`Total: ${total} projets ce mois`] : [];
                }
              }
            }
          },
          scales: {
            x: { stacked: true, beginAtZero: true, grid: GRID_STYLE, ticks: TICK_STYLE },
            y: { stacked: true, grid: { display: false }, ticks: { ...TICK_STYLE, font: { size: 10 } } }
          }
        }
      });

      this._makeClickable(id, '_annee'); // BUG FIX #1 : heatmap temporelle → filtre par année
    },

    /* ────────────────────────────────────────────────────
       v3.0 — GRAPHIQUES INTELLIGENCE DÉCISIONNELLE
    ──────────────────────────────────────────────────── */

    /**
     * Taux de conversion mensuel — Line chart.
     * Permet de détecter la saisonnalité du win rate.
     */
    createWinRateByMonthChart(projects, id = 'chart-winrate-month') {
      if (typeof Analytics.winRateByMonth !== 'function') return;
      const data = Analytics.winRateByMonth(projects).filter(d => d.decided >= 1);
      if (data.length < 2) return;

      this._createChart(id, {
        type: 'line',
        data: {
          labels: data.map(d => d.label),
          datasets: [{
            label: 'Taux conversion (%)',
            data:  data.map(d => d.winRate),
            borderColor:          THEME.gold,
            backgroundColor:      alpha(THEME.gold, 0.06),
            pointBackgroundColor: data.map(d =>
              d.winRate === null ? 'transparent'
                : d.winRate >= 50 ? THEME.brand : THEME.red
            ),
            pointRadius: 5,
            pointHoverRadius: 8,
            borderWidth: 2.5,
            tension: 0.4,
            fill: true,
            spanGaps: true
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: { display: false },
            tooltip: {
              ...BASE_TOOLTIP,
              callbacks: {
                label: ctx => {
                  const d = data[ctx.dataIndex];
                  return [
                    ` Win rate : ${ctx.raw !== null ? ctx.raw + '%' : 'N/A'}`,
                    ` Obtenus : ${d.won} / Décidés : ${d.decided}`
                  ];
                }
              }
            }
          },
          scales: {
            x: { grid: { display: false }, ticks: { ...TICK_STYLE, maxTicksLimit: 8 } },
            y: {
              beginAtZero: true, max: 110, grid: GRID_STYLE,
              ticks: { ...TICK_STYLE, callback: v => `${v}%` }
            }
          }
        }
      });

      this._makeClickable(id, '_annee'); // BUG FIX #1 : win rate mensuel → filtre par année
    },

    /**
     * Pipeline pondéré — Bar horizontal top projets par CA pondéré.
     * Montre quels projets ont le plus fort potentiel réel.
     */
    createPipelineWeightedChart(projects, id = 'chart-pipeline-weighted') {
      if (typeof Analytics.pipelineWeighted !== 'function') return;
      const pw = Analytics.pipelineWeighted(projects);
      const top = pw.projects.filter(p => p.weighted > 0).slice(0, 10);
      if (!top.length) return;

      const colors = top.map(p =>
        p.proba >= 70 ? THEME.brand :
        p.proba >= 30 ? THEME.gold  : THEME.red
      );

      this._createChart(id, {
        type: 'bar',
        data: {
          labels: top.map(p => p.label),
          datasets: [{
            label: 'CA pondéré',
            data:   top.map(p => p.weighted),
            backgroundColor: colors.map(c => alpha(c, 0.82)),
            borderColor:     colors,
            borderWidth: 2,
            borderRadius: 6,
            hoverBorderWidth: 3
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: { display: false },
            tooltip: {
              ...BASE_TOOLTIP,
              callbacks: {
                title: ctx => top[ctx[0].dataIndex].projet || top[ctx[0].dataIndex].label,
                label: ctx => {
                  const p = top[ctx.dataIndex];
                  return [
                    ` CA pondéré : ${fmt(p.weighted)}`,
                    ` CA brut : ${fmt(p.ca)} × ${p.proba}%`,
                    p.hasIndividualProba ? ' ✓ Proba individuelle' : ' ~ Proba estimée (taux global)'
                  ];
                }
              }
            }
          },
          scales: {
            x: {
              beginAtZero: true, grid: GRID_STYLE,
              ticks: { ...TICK_STYLE, callback: v => fmt(v) }
            },
            y: { grid: { display: false }, ticks: { ...TICK_STYLE, font: { size: 10 } } }
          }
        }
      });

      this._makeClickable(id, 'Client'); // BUG FIX #1 : pipeline pondéré → filtre par client
      _renderSubtitle(id, `Pipeline pondéré total : <strong>${fmt(pw.weighted)}</strong> · Méthode individuelle vs globale : ${pw.deltaPct !== null ? (pw.deltaPct >= 0 ? '+' : '') + pw.deltaPct + '%' : 'N/A'}`);
    },

    /* ────────────────────────────────────────────────────
       INIT ALL
    ──────────────────────────────────────────────────── */

    /**
     * Initialiser tous les graphiques.
     * @param {Array}  projects
     * @param {Object} options  { onChartClick }
     *   Note: caMode supprimé — config locale par graphique via ChartConfigManager
     */
    initAll(projects, options = {}) {
      if (options.onChartClick) this.onChartClick = options.onChartClick;
      // options.caMode ignoré — config locale par graphique via ChartConfigManager

      // ── S'assurer que ChartFilterController est initialisé ──────────
      // (idempotent : ne fait rien si déjà prêt)
      if (typeof ChartFilterController !== 'undefined') {
        ChartFilterController.init();
      }

      // Graphiques existants (améliorés)
      this.createChartPerdu(projects);
      this.createChartObtenu(projects);
      this.createChartObtenuZone(projects);
      this.createCAByCompanyChart(projects);
      this.createCAByStatusChart(projects);
      this.createOfferTypeChart(projects);
      this.createPartnerChart(projects);
      this.createMachinesByZoneChart(projects);
      this.createPowerByStatusChart(projects);

      // Nouveaux graphiques
      this.createFunnelChart(projects);
      this.createCAByYearChart(projects);
      this.createDelayByStatusChart(projects);
      this.createScatterPowerCAChart(projects);
      this.createWinRateByClientChart(projects);
      this.createCAByZoneChart(projects);
      this.createWinRateZoneChart(projects);

      // Nouveaux graphiques v3.0
      this.createCAByMonthChart(projects);
      this.createPipelineByStageChart(projects);
      this.createCAHistogramChart(projects);
      this.createTemporalHeatmapChart(projects);

      // v3.0 — Intelligence
      this.createWinRateByMonthChart(projects);
      this.createPipelineWeightedChart(projects);

      // v8.0 — CA Multi-dimensionnel
      this.createCAMultiDimChart(projects);
      // Note : createYearComparisonChart est appelé manuellement par le module v4
    },

    /**
     * ── v4.0 — GRAPHIQUE COMPARAISON ANNÉES ──────────────
     * Bar groupé : Année A (bleu) vs Année B (violet).
     * Tooltip enrichi avec delta % · couleur dynamique par barre.
     *
     * @param {Object} cmp   résultat de Analytics.compareYears()
     * @param {string} id    id canvas cible
     */
    createYearComparisonChart(cmp, id = 'chart-year-comparison') {
      if (!cmp) return;
      const positiveOnly = (typeof Analytics !== 'undefined' && Analytics.compareConfig)
        ? Analytics.compareConfig.positiveOnly : false;

      const allLabels  = cmp.chartData.labels;
      const allValuesA = cmp.chartData.valuesA;
      const allValuesB = cmp.chartData.valuesB;
      const allDeltas  = cmp.chartData.deltas;
      const isCurrency = cmp.chartData.isCurrency;
      const isPercent  = cmp.chartData.isPercent;

      // Filtrer si mode positif uniquement
      const indices = positiveOnly
        ? allDeltas.map((d, i) => i).filter(i => allDeltas[i] >= 0)
        : allDeltas.map((_, i) => i);

      const labels   = indices.map(i => allLabels[i]);
      const valuesA  = indices.map(i => allValuesA[i]);
      const valuesB  = indices.map(i => allValuesB[i]);
      const deltas   = indices.map(i => allDeltas[i]);
      const currency = indices.map(i => isCurrency[i]);
      const pct      = indices.map(i => isPercent[i]);

      const colorA = '#0099ff';
      const colorB = '#8b78f8';

      // Couleur de la barre A : verte si delta > 0, rouge sinon
      const barsColorA = deltas.map(d =>
        d > 0 ? alpha('#00d4aa', 0.85) : d < 0 ? alpha('#ff4d6d', 0.75) : alpha(colorA, 0.7)
      );
      const barsColorB = deltas.map((_, i) => alpha(colorB, 0.55));

      const fmtVal = (v, isCurr, isPct) =>
        isPct ? v + '%' :
        isCurr ? (typeof ProjectUtils !== 'undefined' ? ProjectUtils.formatMontant(v, true) : (v/1e6).toFixed(2) + 'M€') :
        v.toString();

      this._createChart(id, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: String(cmp.yearA),
              data: valuesA,
              backgroundColor: barsColorA,
              borderColor:     barsColorA.map(c => c.replace(/[\d.]+\)$/, '1)')),
              borderWidth: 2,
              borderRadius: 7,
              hoverBorderWidth: 3,
              order: 1
            },
            {
              label: String(cmp.yearB),
              data: valuesB,
              backgroundColor: barsColorB,
              borderColor:     barsColorB.map(() => colorB),
              borderWidth: 2,
              borderRadius: 7,
              hoverBorderWidth: 3,
              order: 2
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          animation: { duration: 600, easing: 'easeOutQuart' },
          plugins: {
            legend: {
              display: true,
              labels: { color: '#c8d4e3', font: { size: 11 }, padding: 16 }
            },
            tooltip: {
              ...BASE_TOOLTIP,
              callbacks: {
                title: ctx => ctx[0].label,
                label: ctx => {
                  const i = ctx.dataIndex;
                  const isA = ctx.datasetIndex === 0;
                  const yr  = isA ? cmp.yearA : cmp.yearB;
                  const v   = ctx.raw;
                  return ` ${yr} : ${fmtVal(v, currency[i], pct[i])}`;
                },
                afterBody: ctx => {
                  const i   = ctx[0].dataIndex;
                  const d   = deltas[i];
                  const dA  = valuesA[i];
                  const dB  = valuesB[i];
                  const pctVal = dB !== 0 ? Math.round(((dA - dB) / Math.abs(dB)) * 100) : null;
                  const arrow  = d > 0 ? '▲' : d < 0 ? '▼' : '→';
                  const sign   = d >= 0 ? '+' : '';
                  const pctStr = pctVal !== null ? ` (${sign}${pctVal}%)` : '';
                  return [`${arrow} Δ ${sign}${fmtVal(d, currency[i], pct[i])}${pctStr}`];
                }
              }
            }
          },
          scales: {
            x: { grid: { display: false }, ticks: { color: '#7a9bbf', font: { size: 10 } } },
            y: {
              beginAtZero: true, grid: GRID_STYLE,
              ticks: {
                ...TICK_STYLE,
                callback: v => {
                  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
                  if (v >= 1e3) return (v / 1e3).toFixed(0) + 'k';
                  return v;
                }
              }
            }
          }
        }
      });
    },

    /**
     * ── v4.0 — CARTES DELTA KPI ──────────────────────────
     * Injecter des badges ▲/▼ dans le conteneur donné.
     * @param {Object} cmp      résultat compareYears()
     * @param {string} containerId  id du conteneur HTML
     */
    renderDeltaKPIs(cmp, containerId = 'year-delta-kpis') {
      const el = document.getElementById(containerId);
      if (!el || !cmp) return;
      const positiveOnly = (typeof Analytics !== 'undefined' && Analytics.compareConfig)
        ? Analytics.compareConfig.positiveOnly : false;

      const fmt = v => typeof ProjectUtils !== 'undefined'
        ? ProjectUtils.formatMontant(v, true)
        : (Math.abs(v) / 1e6).toFixed(2) + 'M€';

      const items = [
        { label: 'CA Gagné',     val: cmp['Bud'],  format: 'currency' },
        { label: 'CA Étudié',    val: cmp['Bud'], format: 'currency' },
        { label: 'Win Rate',     val: { ...cmp.winRate, deltaPct: null, delta: cmp.winRate.delta }, format: 'pt', delta: cmp.winRate.delta, positive: cmp.winRate.positive },
        { label: 'Volume',       val: cmp.volume,    format: 'count' },
        { label: 'Projets Gagnés', val: cmp.won,     format: 'count' },
        { label: 'CA Moyen',     val: cmp.avgCA,     format: 'currency' },
      ].filter(item => {
        if (!positiveOnly) return true;
        return (item.val.positive !== undefined ? item.val.positive : item.val.delta >= 0);
      });

      el.innerHTML = items.map(item => {
        const d  = item.val.delta ?? 0;
        const pc = item.val.deltaPct;
        const pos = item.val.positive !== undefined ? item.val.positive : d >= 0;
        const color  = pos ? '#00d4aa' : '#ff4d6d';
        const arrow  = d > 0 ? '▲' : d < 0 ? '▼' : '→';
        const sign   = d > 0 ? '+' : '';
        let deltaStr;
        if (item.format === 'currency') {
          deltaStr = sign + fmt(d);
        } else if (item.format === 'pt') {
          deltaStr = (d !== null ? sign + d + 'pt' : 'N/A');
        } else {
          deltaStr = sign + d;
        }
        const pctStr = pc !== null && pc !== undefined ? ` (${pc >= 0 ? '+' : ''}${pc}%)` : '';

        return `<div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-left:3px solid ${color};border-radius:0 8px 8px 0;padding:.6rem .95rem;display:flex;flex-direction:column;gap:.25rem;">
          <div style="font-family:var(--mono);font-size:.6rem;text-transform:uppercase;letter-spacing:.07em;color:var(--dust);">${item.label}</div>
          <div style="display:flex;align-items:baseline;gap:.4rem;">
            <span style="font-family:var(--serif);font-size:1rem;font-weight:700;color:${color};">${arrow} ${deltaStr}</span>
            ${pctStr ? `<span style="font-family:var(--mono);font-size:.68rem;color:${color};opacity:.7;">${pctStr}</span>` : ''}
          </div>
          <div style="font-family:var(--mono);font-size:.65rem;color:var(--dust);">${item.val.A ?? 'N/A'} → ${item.val.B ?? 'N/A'}</div>
        </div>`;
      }).join('');
    },

    /**
     * ── v4.1 — RENDU BARRE OBJECTIF EN MODE COMPARAISON ─────
     *
     * Affiche une lecture complète dans le bloc obj-bar existant :
     * - Double barre (A en avant-plan, B en arrière-plan)
     * - 4 indicateurs delta avec couleur dynamique
     * - Phrase narrative automatique
     * - Respect du mode positiveOnly
     *
     * @param {Object} cmpObj  résultat de Analytics.compareObjective()
     * @param {string} containerId  id du conteneur HTML de la barre objectif
     */
    renderObjectiveComparison(cmpObj, containerId = 'obj-bar-comparison') {
      const el = document.getElementById(containerId);
      if (!el || !cmpObj) return;

      const positiveOnly = (typeof Analytics !== 'undefined' && Analytics.compareConfig)
        ? Analytics.compareConfig.positiveOnly : false;

      const COLOR_A  = '#0099ff';
      const COLOR_B  = '#8b78f8';
      const COLOR_OK = '#00d4aa';
      const COLOR_KO = '#ff4d6d';
      const COLOR_NA = '#f5b740';

      /* ── Barres doubles ── */
      const pctA = Math.min(cmpObj.bars.A.pct, 110); // cap 110% for display
      const pctB = Math.min(cmpObj.bars.B.pct, 110);
      const pctADisplay = Math.min(pctA, 100);
      const pctBDisplay = Math.min(pctB, 100);
      const doneA = cmpObj.bars.A.pct >= 100;
      const doneB = cmpObj.bars.B.pct >= 100;

      /* ── Verdict config ── */
      const verdictMap = {
        ahead:     { text: '✅ Objectif dépassé', color: COLOR_OK },
        behind:    { text: '⚠️ En dessous objectif', color: COLOR_KO },
        improving: { text: '📈 En progression', color: COLOR_OK },
        worsening: { text: '📉 En recul', color: COLOR_KO },
        stable:    { text: '→ Stable', color: COLOR_NA }
      };
      const vCfg = verdictMap[cmpObj.verdict] || verdictMap.stable;

      /* ── Indicateurs (filtrés si positiveOnly) ── */
      let indicators = cmpObj.indicators.filter(i => i.available);
      if (positiveOnly) indicators = indicators.filter(i => i.positive);

      const _arrowHtml = (ind) => {
        const isPos = ind.positive;
        const color = isPos ? COLOR_OK : COLOR_KO;
        const arrow = ind.delta > 0 ? '▲' : ind.delta < 0 ? '▼' : '→';
        const sign  = ind.delta > 0 ? '+' : '';
        let deltaStr;
        if (ind.isPoints) {
          deltaStr = `${sign}${ind.delta}pt`;
        } else if (ind.isGap) {
          // Écart: négatif = bon (réduction), positif = mauvais
          const reduced = ind.delta < 0;
          const absVal  = typeof ProjectUtils !== 'undefined'
            ? ProjectUtils.formatMontant(Math.abs(ind.delta), true)
            : (Math.abs(ind.delta)/1e6).toFixed(2) + 'M€';
          deltaStr = `${reduced ? '▼ Réduit de ' : '▲ Creusé de '}${absVal}`;
          return `<span style="color:${reduced ? COLOR_OK : COLOR_KO};font-weight:700;font-size:.78rem;">${deltaStr}</span>`;
        } else {
          const fmtV = typeof ProjectUtils !== 'undefined'
            ? ProjectUtils.formatMontant(Math.abs(ind.delta), true)
            : (Math.abs(ind.delta)/1e6).toFixed(2) + 'M€';
          const pctStr = ind.deltaPct !== null ? ` (${sign}${ind.deltaPct}%)` : '';
          deltaStr = `${arrow} ${sign}${fmtV}${pctStr}`;
        }
        return `<span style="color:${color};font-weight:700;font-size:.78rem;">${deltaStr}</span>`;
      };

      /* ── HTML ── */
      el.innerHTML = `
        <!-- Narrative -->
        <div style="font-family:var(--sans);font-size:.82rem;color:var(--pale);line-height:1.55;margin-bottom:1rem;padding:.7rem .9rem;background:rgba(255,255,255,.03);border-radius:8px;border-left:3px solid ${vCfg.color};">
          <span style="color:${vCfg.color};font-weight:600;">${vCfg.text}</span> — ${cmpObj.narrative}
        </div>

        <!-- Double barre -->
        <div style="display:flex;flex-direction:column;gap:.5rem;margin-bottom:1.1rem;">

          <!-- Barre A -->
          <div style="display:flex;align-items:center;gap:.75rem;">
            <span style="font-family:var(--mono);font-size:.62rem;color:${COLOR_A};font-weight:700;min-width:50px;text-align:right;">${cmpObj.yearA}</span>
            <div style="flex:1;height:28px;background:var(--paper);border-radius:6px;overflow:hidden;border:1px solid rgba(0,153,255,.25);position:relative;">
              <div style="height:100%;width:${pctADisplay}%;background:${doneA ? `linear-gradient(90deg,#10b981,${COLOR_OK})` : `linear-gradient(90deg,${COLOR_A},${COLOR_OK})`};transition:width .9s cubic-bezier(.4,0,.2,1);position:relative;">
                <div style="position:absolute;inset:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.15),transparent);animation:shimmer 2.5s ease-in-out infinite;"></div>
              </div>
              <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:var(--mono);font-size:.75rem;font-weight:700;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.8);">${pctA.toFixed(1)}%</div>
            </div>
          </div>

          <!-- Barre B -->
          <div style="display:flex;align-items:center;gap:.75rem;">
            <span style="font-family:var(--mono);font-size:.62rem;color:${COLOR_B};font-weight:700;min-width:50px;text-align:right;">${cmpObj.yearB}</span>
            <div style="flex:1;height:20px;background:var(--paper);border-radius:6px;overflow:hidden;border:1px solid rgba(139,120,248,.2);position:relative;">
              <div style="height:100%;width:${pctBDisplay}%;background:${doneB ? `rgba(16,185,129,.6)` : `rgba(139,120,248,.55)`};transition:width .9s cubic-bezier(.4,0,.2,1);border-radius:6px;"></div>
              <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:var(--mono);font-size:.68rem;font-weight:600;color:rgba(255,255,255,.75);">${pctB.toFixed(1)}%</div>
            </div>
          </div>
        </div>

        <!-- Indicateurs delta -->
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(175px,1fr));gap:.5rem;">
          ${indicators.map(ind => `
            <div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-left:3px solid ${ind.positive ? COLOR_OK : COLOR_KO};border-radius:0 7px 7px 0;padding:.5rem .75rem;display:flex;flex-direction:column;gap:.22rem;">
              <div style="font-family:var(--mono);font-size:.58rem;text-transform:uppercase;letter-spacing:.07em;color:var(--dust);">${ind.icon} ${ind.label}</div>
              <div>${_arrowHtml(ind)}</div>
              <div style="font-family:var(--mono);font-size:.62rem;color:var(--dust);">${ind.valueA} <span style="color:rgba(255,255,255,.25)">vs</span> ${ind.valueB}</div>
            </div>
          `).join('')}
          ${indicators.length === 0 ? `<div style="font-family:var(--mono);font-size:.72rem;color:var(--dust);">Aucun indicateur positif à afficher.</div>` : ''}
        </div>`;
    },
    /* ────────────────────────────────────────────────────
       v5.0 — NOUVEAUX GRAPHIQUES ENRICHIS
    ──────────────────────────────────────────────────── */

    /** Funnel CA (valeur réelle) — horizontal bar décroissant */
    createFunnelCAChart(projects, id = 'chart-funnel-ca') {
      if (typeof Analytics === 'undefined' || !Analytics.funnelCA) return;
      const data = Analytics.funnelCA(projects);
      if (!data || !data.stages.length) return;

      this._createChart(id, {
        type: 'bar',
        data: {
          labels: data.stages.map(s => s.label),
          datasets: [{
            label: 'CA',
            data: data.stages.map(s => s.ca),
            backgroundColor: data.stages.map(s => alpha(s.color, 0.8)),
            borderColor: data.stages.map(s => s.color),
            borderWidth: 2,
            borderRadius: 8
          }]
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              ...BASE_TOOLTIP,
              callbacks: {
                label: ctx => ` ${fmt(ctx.raw)}`
              }
            }
          },
          scales: {
            x: { beginAtZero: true, grid: GRID_STYLE, ticks: { ...TICK_STYLE, callback: v => fmt(v) } },
            y: { grid: { display: false }, ticks: TICK_STYLE }
          }
        }
      });

      this._makeClickable(id, 'Statut'); // BUG FIX #1 : funnel CA → filtre par statut
    },

    /** Analyse par type d'offre — horizontal bar trié par conversion */
    createOfferTypeAnalysisChart(projects, id = 'chart-offer-type-analysis') {
      if (typeof Analytics === 'undefined' || !Analytics.analysisByOfferType) return;
      const data = Analytics.analysisByOfferType(projects).filter(d => d.winRate !== null);
      if (!data.length) return;

      this._createChart(id, {
        type: 'bar',
        data: {
          labels: data.map(d => d.type.length > 22 ? d.type.substring(0, 20) + '…' : d.type),
          datasets: [
            {
              label: 'Taux conversion %',
              data: data.map(d => d.winRate),
              backgroundColor: data.map(d => alpha(d.winRate >= 50 ? THEME.brand : d.winRate >= 30 ? THEME.gold : THEME.red, 0.75)),
              borderRadius: 6,
              yAxisID: 'y1',
              order: 2
            },
            {
              label: 'CA moyen gagné',
              data: data.map(d => d.avgCA),
              type: 'line',
              borderColor: THEME.blue,
              backgroundColor: 'transparent',
              borderWidth: 2.5,
              pointBackgroundColor: THEME.blue,
              pointRadius: 5,
              tension: 0.3,
              yAxisID: 'y2',
              order: 1
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: THEME.pale, boxWidth: 12 } },
            tooltip: {
              ...BASE_TOOLTIP,
              callbacks: {
                label: ctx => ctx.datasetIndex === 0
                  ? ` Conversion: ${ctx.raw}%`
                  : ` CA moyen: ${fmt(ctx.raw)}`
              }
            }
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { ...TICK_STYLE, maxRotation: 45, minRotation: 0, font: { size: 10 } }
            },
            y1: {
              position: 'left',
              beginAtZero: true,
              max: 100,
              grid: GRID_STYLE,
              ticks: { ...TICK_STYLE, callback: v => v + '%' },
              title: { display: true, text: 'Conversion %', color: THEME.pale, font: { size: 10 } }
            },
            y2: {
              position: 'right',
              beginAtZero: true,
              grid: { display: false },
              ticks: { ...TICK_STYLE, callback: v => fmt(v) },
              title: { display: true, text: 'CA moyen', color: THEME.pale, font: { size: 10 } }
            }
          }
        }
      });

      _renderSubtitle(id, (() => {
        const best = data.reduce((a, b) => (a.winRate || 0) > (b.winRate || 0) ? a : b);
        return best ? `Meilleur type : <strong>${best.type}</strong> — ${best.winRate}% conversion · CA moyen ${fmt(best.avgCA)}` : '';
      })());

      this._makeClickable(id, 'Type de projet (Activité)'); // BUG FIX #1
    },

    /** Croissance cumulée — ligne comparative Année N vs N-1 */
    createCumulativeGrowthChart(projects, year, id = 'chart-cumulative-growth') {
      if (typeof Analytics === 'undefined' || !Analytics.cumulativeGrowth) return;
      const data = Analytics.cumulativeGrowth(projects, year);
      if (!data) return;

      const y = parseInt(year, 10);
      this._createChart(id, {
        type: 'line',
        data: {
          labels: data.months,
          datasets: [
            {
              label: String(y),
              data: data.currentYear,
              borderColor: THEME.brand,
              backgroundColor: alpha(THEME.brand, 0.1),
              borderWidth: 3,
              fill: true,
              tension: 0.35,
              pointRadius: 4,
              pointBackgroundColor: THEME.brand
            },
            {
              label: String(y - 1),
              data: data.previousYear,
              borderColor: THEME.violet,
              backgroundColor: alpha(THEME.violet, 0.05),
              borderWidth: 2,
              borderDash: [6, 3],
              fill: true,
              tension: 0.35,
              pointRadius: 3,
              pointBackgroundColor: THEME.violet
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: THEME.pale, boxWidth: 12, padding: 16 } },
            tooltip: {
              ...BASE_TOOLTIP,
              callbacks: {
                label: ctx => ` ${ctx.dataset.label} : ${fmt(ctx.raw)}`
              }
            }
          },
          scales: {
            x: { grid: { display: false }, ticks: TICK_STYLE },
            y: { beginAtZero: true, grid: GRID_STYLE, ticks: { ...TICK_STYLE, callback: v => fmt(v) } }
          }
        }
      });

      this._makeClickable(id, '_annee'); // BUG FIX #1 : croissance cumulative → filtre par année
    },

    /** Rendu du score de performance v5 en badge HTML */
    renderPerformanceScore(scoreData, containerId = 'perf-score-widget') {
      const el = document.getElementById(containerId);
      if (!el || !scoreData) return;

      const { score, deltaVsLastYear, breakdown } = scoreData;
      let color, emoji;
      if (score >= 80) { color = '#00d4aa'; emoji = '🏆'; }
      else if (score >= 65) { color = '#10b981'; emoji = '✅'; }
      else if (score >= 50) { color = '#f5b740'; emoji = '⚡'; }
      else if (score >= 35) { color = '#f97316'; emoji = '⚠️'; }
      else { color = '#ff4d6d'; emoji = '🔴'; }

      const deltaHtml = deltaVsLastYear !== null
        ? `<span style="font-size:.68rem;color:${deltaVsLastYear >= 0 ? '#00d4aa' : '#ff4d6d'};margin-left:.4rem;">${deltaVsLastYear >= 0 ? '▲' : '▼'} ${deltaVsLastYear >= 0 ? '+' : ''}${deltaVsLastYear}pt</span>`
        : '';

      const bk = breakdown;
      const barHtml = (label, val, max, c) => `
        <div style="display:flex;align-items:center;gap:.4rem;font-size:.62rem;">
          <span style="color:var(--dust);min-width:80px;">${label}</span>
          <div style="flex:1;height:6px;background:rgba(255,255,255,.06);border-radius:3px;overflow:hidden;">
            <div style="width:${(val/max)*100}%;height:100%;background:${c};border-radius:3px;transition:width .6s;"></div>
          </div>
          <span style="color:var(--pale);font-family:var(--mono);min-width:28px;text-align:right;">${val}/${max}</span>
        </div>`;

      el.innerHTML = `
        <div style="display:flex;align-items:center;gap:1rem;margin-bottom:.6rem;">
          <div style="font-family:var(--serif);font-size:2rem;font-weight:900;color:${color};">${emoji} ${score}</div>
          <div>
            <div style="font-family:var(--mono);font-size:.7rem;color:var(--snow);font-weight:700;">Score Performance</div>
            <div style="font-family:var(--mono);font-size:.62rem;color:var(--dust);">/100${deltaHtml}</div>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:.35rem;">
          ${barHtml('Conversion', bk.conversion, 30, THEME.brand)}
          ${barHtml('Objectif', bk.objectif, 30, THEME.blue)}
          ${barHtml('Croissance', bk.croissance, 20, THEME.green)}
          ${barHtml('Pipeline', bk.pipeline, 10, THEME.violet)}
          ${barHtml('Diversification', bk.diversification, 10, THEME.gold)}
        </div>`;
    },

    /** Rendu de la projection EOY en widget */
    renderProjectionWidget(projData, containerId = 'projection-eoy-widget') {
      const el = document.getElementById(containerId);
      if (!el || !projData) return;

      const { current, weightedPipeline, trendContrib, projected, objectif, projectedCompletion } = projData;
      const onTrack = projectedCompletion !== null && projectedCompletion >= 100;
      const color = onTrack ? '#00d4aa' : projectedCompletion >= 80 ? '#f5b740' : '#ff4d6d';
      const emoji = onTrack ? '✅' : projectedCompletion >= 80 ? '⚡' : '⚠️';

      el.innerHTML = `
        <div style="display:flex;align-items:baseline;gap:.5rem;margin-bottom:.7rem;">
          <span style="font-family:var(--serif);font-size:1.4rem;font-weight:900;color:${color};">${emoji} ${fmt(projected)}</span>
          ${objectif > 0 ? `<span style="font-family:var(--mono);font-size:.68rem;color:var(--dust);">/ ${fmt(objectif)} (${projectedCompletion}%)</span>` : ''}
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:.4rem;">
          <div style="background:rgba(0,212,170,.08);border:1px solid rgba(0,212,170,.2);border-radius:6px;padding:.4rem .6rem;text-align:center;">
            <div style="font-family:var(--mono);font-size:.55rem;color:var(--dust);text-transform:uppercase;">CA Actuel</div>
            <div style="font-family:var(--mono);font-size:.78rem;font-weight:700;color:#00d4aa;">${fmt(current)}</div>
          </div>
          <div style="background:rgba(139,120,248,.08);border:1px solid rgba(139,120,248,.2);border-radius:6px;padding:.4rem .6rem;text-align:center;">
            <div style="font-family:var(--mono);font-size:.55rem;color:var(--dust);text-transform:uppercase;">Pipeline</div>
            <div style="font-family:var(--mono);font-size:.78rem;font-weight:700;color:#8b78f8;">${fmt(weightedPipeline)}</div>
          </div>
          <div style="background:rgba(0,153,255,.08);border:1px solid rgba(0,153,255,.2);border-radius:6px;padding:.4rem .6rem;text-align:center;">
            <div style="font-family:var(--mono);font-size:.55rem;color:var(--dust);text-transform:uppercase;">Tendance</div>
            <div style="font-family:var(--mono);font-size:.78rem;font-weight:700;color:#0099ff;">${fmt(trendContrib)}</div>
          </div>
        </div>
        ${objectif > 0 ? `
        <div style="margin-top:.6rem;height:8px;background:rgba(255,255,255,.06);border-radius:4px;overflow:hidden;">
          <div style="width:${Math.min(100, projectedCompletion)}%;height:100%;background:${color};border-radius:4px;transition:width .8s;"></div>
        </div>` : ''}`;
    },

    /** Rendu bilan exécutif (narratif) */
    renderExecutiveSummary(summary, containerId = 'analysis-text') {
      const el = document.getElementById(containerId);
      if (!el || !summary) return;

      const COLOR_OK = '#00d4aa', COLOR_KO = '#ff4d6d', COLOR_INFO = '#0099ff';

      el.innerHTML = `
        <div style="font-family:var(--serif);font-size:1.05rem;font-weight:700;color:var(--snow);margin-bottom:.65rem;">${summary.headline}</div>
        <div style="font-family:var(--sans);font-size:.82rem;color:var(--pale);line-height:1.55;margin-bottom:.9rem;">${summary.summary}</div>

        ${summary.strengths.length > 0 ? `
        <div style="margin-bottom:.7rem;">
          <div style="font-family:var(--mono);font-size:.62rem;text-transform:uppercase;letter-spacing:.06em;color:${COLOR_OK};margin-bottom:.35rem;">✅ Points forts</div>
          ${summary.strengths.map(s => `<div style="font-size:.78rem;color:var(--pale);padding:.2rem 0 .2rem .8rem;border-left:2px solid ${COLOR_OK};">${s}</div>`).join('')}
        </div>` : ''}

        ${summary.risks.length > 0 ? `
        <div style="margin-bottom:.7rem;">
          <div style="font-family:var(--mono);font-size:.62rem;text-transform:uppercase;letter-spacing:.06em;color:${COLOR_KO};margin-bottom:.35rem;">⚠️ Points de vigilance</div>
          ${summary.risks.map(r => `<div style="font-size:.78rem;color:var(--pale);padding:.2rem 0 .2rem .8rem;border-left:2px solid ${COLOR_KO};">${r}</div>`).join('')}
        </div>` : ''}

        <div style="font-size:.8rem;color:var(--pale);padding:.5rem .7rem;background:rgba(0,153,255,.06);border:1px solid rgba(0,153,255,.2);border-radius:6px;margin-bottom:.5rem;">
          🔮 ${summary.projection}
        </div>

        <div style="font-size:.78rem;color:var(--dust);font-style:italic;">
          💡 ${summary.recommendation}
        </div>`;
    },

    /** Rendu concentration client */
    renderClientConcentration(concData, containerId = 'concentration-widget') {
      const el = document.getElementById(containerId);
      if (!el || !concData) return;

      const riskColors = { low: '#00d4aa', medium: '#f5b740', high: '#ff4d6d', critical: '#ff4d6d' };
      const riskLabels = { low: 'Faible', medium: 'Modéré', high: 'Élevé', critical: 'Critique' };
      const color = riskColors[concData.riskLevel] || '#f5b740';

      el.innerHTML = `
        <div style="display:flex;align-items:center;gap:.7rem;margin-bottom:.5rem;">
          <div style="font-family:var(--serif);font-size:1.6rem;font-weight:900;color:${color};">${concData.share}%</div>
          <div>
            <div style="font-family:var(--mono);font-size:.65rem;color:var(--snow);">${concData.topClient || '—'}</div>
            <div style="font-family:var(--mono);font-size:.58rem;color:${color};">Risque ${riskLabels[concData.riskLevel]}</div>
          </div>
        </div>
        ${concData.details ? concData.details.slice(0, 4).map(d => `
          <div style="display:flex;align-items:center;gap:.4rem;margin-bottom:.25rem;">
            <div style="flex:1;height:5px;background:rgba(255,255,255,.06);border-radius:3px;overflow:hidden;">
              <div style="width:${d.share}%;height:100%;background:${alpha(color, 0.6)};border-radius:3px;"></div>
            </div>
            <span style="font-family:var(--mono);font-size:.6rem;color:var(--dust);min-width:90px;text-align:right;overflow:hidden;text-overflow:ellipsis;">${d.client.substring(0,15)}</span>
            <span style="font-family:var(--mono);font-size:.6rem;color:var(--pale);min-width:30px;text-align:right;">${d.share}%</span>
          </div>`).join('') : ''}
        ${concData.share >= 40 ? `<div style="margin-top:.5rem;font-size:.7rem;color:${color};font-style:italic;">⚠️ Concentration > 40% — diversification recommandée</div>` : ''}`;
    },

    /** Rendu efficacité commerciale en badge */
    renderCommercialEfficiency(effData, containerId = 'efficiency-widget') {
      const el = document.getElementById(containerId);
      if (!el || !effData) return;

      const color = effData.score >= 70 ? '#00d4aa' : effData.score >= 50 ? '#f5b740' : '#ff4d6d';
      el.innerHTML = `
        <div style="display:flex;align-items:baseline;gap:.5rem;">
          <span style="font-family:var(--serif);font-size:1.8rem;font-weight:900;color:${color};">${effData.score}</span>
          <span style="font-family:var(--mono);font-size:.68rem;color:var(--dust);">/100 · ${effData.label}</span>
        </div>`;
    },

    renderZoneComparisonTable(cmp, containerId = 'year-zone-table') {
      const el = document.getElementById(containerId);
      if (!el || !cmp) return;
      const positiveOnly = (typeof Analytics !== 'undefined' && Analytics.compareConfig)
        ? Analytics.compareConfig.positiveOnly : false;

      const fmt = v => typeof ProjectUtils !== 'undefined'
        ? ProjectUtils.formatMontant(v, true) : (v / 1e6).toFixed(2) + 'M€';

      let zones = cmp.zoneComparison;
      if (positiveOnly) zones = zones.filter(z => z.positive);

      el.innerHTML = zones.map(z => {
        const color = z.positive ? '#00d4aa' : '#ff4d6d';
        const arrow = z.delta > 0 ? '▲' : z.delta < 0 ? '▼' : '→';
        const pctStr = z.deltaPct !== null ? ` ${z.deltaPct >= 0 ? '+' : ''}${z.deltaPct}%` : '';
        return `<div style="display:flex;align-items:center;gap:.6rem;padding:.42rem .6rem;border-radius:6px;background:rgba(255,255,255,.025);">
          <span style="flex:0 0 120px;font-family:var(--sans);font-size:.78rem;color:var(--pale);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${z.zone || 'N/A'}</span>
          <span style="flex:1;font-family:var(--mono);font-size:.72rem;color:var(--dust);">${fmt(z.caA)} / ${fmt(z.caB)}</span>
          <span style="font-family:var(--mono);font-size:.78rem;font-weight:700;color:${color};white-space:nowrap;">${arrow}${pctStr}</span>
        </div>`;
      }).join('') || `<div style="font-family:var(--mono);font-size:.72rem;color:var(--dust);">Aucune donnée ${positiveOnly ? 'positive' : ''} à afficher.</div>`;
    },

    /**
     * Mettre à jour tous les graphiques (après filtrage).
     * @param {Array} projects
     */
    updateAll(projects) {
      this.initAll(projects, { onChartClick: this.onChartClick });
    },

    /** Détruire tous les graphiques */
    destroyAll() {
      Object.values(this.charts).forEach(c => { try { c.destroy(); } catch (_) {} });
      this.charts = {};
    }
  };

  /* ──────────────────────────────────────────────────────
     HELPER INTERNE : groupBy + sum
  ────────────────────────────────────────────────────── */

  function _applyGroupBy(projects, groupField, sumField) {
    const map = {};
    projects.forEach(p => {
      const key = (p[groupField] || 'Non défini').trim();
      const val = parseInt(p[sumField], 10) || 0;
      map[key] = (map[key] || 0) + val;
    });
    return map;
  }

  /* ──────────────────────────────────────────────────────
     EXPORT
  ────────────────────────────────────────────────────── */

  global.ChartsEnrichis = ChartsEnrichis;
  console.log('%c📊 ChartsEnrichis.js v4.0 chargé', 'color:#0099ff;font-weight:700');

})(typeof window !== 'undefined' ? window : global);
