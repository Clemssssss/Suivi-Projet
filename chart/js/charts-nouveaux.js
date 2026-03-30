/**
 * ============================================================
 * CHARTS-NOUVEAUX.JS — Nouveaux graphiques analytiques v1.0
 * ============================================================
 *
 * Graphiques ajoutés (correctif #7) :
 *  1. CA Gagné vs CA Étudié par année          createCAGagneVsEtudieChart()
 *  2. Pipeline pondéré vs Objectif             createPipelineVsObjectifChart()
 *  3. Taux de conversion par société           createConversionBySocieteChart()
 *  4. Délai moyen de décision                  createDelaiMoyenChart()
 *  5. Heatmap Zone × Statut                    createHeatmapZoneStatut()
 *
 * Règles architecturales :
 *  ✅ Aucun calcul métier — tout via AnalyticsExtended.* et Analytics.*
 *  ✅ Aucune lecture directe de 'Bud' — via Analytics.getCAValue() ou AnalyticsExtended.getCAValue()
 *  ✅ Statuts via ProjectUtils.getStatus()
 *  ✅ Compatible Chart.js 4.x
 *  ✅ Enregistrement dans ChartFilterController quand pertinent
 *
 * Dépendances (à charger avant) :
 *  analytics.js, analytics-patch.js, projectUtils.js, Chart.js 4.x
 * ============================================================
 */

(function (global) {
  'use strict';

  // ─────────────────────────────────────────────────────────
  // Thème partagé (copié de charts-enrichis pour cohérence)
  // ─────────────────────────────────────────────────────────
  const T = {
    brand:  '#00d4aa',
    blue:   '#0099ff',
    red:    '#ff4d6d',
    gold:   '#f5b740',
    violet: '#8b78f8',
    green:  '#10b981',
    pale:   '#9fb3c8',
    snow:   '#dce8f5',
  };

  const alpha = (hex, a) => {
    if (!hex) return `rgba(0,0,0,${a})`;
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
    titleColor:      T.snow,
    bodyColor:       T.pale,
    padding:         14,
    cornerRadius:    10,
    displayColors:   true,
    boxWidth:        10,
    boxHeight:       10,
  };

  const GRID_STYLE = { color: 'rgba(255,255,255,0.05)', drawBorder: false };
  const TICK_STYLE = { color: T.pale, font: { size: 11 } };

  const fmt = v => {
    // Protection contre valeurs nulles/undefined
    if (v === null || v === undefined || isNaN(v)) return '0€';
    if (typeof ProjectUtils !== 'undefined') return ProjectUtils.formatMontant(v, true);
    if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(2) + 'M€';
    if (Math.abs(v) >= 1e3) return Math.round(v / 1e3) + 'k€';
    return v + '€';
  };

  // Helper : créer ou remplacer un graphique Chart.js
  const _charts = {};
  let   _cnInitialized = false; // Guard anti-double-init

  // ─────────────────────────────────────────────────────────
  // Helper universel : afficher un message si dataset vide
  // ─────────────────────────────────────────────────────────
  function _showEmptyMessage(id, message) {
    message = message || 'Aucune donnée disponible';
    const canvas = document.getElementById(id);
    if (!canvas) return;

    // Détruire l'instance Chart.js existante sans toucher ChartFilterController
    if (_charts[id]) {
      try { _charts[id].destroy(); } catch (_) {}
      delete _charts[id];
    }

    // Afficher le message centré sur le canvas
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = canvas.width  || canvas.offsetWidth  || 400;
    const h = canvas.height || canvas.offsetHeight || 200;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.fillStyle = 'rgba(159,179,200,0.55)';
    ctx.font = '14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(message, w / 2, h / 2);
    ctx.restore();
  }

  function _createChart(id, config) {
    const ctx = document.getElementById(id);
    if (!ctx) { console.warn(`[ChartsNouveaux] Canvas #${id} introuvable`); return null; }
    // CORRECTION 10 : destroy + unregister systématiques
    if (_charts[id]) {
      try { _charts[id].destroy(); } catch (_) {}
      delete _charts[id];
      if (typeof ChartFilterController !== 'undefined' && ChartFilterController.unregisterChart) {
        ChartFilterController.unregisterChart(id);
      }
    }
    config.options = config.options || {};
    config.options.animation = { duration: 600, easing: 'easeOutQuart', ...(config.options.animation || {}) };
    _charts[id] = new Chart(ctx, config);
    return _charts[id];
  }

  // Helper : rendre un graphique cliquable (via ChartFilterController)
  function _makeClickable(id, filterType, extraFilters) {
    const chart = _charts[id];
    if (!chart) return;
    if (typeof ChartFilterController !== 'undefined') {
      ChartFilterController.registerChart(id, chart, {
        filterType,
        clickable:         true,
        highlightOnFilter: true,
        reRenderOnFilter:  true,
        extraFilters:      extraFilters || null,
      });
    }
  }

  // ─────────────────────────────────────────────────────────
  // Helper : obtenir la fonction getCAValue
  // ─────────────────────────────────────────────────────────
  function _getCAValue(project, mode) {
    if (!project) return 0;
    if (typeof AnalyticsExtended !== 'undefined' && AnalyticsExtended.getCAValue) {
      return AnalyticsExtended.getCAValue(project, mode) || 0;
    }
    // Fallback local — protection contre Bud null ou mal formaté
    let bud = 0;
    try {
      bud = (typeof ProjectUtils !== 'undefined')
        ? (ProjectUtils.parseMontant(project['Bud']) || 0)
        : (parseFloat(project['Bud']) || 0);
    } catch (_) { bud = 0; }
    if (isNaN(bud) || bud < 0) bud = 0;

    if (mode === 'ca_gagne') {
      return (typeof ProjectUtils !== 'undefined' && ProjectUtils.getStatus(project) === 'obtenu') ? bud : 0;
    }
    return bud;
  }

  // ─────────────────────────────────────────────────────────
  // Helper : dernière année réellement présente dans les données
  // (indépendant de l'horloge système)
  // ─────────────────────────────────────────────────────────
  function _getLastAvailableYear(projects) {
    if (!projects || !projects.length) return null;
    const years = projects
      .map(p => {
        if (!p) return null;
        // Priorité 1 : champ _annee pré-calculé
        if (p._annee) return parseInt(p._annee, 10);
        // Priorité 2 : Analytics.getProjectYear
        try {
          if (typeof Analytics !== 'undefined' && Analytics.getProjectYear) {
            return parseInt(Analytics.getProjectYear(p), 10);
          }
        } catch (_) {}
        return null;
      })
      .filter(y => y !== null && !isNaN(y) && y > 1900 && y < 2200);
    if (!years.length) return null;
    return Math.max(...years);
  }

  // ─────────────────────────────────────────────────────────
  // 1. CA Gagné vs CA Étudié par Année
  // ─────────────────────────────────────────────────────────
  /**
   * Graphique double-barre : CA Étudié (bleu) + CA Gagné (vert) par année.
   * Ligne taux de réalisation sur axe Y secondaire.
   *
   * @param {Object[]} projects
   * @param {string}   [id='chart-ca-gagne-vs-etudie']
   */
  function createCAGagneVsEtudieChart(projects, id) {
    id = id || 'chart-ca-gagne-vs-etudie';

    // Protection dataset vide (input)
    if (!projects || projects.length === 0) {
      console.warn(`[ChartsNouveaux] ${id} : dataset vide (input)`);
      _showEmptyMessage(id, 'Aucun projet disponible');
      return;
    }

    // Agrégation
    const rows = typeof AnalyticsExtended !== 'undefined' && AnalyticsExtended.caByYearCorrected
      ? AnalyticsExtended.caByYearCorrected(projects)
      : _caByYearLocal(projects);

    const years  = Object.keys(rows || {}).sort();

    // Protection après agrégation
    if (!years.length) {
      console.warn(`[ChartsNouveaux] ${id} : aucune année détectée après agrégation`);
      _showEmptyMessage(id, 'Aucune donnée annuelle disponible');
      return;
    }

    const etudie = years.map(y => rows[y].etudie || 0);
    const gagne  = years.map(y => rows[y].gagne  || 0);

    // Protection si toutes les valeurs sont à zéro
    if (etudie.every(v => v === 0) && gagne.every(v => v === 0)) {
      console.warn(`[ChartsNouveaux] ${id} : toutes les valeurs CA sont à 0`);
      _showEmptyMessage(id, 'Aucun CA enregistré');
      return;
    }

    // Protection division par zéro dans taux de réalisation
    const taux = years.map(y =>
      (rows[y].etudie || 0) > 0 ? Math.round(((rows[y].gagne || 0) / rows[y].etudie) * 100) : 0
    );

    // Protection longueur labels === dataset
    if (years.length !== etudie.length || years.length !== gagne.length) {
      console.warn(`[ChartsNouveaux] ${id} : incohérence labels/données`);
      _showEmptyMessage(id, 'Erreur de données');
      return;
    }

    _createChart(id, {
      type: 'bar',
      data: {
        labels:   years,
        datasets: [
          {
            label: 'CA Étudié (Budget)',
            data:  etudie,
            backgroundColor: alpha(T.blue, 0.55),
            borderColor:     T.blue,
            borderWidth: 2,
            borderRadius: 6,
            order: 2,
          },
          {
            label: 'CA Gagné',
            data:  gagne,
            backgroundColor: alpha(T.brand, 0.75),
            borderColor:     T.brand,
            borderWidth: 2,
            borderRadius: 6,
            order: 1,
          },
          {
            type:  'line',
            label: 'Taux de réalisation %',
            data:  taux,
            borderColor:  T.gold,
            backgroundColor: 'transparent',
            tension:      0.35,
            borderWidth:  2,
            borderDash:   [4, 3],
            pointRadius:  5,
            pointHoverRadius: 7,
            pointBackgroundColor: T.gold,
            pointBorderColor: '#0f1723',
            pointBorderWidth: 2,
            yAxisID: 'y2',
            order: 0,
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: { color: T.pale, font: { size: 11 }, padding: 14, usePointStyle: true }
          },
          tooltip: {
            ...BASE_TOOLTIP,
            callbacks: {
              title: ctx => `Année ${ctx[0].label}`,
              label: ctx => {
                if (ctx.dataset.yAxisID === 'y2') return ` Taux réalisation : ${ctx.raw}%`;
                return ` ${ctx.dataset.label} : ${fmt(ctx.raw)}`;
              },
            }
          }
        },
        scales: {
          x:  { grid: GRID_STYLE, ticks: TICK_STYLE },
          y:  {
            beginAtZero: true, grid: GRID_STYLE,
            ticks: { ...TICK_STYLE, callback: v => fmt(v) }
          },
          y2: {
            position: 'right',
            beginAtZero: true,
            max: 100,
            grid: { display: false },
            ticks: { ...TICK_STYLE, callback: v => v + '%' }
          }
        }
      }
    });
    _makeClickable(id, '_annee');
  }

  // Fallback si AnalyticsExtended non chargé
  function _caByYearLocal(projects) {
    const map = {};
    (projects || []).forEach(p => {
      if (!p) return;
      let year = null;
      try {
        year = (typeof Analytics !== 'undefined') ? Analytics.getProjectYear(p) : null;
      } catch (_) {}
      if (!year) return;
      if (!map[year]) map[year] = { etudie: 0, gagne: 0 };
      map[year].etudie += _getCAValue(p, 'ca_etudie');
      map[year].gagne  += _getCAValue(p, 'ca_gagne');
    });
    return map;
  }

  // ─────────────────────────────────────────────────────────
  // 2. Pipeline Pondéré vs Objectif par Année
  // ─────────────────────────────────────────────────────────
  /**
   * @param {Object[]} projects
   * @param {Object}   [objectifMap]  Ex: { '2023': 5000000, '2024': 6000000 }
   * @param {string}   [id='chart-pipeline-vs-objectif']
   */
  function createPipelineVsObjectifChart(projects, objectifMap, id) {
    id          = id || 'chart-pipeline-vs-objectif';
    objectifMap = objectifMap || {};

    // Protection dataset vide (input)
    if (!projects || projects.length === 0) {
      console.warn(`[ChartsNouveaux] ${id} : dataset vide (input)`);
      _showEmptyMessage(id, 'Aucun projet disponible');
      return;
    }

    const rows = (typeof AnalyticsExtended !== 'undefined' && AnalyticsExtended.pipelineVsObjectif)
      ? AnalyticsExtended.pipelineVsObjectif(projects, objectifMap)
      : _pipelineVsObjectifLocal(projects, objectifMap);

    // Protection après agrégation
    if (!rows || !rows.length) {
      console.warn(`[ChartsNouveaux] ${id} : agrégation pipeline vide`);
      _showEmptyMessage(id, 'Aucune donnée pipeline disponible');
      return;
    }

    const years     = rows.map(r => String(r.year));
    const pipeline  = rows.map(r => r.pipeline  || 0);
    const gagne     = rows.map(r => r.gagne     || 0);
    const objectifs = rows.map(r => r.objectif  || 0);

    // Protection si toutes valeurs à zéro
    if (pipeline.every(v => v === 0) && gagne.every(v => v === 0)) {
      console.warn(`[ChartsNouveaux] ${id} : pipeline et CA gagné entièrement à 0`);
      _showEmptyMessage(id, 'Aucun pipeline enregistré');
      return;
    }

    // Protection longueur cohérente
    if (years.length !== pipeline.length || years.length !== gagne.length) {
      console.warn(`[ChartsNouveaux] ${id} : incohérence labels/données`);
      _showEmptyMessage(id, 'Erreur de données');
      return;
    }

    _createChart(id, {
      type: 'bar',
      data: {
        labels: years,
        datasets: [
          {
            label: 'CA Gagné',
            data:  gagne,
            backgroundColor: alpha(T.brand, 0.75),
            borderColor:     T.brand,
            borderWidth: 2,
            borderRadius: 6,
            order: 1,
          },
          {
            label: 'Pipeline pondéré',
            data:  pipeline,
            backgroundColor: alpha(T.blue, 0.5),
            borderColor:     T.blue,
            borderWidth: 2,
            borderRadius: 6,
            order: 2,
          },
          {
            type:  'line',
            label: 'Objectif',
            data:  objectifs,
            borderColor:  T.red,
            backgroundColor: 'transparent',
            tension:      0,
            borderWidth:  2.5,
            borderDash:   [6, 4],
            pointRadius:  5,
            pointHoverRadius: 7,
            pointBackgroundColor: T.red,
            pointBorderColor: '#0f1723',
            pointBorderWidth: 2,
            order: 0,
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            display: true, position: 'top',
            labels: { color: T.pale, font: { size: 11 }, padding: 14, usePointStyle: true }
          },
          tooltip: {
            ...BASE_TOOLTIP,
            callbacks: {
              title: ctx => `Année ${ctx[0].label}`,
              label: ctx => ` ${ctx.dataset.label} : ${fmt(ctx.raw)}`,
            }
          }
        },
        scales: {
          x: { grid: GRID_STYLE, ticks: TICK_STYLE },
          y: {
            beginAtZero: true, grid: GRID_STYLE,
            ticks: { ...TICK_STYLE, callback: v => fmt(v) }
          }
        }
      }
    });
  }

  function _pipelineVsObjectifLocal(projects, objectifMap) {
    const byYear = {};
    (projects || []).forEach(p => {
      if (!p) return;
      let year = null;
      try {
        year = (typeof Analytics !== 'undefined') ? Analytics.getProjectYear(p) : null;
      } catch (_) {}
      if (!year) return;
      if (!byYear[year]) byYear[year] = { pipeline: 0, gagne: 0, objectif: (objectifMap && objectifMap[year]) || 0 };
      let winProba = 0;
      try {
        winProba = (typeof Analytics !== 'undefined') ? (Analytics.getCAWinProba(p) || 0) : _getCAValue(p, 'ca_etudie');
      } catch (_) { winProba = _getCAValue(p, 'ca_etudie'); }
      byYear[year].pipeline += winProba;
      byYear[year].gagne    += _getCAValue(p, 'ca_gagne');
    });
    return Object.entries(byYear)
      .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
      .map(([year, d]) => ({ year, ...d }));
  }

  // ─────────────────────────────────────────────────────────
  // 3. Taux de Conversion par Société
  // ─────────────────────────────────────────────────────────
  /**
   * @param {Object[]} projects
   * @param {number}   [minProjects=2]  Nb minimum de projets décidés
   * @param {string}   [id='chart-conversion-societe']
   */
  function createConversionBySocieteChart(projects, minProjects, id) {
    id          = id || 'chart-conversion-societe';
    minProjects = minProjects || 2;

    // Protection dataset vide (input)
    if (!projects || projects.length === 0) {
      console.warn(`[ChartsNouveaux] ${id} : dataset vide (input)`);
      _showEmptyMessage(id, 'Aucun projet disponible');
      return;
    }

    const data = (typeof AnalyticsExtended !== 'undefined' && AnalyticsExtended.winRateBySociete)
      ? AnalyticsExtended.winRateBySociete(projects, minProjects)
      : _winRateBySocieteLocal(projects, minProjects);

    // Protection après agrégation
    if (!data || !data.length) {
      console.warn(`[ChartsNouveaux] ${id} : aucune société avec suffisamment de projets décidés (min=${minProjects})`);
      _showEmptyMessage(id, 'Aucune société avec données suffisantes');
      return;
    }

    const top10  = data.slice(0, 10);
    const labels = top10.map(d => (d.societe || '').substring(0, 20));
    const taux   = top10.map(d => d.winRate || 0);

    // Protection longueur cohérente
    if (labels.length !== taux.length) {
      console.warn(`[ChartsNouveaux] ${id} : incohérence labels/données`);
      _showEmptyMessage(id, 'Erreur de données');
      return;
    }

    // Protection si tous les taux à zéro
    if (taux.every(v => v === 0)) {
      console.warn(`[ChartsNouveaux] ${id} : tous les taux de conversion sont à 0`);
      _showEmptyMessage(id, 'Aucun taux de conversion calculable');
      return;
    }

    _createChart(id, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Taux de conversion %',
          data:  taux,
          backgroundColor: taux.map(t =>
            t >= 60 ? alpha(T.brand, 0.8)
          : t >= 40 ? alpha(T.gold,  0.8)
          :           alpha(T.red,   0.7)
          ),
          borderColor: taux.map(t =>
            t >= 60 ? T.brand : t >= 40 ? T.gold : T.red
          ),
          borderWidth:  2,
          borderRadius: 8,
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
                const d = top10[ctx.dataIndex];
                return [
                  ` Taux : ${ctx.raw}%`,
                  ` Obtenus : ${d.obtenu} / ${(d.obtenu || 0) + (d.perdu || 0)} décidés`,
                  ` CA gagné : ${fmt(d.caGagne)}`
                ];
              }
            }
          }
        },
        scales: {
          x: {
            beginAtZero: true, max: 100, grid: GRID_STYLE,
            ticks: { ...TICK_STYLE, callback: v => v + '%' }
          },
          y: { grid: { display: false }, ticks: TICK_STYLE }
        }
      }
    });

    // Ce graphique affiche les obtenus → forcer extraFilters: { status: 'obtenu' }
    // uniquement si on veut montrer les obtenus dans le DrillDown
    _makeClickable(id, 'Client', null);
  }

  function _winRateBySocieteLocal(projects, minProjects) {
    const map = {};
    (projects || []).forEach(p => {
      if (!p) return;
      const key = ((p['Client'] || '')).trim();
      if (!key) return;
      if (!map[key]) map[key] = { obtenu: 0, perdu: 0, total: 0, caGagne: 0 };
      let s = 'autre';
      try {
        s = (typeof ProjectUtils !== 'undefined') ? (ProjectUtils.getStatus(p) || 'autre') : 'autre';
      } catch (_) {}
      map[key].total++;
      if (s === 'obtenu') { map[key].obtenu++; map[key].caGagne += _getCAValue(p, 'ca_gagne'); }
      if (s === 'perdu')  map[key].perdu++;
    });
    return Object.entries(map)
      .filter(([, d]) => (d.obtenu + d.perdu) >= minProjects)
      .map(([societe, d]) => {
        const decided = d.obtenu + d.perdu;
        // Protection division par zéro
        return { societe, winRate: decided > 0 ? Math.round((d.obtenu / decided) * 100) : 0, ...d };
      })
      .sort((a, b) => b.winRate - a.winRate);
  }

  // ─────────────────────────────────────────────────────────
  // 4. Délai Moyen de Décision (jours)
  // ─────────────────────────────────────────────────────────
  /**
   * Barres horizontales : délai moyen par société (ou par zone).
   *
   * @param {Object[]} projects
   * @param {string}   [groupField='Client']
   * @param {string}   [id='chart-delai-moyen']
   */
  function createDelaiMoyenChart(projects, groupField, id) {
    id         = id || 'chart-delai-moyen';
    groupField = groupField || 'Client';

    // Protection dataset vide (input)
    if (!projects || projects.length === 0) {
      console.warn(`[ChartsNouveaux] ${id} : dataset vide (input)`);
      _showEmptyMessage(id, 'Aucun projet disponible');
      return;
    }

    const raw = (typeof AnalyticsExtended !== 'undefined' && AnalyticsExtended.avgDecisionDelay)
      ? AnalyticsExtended.avgDecisionDelay(projects, groupField)
      : _avgDecisionDelayLocal(projects, groupField);

    const entries = Object.entries(raw || {})
      .sort((a, b) => a[1] - b[1])
      .slice(0, 12);

    // Protection après agrégation
    if (!entries.length) {
      console.warn(`[ChartsNouveaux] ${id} : aucun délai calculable (dates manquantes ou statuts non décidés)`);
      _showEmptyMessage(id, 'Aucune donnée de délai disponible');
      return;
    }

    const labels = entries.map(([k]) => (k || '').substring(0, 22));
    const values = entries.map(([, v]) => v || 0);

    // Protection longueur cohérente
    if (labels.length !== values.length) {
      console.warn(`[ChartsNouveaux] ${id} : incohérence labels/données`);
      _showEmptyMessage(id, 'Erreur de données');
      return;
    }

    // Protection si toutes valeurs à zéro
    if (values.every(v => v === 0)) {
      console.warn(`[ChartsNouveaux] ${id} : tous les délais sont à 0`);
      _showEmptyMessage(id, 'Délais non calculables');
      return;
    }

    _createChart(id, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Délai moyen (jours)',
          data:  values,
          backgroundColor: values.map(v =>
            v <= 60  ? alpha(T.brand, 0.75)
          : v <= 120 ? alpha(T.gold,  0.75)
          :            alpha(T.red,   0.70)
          ),
          borderColor: values.map(v =>
            v <= 60 ? T.brand : v <= 120 ? T.gold : T.red
          ),
          borderWidth:  2,
          borderRadius: 8,
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
                const j = ctx.raw;
                const cat = j <= 60 ? '✅ Rapide' : j <= 120 ? '⚠️ Moyen' : '❌ Long';
                return ` ${j} jours — ${cat}`;
              }
            }
          }
        },
        scales: {
          x: {
            beginAtZero: true, grid: GRID_STYLE,
            ticks: { ...TICK_STYLE, callback: v => v + 'j' }
          },
          y: { grid: { display: false }, ticks: TICK_STYLE }
        }
      }
    });
    // BUG FIX #4 : labels = groupField (Client ou Zone), pas _annee
    _makeClickable(id, groupField);
  }

  function _avgDecisionDelayLocal(projects, groupField) {
    const map = {};
    (projects || []).forEach(p => {
      if (!p) return;
      let s = 'autre';
      try {
        s = (typeof ProjectUtils !== 'undefined') ? (ProjectUtils.getStatus(p) || 'autre') : 'autre';
      } catch (_) {}
      if (s !== 'obtenu' && s !== 'perdu') return;

      let dateRec, dateDec;
      try {
        const parse = (typeof ProjectUtils !== 'undefined' && ProjectUtils.parseDate)
          ? ProjectUtils.parseDate.bind(ProjectUtils)
          : (d => d ? new Date(d) : null);
        dateRec = parse(p['Date réception']);
        dateDec = parse(p['Décidé le '] || p['Décidé le']);
      } catch (_) { return; }

      if (!dateRec || !dateDec) return;
      if (isNaN(dateRec.getTime()) || isNaN(dateDec.getTime())) return;

      const days = Math.round((dateDec - dateRec) / 86400000);
      if (days < 0 || days > 3650) return;

      const key = ((p[groupField] || 'Non spécifié')).trim();
      if (!map[key]) map[key] = { sum: 0, count: 0 };
      map[key].sum   += days;
      map[key].count++;
    });
    return Object.fromEntries(
      Object.entries(map)
        .filter(([, d]) => d.count >= 1)
        // Protection division par zéro
        .map(([k, d]) => [k, d.count > 0 ? Math.round(d.sum / d.count) : 0])
        .sort((a, b) => a[1] - b[1])
    );
  }

  // ─────────────────────────────────────────────────────────
  // 5. Heatmap Zone × Statut
  // ─────────────────────────────────────────────────────────
  /**
   * Matrice de points colorés : Zones (Y) × Statuts (X).
   * Encodé en bulles (bubble chart) pour Chart.js 4.x.
   *
   * @param {Object[]} projects
   * @param {string}   [id='chart-heatmap-zone-statut']
   */
  function createHeatmapZoneStatut(projects, id) {
    id = id || 'chart-heatmap-zone-statut';

    // Protection dataset vide (input)
    if (!projects || projects.length === 0) {
      console.warn(`[ChartsNouveaux] ${id} : dataset vide (input)`);
      _showEmptyMessage(id, 'Aucun projet disponible');
      return;
    }

    const hmData = (typeof AnalyticsExtended !== 'undefined' && AnalyticsExtended.heatmapZoneStatut)
      ? AnalyticsExtended.heatmapZoneStatut(projects)
      : _heatmapLocal(projects);

    const { zones, statuts, data: matrix } = hmData || { zones: [], statuts: [], data: [] };

    // Protection après agrégation
    if (!zones || !zones.length) {
      console.warn(`[ChartsNouveaux] ${id} : aucune zone géographique détectée`);
      _showEmptyMessage(id, 'Aucune zone géographique disponible');
      return;
    }

    // Convertir la matrice en datasets bubble
    const STATUS_COLORS = {
      obtenu: T.brand,
      perdu:  T.red,
      offre:  T.blue,
    };

    const datasets = (statuts || []).map((stat, si) => ({
      label: stat.charAt(0).toUpperCase() + stat.slice(1),
      data: zones.map((_, zi) => {
        const v = (matrix[zi] && matrix[zi][si]) || 0;
        return { x: si, y: zi, r: v > 0 ? Math.min(4 + Math.sqrt(v) * 5, 30) : 0, v };
      }).filter(d => d.r > 0),
      backgroundColor: alpha(STATUS_COLORS[stat] || T.gold, 0.75),
      borderColor:     STATUS_COLORS[stat] || T.gold,
      borderWidth: 1.5,
    }));

    // Protection si aucune bulle à afficher
    if (datasets.every(ds => ds.data.length === 0)) {
      console.warn(`[ChartsNouveaux] ${id} : heatmap entièrement vide (aucun projet obtenu/perdu/offre)`);
      _showEmptyMessage(id, 'Aucune donnée heatmap disponible');
      return;
    }

    _createChart(id, {
      type: 'bubble',
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            display: true, position: 'top',
            labels: { color: T.pale, font: { size: 11 }, padding: 12, usePointStyle: true }
          },
          tooltip: {
            ...BASE_TOOLTIP,
            callbacks: {
              title: ctx => {
                const pt = ctx[0];
                const zone   = zones[pt.raw.y]   || '?';
                const statut = statuts[pt.raw.x]  || '?';
                return `${zone} × ${statut}`;
              },
              label: ctx => ` ${ctx.raw.v} projet${ctx.raw.v > 1 ? 's' : ''}`
            }
          }
        },
        scales: {
          x: {
            type: 'linear',
            min: -0.5, max: statuts.length - 0.5,
            grid: GRID_STYLE,
            ticks: {
              ...TICK_STYLE,
              stepSize: 1,
              callback: v => (statuts[v] || ''),
            }
          },
          y: {
            type: 'linear',
            min: -0.5, max: zones.length - 0.5,
            grid: GRID_STYLE,
            ticks: {
              ...TICK_STYLE,
              stepSize: 1,
              callback: v => (zones[Math.round(v)] || ''),
            }
          }
        }
      }
    });
  }

  function _heatmapLocal(projects) {
    const zones   = new Set();
    const statuts = ['obtenu', 'perdu', 'offre'];
    const map     = {};
    (projects || []).forEach(p => {
      if (!p) return;
      const zone = ((p['Zone Géographique'] || 'Non défini')).trim();
      let stat = 'autre';
      try {
        stat = (typeof ProjectUtils !== 'undefined') ? (ProjectUtils.getStatus(p) || 'autre') : 'autre';
      } catch (_) {}
      if (!statuts.includes(stat)) return;
      zones.add(zone);
      const key = zone + '||' + stat;
      map[key] = (map[key] || 0) + 1;
    });
    const zonesArr = Array.from(zones).sort();
    return {
      zones:   zonesArr,
      statuts,
      data:    zonesArr.map(z => statuts.map(s => map[z + '||' + s] || 0))
    };
  }


  // ─────────────────────────────────────────────────────────
  // Fallbacks locaux Module 9 (AnalyticsExtended absent)
  // ─────────────────────────────────────────────────────────
  function _cumulatifMensuelLocal(projects, activeYear) {
    var g=new Array(12).fill(0), e=new Array(12).fill(0), yr=String(activeYear);
    (projects||[]).forEach(function(p) {
      if (!p||String(p._annee)!==yr) return;
      var d=(typeof ProjectUtils!=='undefined'&&ProjectUtils.parseDate)?ProjectUtils.parseDate(p['Date réception']):new Date(p['Date réception']);
      if(!d||isNaN(d.getTime())) return;
      var m=d.getMonth(), bud=_getCAValue(p,'ca_etudie');
      e[m]+=bud; if(_getCAValue(p,'ca_gagne')>0) g[m]+=bud;
    });
    for(var i=1;i<12;i++){g[i]+=g[i-1];e[i]+=e[i-1];}
    return {gagne:g,etudie:e};
  }

  function _pipelineMensuelLocal(projects) {
    var byMonth=new Array(12).fill(0), cnt=new Array(12).fill(0);
    (projects||[]).forEach(function(p) {
      if (!p) return;
      var st='autre'; try{st=(typeof ProjectUtils!=='undefined')?ProjectUtils.getStatus(p)||'autre':'autre';}catch(_){}
      if (st!=='offre') return;
      var d=(typeof ProjectUtils!=='undefined'&&ProjectUtils.parseDate)?ProjectUtils.parseDate(p['Date réception']):new Date(p['Date réception']);
      if(!d||isNaN(d.getTime())) return;
      var m=d.getMonth(), bud=_getCAValue(p,'ca_etudie');
      var raw=p['Win proba'], prob=0.3;
      if (raw!=null&&raw!==''){var pn=parseFloat(String(raw).replace('%','').trim());if(!isNaN(pn))prob=pn>1?pn/100:pn;}
      byMonth[m]+=Math.round(bud*prob); cnt[m]++;
    });
    return {byMonth:byMonth,countByMonth:cnt};
  }

  function _budgetDistributionLocal(projects) {
    var T=[{l:'< 50k€',mx:50e3},{l:'50–100k€',mx:100e3},{l:'100–250k€',mx:250e3},
           {l:'250–500k€',mx:500e3},{l:'500k–1M€',mx:1e6},{l:'1M–5M€',mx:5e6},{l:'> 5M€',mx:Infinity}];
    var counts=new Array(T.length).fill(0), ca=new Array(T.length).fill(0);
    (projects||[]).forEach(function(p) {
      if (!p) return;
      var bud=_getCAValue(p,'ca_etudie'); if(!bud||bud<=0) return;
      for(var i=0;i<T.length;i++){if(bud>(i?T[i-1].mx:0)&&bud<=T[i].mx){counts[i]++;ca[i]+=bud;break;}}
    });
    return {labels:T.map(function(t){return t.l;}),counts:counts,caByTranche:ca};
  }

  function _pertesParClientLocal(projects, topN) {
    var map={};
    (projects||[]).forEach(function(p) {
      if (!p) return;
      var client=(p['Client']||'Non spécifié').trim();
      if (!map[client]) map[client]={perdu:0,obtenu:0,caPerdu:0};
      var st='autre'; try{st=(typeof ProjectUtils!=='undefined')?ProjectUtils.getStatus(p)||'autre':'autre';}catch(_){}
      if (st==='perdu'){map[client].perdu++;map[client].caPerdu+=_getCAValue(p,'ca_etudie');}
      else if(st==='obtenu'){map[client].obtenu++;}
    });
    return Object.entries(map)
      .filter(function(e){return e[1].perdu>0;})
      .map(function(e){
        var d=e[1], dec=d.perdu+d.obtenu;
        return {client:e[0],perdu:d.perdu,caPerdu:d.caPerdu,tauxPerte:dec>0?Math.round(d.perdu/dec*100):100};
      })
      .sort(function(a,b){return b.caPerdu-a.caPerdu;})
      .slice(0,topN||12);
  }

  // ─────────────────────────────────────────────────────────
  // API publique
  // ─────────────────────────────────────────────────────────
  const ChartsNouveaux = {
    charts: _charts,

    createCAGagneVsEtudieChart,
    createPipelineVsObjectifChart,
    createConversionBySocieteChart,
    createDelaiMoyenChart,
    createHeatmapZoneStatut,

    /* ═════════════════════════════════════════════════════════════
       MODULE 9 — 4 NOUVEAUX GRAPHIQUES
    ═════════════════════════════════════════════════════════════ */

    /**
     * 6. CA Gagné Cumulé — Année en cours
     * Courbe cumulée de CA gagné mois par mois sur l'année active.
     * Compatible Analytics.getCAValue('ca_gagne').
     */
    createCACumuleAnneeChart(projects, id) {
      id = id || 'chart-ca-cumule';

      // Protection dataset vide (input)
      if (!projects || projects.length === 0) {
        console.warn(`[ChartsNouveaux] ${id} : dataset vide (input)`);
        _showEmptyMessage(id, 'Aucun projet disponible');
        return;
      }

      // Utilise la dernière année réellement présente dans les données
      // (indépendant de l'horloge système — corrige le bug 2026+)
      const currentYear = _getLastAvailableYear(projects);

      if (!currentYear) {
        console.warn(`[ChartsNouveaux] ${id} : aucune année disponible dans les données`);
        _showEmptyMessage(id, 'Aucune année disponible');
        return;
      }

      const activeYear = String(currentYear);

      const MONTHS = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];

      // ── CORRECTION 4 : délégation vers AnalyticsExtended ──────────
      const cumData = (typeof AnalyticsExtended !== 'undefined' && AnalyticsExtended.cumulatifMensuel)
        ? AnalyticsExtended.cumulatifMensuel(projects, activeYear)
        : _cumulatifMensuelLocal(projects, activeYear);

      const cumule       = (cumData && cumData.gagne)  ? cumData.gagne  : new Array(12).fill(0);
      const cumuleEtudie = (cumData && cumData.etudie) ? cumData.etudie : new Array(12).fill(0);

      // Protection : cumData.gagne entièrement à zéro
      if (cumule.every(v => v === 0) && cumuleEtudie.every(v => v === 0)) {
        console.warn(`[ChartsNouveaux] ${id} : données cumulées entièrement à 0 pour l'année ${activeYear}`);
        _showEmptyMessage(id, `Aucun CA enregistré pour ${activeYear}`);
        return;
      }

      _createChart(id, {
        type: 'line',
        data: {
          labels: MONTHS,
          datasets: [
            {
              label: `CA Étudié cumulé ${activeYear}`,
              data: cumuleEtudie,
              borderColor: alpha(T.blue, 0.7),
              backgroundColor: alpha(T.blue, 0.08),
              borderWidth: 2,
              borderDash: [5, 4],
              fill: true,
              tension: 0.3,
              pointRadius: 3,
            },
            {
              label: `CA Gagné cumulé ${activeYear}`,
              data: cumule,
              borderColor: T.brand,
              backgroundColor: alpha(T.brand, 0.12),
              borderWidth: 3,
              fill: true,
              tension: 0.3,
              pointRadius: 5,
              pointBackgroundColor: T.brand,
              pointBorderColor: '#0f1723',
              pointBorderWidth: 2,
            },
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: T.pale, font: { size: 11 } } },
            tooltip: {
              ...BASE_TOOLTIP,
              callbacks: {
                label: ctx => ` ${ctx.dataset.label} : ${fmt(ctx.parsed.y)}`
              }
            }
          },
          scales: {
            x: { grid: GRID_STYLE, ticks: TICK_STYLE },
            y: {
              grid: GRID_STYLE,
              ticks: { ...TICK_STYLE, callback: v => fmt(v) },
              beginAtZero: true
            }
          }
        }
      });

      // ChartConfigManager
      if (typeof ChartConfigManager !== 'undefined' && ChartConfigManager.setup) {
        ChartConfigManager.setup(id, {
          valeur: 'ca_gagne',
          statut: 'obtenu',
          showConfigButton: true,
          onApply: (cfg) => {
            const data = (typeof DataFilterEngine !== 'undefined' && DataFilterEngine.getFilteredData)
              ? DataFilterEngine.getFilteredData()
              : (window.DATA || []);
            this.createCACumuleAnneeChart(data, id);
          }
        });
      }
    },

    /**
     * 7. Pipeline Mensuel — CA pondéré par probabilité de win
     * Histogramme mensuel du CA pipeline (offres × win proba).
     */
    createPipelineMensuelChart(projects, id) {
      id = id || 'chart-pipeline-mensuel';

      // Protection dataset vide (input)
      if (!projects || projects.length === 0) {
        console.warn(`[ChartsNouveaux] ${id} : dataset vide (input)`);
        _showEmptyMessage(id, 'Aucun projet disponible');
        return;
      }

      const MONTHS = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];

      // ── CORRECTION 4 : délégation vers AnalyticsExtended ──────────
      const pipeData = (typeof AnalyticsExtended !== 'undefined' && AnalyticsExtended.pipelineMensuel)
        ? AnalyticsExtended.pipelineMensuel(projects)
        : _pipelineMensuelLocal(projects);

      const byMonth      = (pipeData && pipeData.byMonth)      ? pipeData.byMonth      : new Array(12).fill(0);
      const byMonthCount = (pipeData && pipeData.countByMonth) ? pipeData.countByMonth : new Array(12).fill(0);

      // Protection si toutes valeurs à zéro
      if (byMonth.every(v => v === 0) && byMonthCount.every(v => v === 0)) {
        console.warn(`[ChartsNouveaux] ${id} : pipeline mensuel entièrement à 0`);
        _showEmptyMessage(id, 'Aucun pipeline mensuel disponible');
        return;
      }

      _createChart(id, {
        type: 'bar',
        data: {
          labels: MONTHS,
          datasets: [
            {
              label: 'Pipeline pondéré (offres)',
              data: byMonth,
              backgroundColor: MONTHS.map((_, i) => (byMonth[i] || 0) > 0 ? alpha(T.violet, 0.7) : alpha(T.pale, 0.15)),
              borderColor:     T.violet,
              borderWidth: 2,
              borderRadius: 5,
              yAxisID: 'y',
            },
            {
              type: 'line',
              label: 'Nb offres',
              data: byMonthCount,
              borderColor: T.gold,
              backgroundColor: 'transparent',
              tension: 0.3,
              borderWidth: 2,
              pointRadius: 4,
              pointBackgroundColor: T.gold,
              yAxisID: 'y2',
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: T.pale, font: { size: 11 } } },
            tooltip: {
              ...BASE_TOOLTIP,
              callbacks: {
                label: ctx => ctx.dataset.yAxisID === 'y2'
                  ? ` ${ctx.dataset.label} : ${ctx.parsed.y}`
                  : ` ${ctx.dataset.label} : ${fmt(ctx.parsed.y)}`
              }
            }
          },
          scales: {
            x: { grid: GRID_STYLE, ticks: TICK_STYLE },
            y:  { grid: GRID_STYLE, ticks: { ...TICK_STYLE, callback: v => fmt(v) }, beginAtZero: true },
            y2: { position: 'right', grid: { display: false }, ticks: TICK_STYLE, beginAtZero: true }
          }
        }
      });
    },

    /**
     * 8. Distribution des Budgets — Histogramme
     * Répartit les projets en tranches de budget.
     */
    createBudgetDistributionChart(projects, id) {
      id = id || 'chart-budget-distribution';

      // Protection dataset vide (input)
      if (!projects || projects.length === 0) {
        console.warn(`[ChartsNouveaux] ${id} : dataset vide (input)`);
        _showEmptyMessage(id, 'Aucun projet disponible');
        return;
      }

      // ── CORRECTION 4 : délégation vers AnalyticsExtended ──────────
      const bdData = (typeof AnalyticsExtended !== 'undefined' && AnalyticsExtended.budgetDistribution)
        ? AnalyticsExtended.budgetDistribution(projects)
        : _budgetDistributionLocal(projects);

      const budgetLabels = (bdData && bdData.labels)      ? bdData.labels      : [];
      const counts       = (bdData && bdData.counts)      ? bdData.counts      : [];
      const caByTranche  = (bdData && bdData.caByTranche) ? bdData.caByTranche : [];

      // Protection après agrégation
      if (!budgetLabels.length || counts.every(v => v === 0)) {
        console.warn(`[ChartsNouveaux] ${id} : distribution budget vide ou tous compteurs à 0`);
        _showEmptyMessage(id, 'Aucune distribution budget disponible');
        return;
      }

      // Protection longueur cohérente
      if (budgetLabels.length !== counts.length) {
        console.warn(`[ChartsNouveaux] ${id} : incohérence labels/données`);
        _showEmptyMessage(id, 'Erreur de données');
        return;
      }

      const colors = [
        alpha(T.blue, 0.7), alpha(T.brand, 0.7), alpha(T.gold, 0.7),
        alpha(T.violet, 0.7), alpha(T.green, 0.7), alpha(T.red, 0.6), alpha(T.pale, 0.5)
      ];

      _createChart(id, {
        type: 'bar',
        data: {
          labels: budgetLabels,
          datasets: [
            {
              label: 'Nb projets',
              data: counts,
              backgroundColor: colors,
              borderColor: colors.map(c => c.replace(/[\d.]+\)$/, '1)')),
              borderWidth: 2,
              borderRadius: 6,
              yAxisID: 'y',
            },
            {
              type: 'line',
              label: 'CA cumulé (tranche)',
              data: caByTranche,
              borderColor: T.snow,
              backgroundColor: 'transparent',
              tension: 0.3,
              borderWidth: 2,
              pointRadius: 4,
              pointBackgroundColor: T.snow,
              yAxisID: 'y2',
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: T.pale, font: { size: 11 } } },
            tooltip: {
              ...BASE_TOOLTIP,
              callbacks: {
                label: ctx => ctx.dataset.yAxisID === 'y2'
                  ? ` CA tranche : ${fmt(ctx.parsed.y)}`
                  : ` Projets : ${ctx.parsed.y}`
              }
            }
          },
          scales: {
            x: { grid: GRID_STYLE, ticks: { ...TICK_STYLE, maxRotation: 30 } },
            y:  { grid: GRID_STYLE, ticks: TICK_STYLE, beginAtZero: true, title: { display: true, text: 'Nb projets', color: T.pale } },
            y2: { position: 'right', grid: { display: false }, ticks: { ...TICK_STYLE, callback: v => fmt(v) }, beginAtZero: true }
          }
        }
      });

      _makeClickable(id, 'Statut');
    },

    /**
     * 9. Analyse Pertes par Client — Poids + Taux de perte
     * Graphique combiné barres (nb perdus) + ligne (taux de perte).
     * Compatible Analytics.getCAValue().
     */
    createAnalysePertesClientChart(projects, id) {
      id = id || 'chart-pertes-client';

      // Protection dataset vide (input)
      if (!projects || projects.length === 0) {
        console.warn(`[ChartsNouveaux] ${id} : dataset vide (input)`);
        _showEmptyMessage(id, 'Aucun projet disponible');
        return;
      }

      // ── CORRECTION 4 : délégation vers AnalyticsExtended ──────────
      const pertesData = (typeof AnalyticsExtended !== 'undefined' && AnalyticsExtended.pertesParClient)
        ? AnalyticsExtended.pertesParClient(projects, 12)
        : _pertesParClientLocal(projects, 12);

      // Protection après agrégation
      if (!pertesData || !pertesData.length) {
        console.warn(`[ChartsNouveaux] ${id} : aucune perte par client détectée`);
        _showEmptyMessage(id, 'Aucune perte client à afficher');
        return;
      }

      const labels   = pertesData.map(d => (d.client || '').length > 18 ? (d.client || '').slice(0, 16) + '…' : (d.client || ''));
      const perdus   = pertesData.map(d => d.perdu    || 0);
      const taux     = pertesData.map(d => d.tauxPerte || 0);
      const caPerdus = pertesData.map(d => d.caPerdu  || 0);

      // Protection longueur cohérente
      if (labels.length !== perdus.length) {
        console.warn(`[ChartsNouveaux] ${id} : incohérence labels/données`);
        _showEmptyMessage(id, 'Erreur de données');
        return;
      }

      // Protection si tous à zéro
      if (perdus.every(v => v === 0)) {
        console.warn(`[ChartsNouveaux] ${id} : aucune perte enregistrée`);
        _showEmptyMessage(id, 'Aucune perte client enregistrée');
        return;
      }

      _createChart(id, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: 'Projets perdus',
              data: perdus,
              backgroundColor: alpha(T.red, 0.65),
              borderColor: T.red,
              borderWidth: 2,
              borderRadius: 5,
              yAxisID: 'y',
            },
            {
              type: 'line',
              label: 'Taux de perte (%)',
              data: taux,
              borderColor: T.gold,
              backgroundColor: 'transparent',
              tension: 0.25,
              borderWidth: 2,
              borderDash: [4, 3],
              pointRadius: 5,
              pointBackgroundColor: T.gold,
              pointBorderColor: '#0f1723',
              yAxisID: 'y2',
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: T.pale, font: { size: 11 } } },
            tooltip: {
              ...BASE_TOOLTIP,
              callbacks: {
                label: ctx => {
                  if (ctx.datasetIndex === 0) {
                    const ca = caPerdus[ctx.dataIndex];
                    return [` Perdus : ${ctx.parsed.y}`, ` CA perdu : ${fmt(ca)}`];
                  }
                  return ` Taux perte : ${ctx.parsed.y}%`;
                }
              }
            }
          },
          scales: {
            x: { grid: GRID_STYLE, ticks: { ...TICK_STYLE, maxRotation: 35 } },
            y:  { grid: GRID_STYLE, ticks: TICK_STYLE, beginAtZero: true, title: { display: true, text: 'Nb perdus', color: T.pale } },
            y2: { position: 'right', grid: { display: false }, ticks: { ...TICK_STYLE, callback: v => v + '%' }, beginAtZero: true, max: 100 }
          }
        }
      });

      _makeClickable(id, 'Client');

      if (typeof ChartConfigManager !== 'undefined' && ChartConfigManager.setup) {
        ChartConfigManager.setup(id, {
          axeX: 'Client',
          valeur: 'ca_etudie',
          statut: 'perdu',
          showConfigButton: true,
          onApply: (cfg) => {
            const data = (typeof DataFilterEngine !== 'undefined' && DataFilterEngine.getFilteredData)
              ? DataFilterEngine.getFilteredData() : (window.DATA || []);
            this.createAnalysePertesClientChart(data, id);
          }
        });
      }
    },

    /**
     * renderAll — Re-rendre tous les nouveaux graphiques avec les données courantes.
     * Appelé par setActiveDateField() et les abonnements aux filtres.
     */
    renderAll(projects) {
      if (!projects) {
        projects = (typeof DataFilterEngine !== 'undefined' && DataFilterEngine.getFilteredData)
          ? DataFilterEngine.getFilteredData()
          : ((typeof AE !== 'undefined' && AE.getFiltered) ? AE.getFiltered() : (window.DATA || []));
      }
      const self = this;
      [
        'createCAGagneVsEtudieChart',
        'createConversionBySocieteChart',
        'createDelaiMoyenChart',
        'createCACumuleAnneeChart',
        'createPipelineMensuelChart',
        'createBudgetDistributionChart',
        'createAnalysePertesClientChart',
      ].forEach(fn => {
        if (typeof self[fn] === 'function') {
          try { self[fn](projects); }
          catch (e) { console.warn('[ChartsNouveaux] renderAll ' + fn + ':', e); }
        }
      });
    },

    /**
     * Initialiser tous les nouveaux graphiques d'un coup.
     * @param {Object[]} projects
     * @param {Object}   [opts]
     * @param {Object}   [opts.objectifMap]  Ex: { '2024': 5000000 }
     * @param {string}   [opts.delaiField]   Champ de regroupement délai ('Client' | 'Zone Géographique')
     */
    initAll(projects, opts) {
      opts = opts || {};
      try { this.createCAGagneVsEtudieChart(projects); }
      catch (e) { console.error('[ChartsNouveaux] createCAGagneVsEtudieChart:', e); }

      try { this.createPipelineVsObjectifChart(projects, opts.objectifMap || {}); }
      catch (e) { console.error('[ChartsNouveaux] createPipelineVsObjectifChart:', e); }

      try { this.createConversionBySocieteChart(projects); }
      catch (e) { console.error('[ChartsNouveaux] createConversionBySocieteChart:', e); }

      try { this.createDelaiMoyenChart(projects, opts.delaiField || 'Client'); }
      catch (e) { console.error('[ChartsNouveaux] createDelaiMoyenChart:', e); }

      try { this.createHeatmapZoneStatut(projects); }
      catch (e) { console.error('[ChartsNouveaux] createHeatmapZoneStatut:', e); }

      // ── MODULE 9 : 4 nouveaux graphiques ──
      try { this.createCACumuleAnneeChart(projects); }
      catch (e) { console.error('[ChartsNouveaux] createCACumuleAnneeChart:', e); }

      try { this.createPipelineMensuelChart(projects); }
      catch (e) { console.error('[ChartsNouveaux] createPipelineMensuelChart:', e); }

      try { this.createBudgetDistributionChart(projects); }
      catch (e) { console.error('[ChartsNouveaux] createBudgetDistributionChart:', e); }

      try { this.createAnalysePertesClientChart(projects); }
      catch (e) { console.error('[ChartsNouveaux] createAnalysePertesClientChart:', e); }

      if (_cnInitialized) {
        console.warn('[ChartsNouveaux] ⚠️ Double-init détectée — re-render sur instances existantes');
      }
      _cnInitialized = true;
      console.log('[ChartsNouveaux] ✅ Tous les graphiques initialisés (v2.0 — 9 total)');
    }
  };

  // Expose interne _charts pour DashboardPDF._resolveChartInstance()
  ChartsNouveaux._getChart = function(id) { return _charts[id] || null; };

  global.ChartsNouveaux = ChartsNouveaux;

  console.log('%c📈 ChartsNouveaux v2.0 chargé — 9 graphiques + renderAll + ChartConfigManager', 'color:#00d4aa;font-weight:700');

})(typeof window !== 'undefined' ? window : global);
