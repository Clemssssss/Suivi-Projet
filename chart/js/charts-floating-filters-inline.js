(function () {
  'use strict';

  /* ══════════════════════════════════════════════
     1. FLOATING FILTER BAR
  ══════════════════════════════════════════════ */
  function renderFloatingFilters() {
    var bar = document.getElementById('floating-filter-bar');
    var summary = document.getElementById('active-filters-summary');
    if (!bar || !summary) return;

    var filters = (typeof AE !== 'undefined') ? AE.getFilters() : {};
    var entries = Object.entries(filters);

    if (entries.length === 0) {
      bar.classList.remove('visible');
      document.body.classList.remove('dashboard-filtered');
      return;
    }

    bar.classList.add('visible');
    document.body.classList.add('dashboard-filtered');

    var FL = { societe: 'Client', zone_geo: 'Zone', status: 'Statut',
               type_offre: 'Type', partenaire_gc: 'Partenaire',
               annee: 'Année commerciale', annee_facturation: 'Année facturation' };

    summary.innerHTML = entries.map(function(e) {
      return '<span class="filter-badge" data-fk="' + e[0] + '">'
        + (FL[e[0]] || e[0]) + ': ' + e[1]
        + ' <span class="close-x">✕</span></span>';
    }).join('');

    summary.querySelectorAll('.filter-badge').forEach(function(badge) {
      badge.addEventListener('click', function() {
        AE.removeFilter(this.dataset.fk);
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function() {
    var clearBtn = document.getElementById('clear-all-floating');
    if (clearBtn) clearBtn.addEventListener('click', function() {
      if (typeof AE !== 'undefined') AE.clearAll();
    });
  });

  /* ══════════════════════════════════════════════
     2. CHART VISIBILITY MANAGER
  ══════════════════════════════════════════════ */
  var ChartVisibility = {};
  try {
    var saved = localStorage.getItem('chartVisibility');
    if (saved) {
      var _parsed = JSON.parse(saved);
      // Nettoyer les états "false" (cartes masquées explicitement)
      // Les graphiques chart-perdu / chart-obtenu ne doivent PAS rester masqués
      // si l'utilisateur n'a pas cliqué 👁 dans cette session
      var _ALWAYS_VISIBLE = ['chart-perdu','chart-obtenu','chart-obtenu-zone'];
      _ALWAYS_VISIBLE.forEach(function(k){ if (_parsed[k] === false) delete _parsed[k]; });
      ChartVisibility = _parsed;
    }
  } catch(e) {}

  function toggleChartVisibility(chartKey) {
    var card = document.querySelector('[data-chart-id="' + chartKey + '"]');
    if (!card) return;
    var isHidden = card.classList.contains('hidden-chart') || card.classList.contains('hidden');

    // Nettoyer les deux classes anciennes
    card.classList.remove('hidden-chart', 'hidden');

    if (isHidden) {
      // ── Ré-afficher ───────────────────────────────────────────────
      ChartVisibility[chartKey] = true;

      // Synchroniser le bouton 👁
      var toggleBtn = card.querySelector('.chart-toggle-btn');
      if (toggleBtn) toggleBtn.classList.add('active');

      // ── CORRECTIF MODULE 7 : Restauration sans reload ─────────────
      // Le canvas peut avoir été vidé ou rendu avec height=0.
      // 1. Rétablir la visibilité CSS
      card.style.display = '';
      card.style.visibility = '';
      card.style.opacity = '';

      // 2. Forcer un redimensionnement du canvas
      var canvas = card.querySelector('canvas');
      if (canvas) {
        canvas.style.display = '';
        canvas.style.visibility = '';
      }

      // 3. Re-render via update() global (qui recrée les charts si besoin)
      //    Utiliser requestAnimationFrame pour laisser le reflow se faire
      requestAnimationFrame(function() {
        // Tenter de resize l'instance Chart.js existante
        var chartId = chartKey;
        var instance = null;

        // Chercher l'instance dans ChartsEnrichis
        if (typeof ChartsEnrichis !== 'undefined' && ChartsEnrichis.charts) {
          instance = ChartsEnrichis.charts[chartId];
        }
        // Fallback : Chart.js registry interne
        if (!instance && typeof Chart !== 'undefined' && Chart.instances) {
          Object.values(Chart.instances).forEach(function(ch) {
            if (ch.canvas && ch.canvas.id === chartId) instance = ch;
          });
        }

        if (instance) {
          try {
            instance.resize();
            instance.update('none');
            console.log('[ChartVisibility] Instance resize() + update() pour "' + chartId + '"');
          } catch (e) {
            // Si l'instance est corrompue, déclencher un re-render complet
            console.warn('[ChartVisibility] resize() échoué, re-render complet pour "' + chartId + '"');
            if (typeof update === 'function') update();
          }
        } else {
          // Aucune instance trouvée → re-render global
          if (typeof update === 'function') update();
        }
      });

    } else {
      // ── Masquer ───────────────────────────────────────────────────
      card.classList.add('hidden-chart');
      ChartVisibility[chartKey] = false;

      var toggleBtn2 = card.querySelector('.chart-toggle-btn');
      if (toggleBtn2) toggleBtn2.classList.remove('active');
    }

    try { localStorage.setItem('chartVisibility', JSON.stringify(ChartVisibility)); } catch(e) {}
    updateHiddenPanel();
    // Note: re-render est géré dans requestAnimationFrame ci-dessus pour la restauration
  }

  function updateHiddenPanel() {
    var panel = document.getElementById('hidden-charts-panel');
    var list = document.getElementById('hidden-charts-list');
    if (!panel || !list) return;

    var hidden = [];
    document.querySelectorAll('.chart-card[data-chart-id]').forEach(function(card) {
      if (card.classList.contains('hidden-chart') || card.classList.contains('hidden')) {
        var title = card.querySelector('.chart-title');
        hidden.push({
          id: card.dataset.chartId,
          name: title ? title.textContent.trim() : card.dataset.chartId
        });
      }
    });

    if (hidden.length === 0) {
      panel.classList.remove('visible');
      return;
    }

    panel.classList.add('visible');
    list.innerHTML = hidden.map(function(h) {
      return '<button class="restore-btn" data-restore="' + h.id + '">' + h.name + ' ↩</button>';
    }).join('');

    list.querySelectorAll('[data-restore]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        toggleChartVisibility(this.dataset.restore);
      });
    });
  }

  // Restore saved visibility + sync toggle buttons
  document.addEventListener('DOMContentLoaded', function() {
    Object.keys(ChartVisibility).forEach(function(key) {
      if (ChartVisibility[key] === false) {
        var card = document.querySelector('[data-chart-id="' + key + '"]');
        if (card) {
          card.classList.add('hidden-chart');
          card.classList.remove('hidden');
          var btn = card.querySelector('.chart-toggle-btn');
          if (btn) btn.classList.remove('active');
        }
      }
    });
    updateHiddenPanel();

    var restoreAll = document.getElementById('restore-all-charts');
    if (restoreAll) restoreAll.addEventListener('click', function() {
      document.querySelectorAll('.chart-card.hidden-chart, .chart-card.hidden').forEach(function(c) {
        c.classList.remove('hidden-chart', 'hidden');
        var btn = c.querySelector('.chart-toggle-btn');
        if (btn) btn.classList.add('active');
      });
      ChartVisibility = {};
      try { localStorage.setItem('chartVisibility', JSON.stringify(ChartVisibility)); } catch(e) {}
      updateHiddenPanel();
      if (typeof update === 'function') update();
    });
  });

  window._chartVis = { toggle: toggleChartVisibility, update: updateHiddenPanel };

  /* ══════════════════════════════════════════════
     3. v5 WIDGETS RENDER
  ══════════════════════════════════════════════ */
  function renderV5Widgets(data) {
    if (typeof Analytics === 'undefined' || typeof ChartsEnrichis === 'undefined') return;

    // Determine active year
    var yearFilter = document.getElementById('year-filter');
    var currentYear = (yearFilter && yearFilter.value) ? parseInt(yearFilter.value, 10) : new Date().getFullYear();

    var objConfig = {};
    if (typeof window._v42 !== 'undefined' && window._v42.getObjectives) {
      objConfig = window._v42.getObjectives();
    }
    var objectif = objConfig[String(currentYear)] || 0;

    // Show widgets container
    var widgetsContainer = document.getElementById('v5-top-widgets');
    if (widgetsContainer && data.length > 0) widgetsContainer.style.display = '';

    // Performance Score
    if (Analytics.performanceScoreV2) {
      try {
        var scoreData = Analytics.performanceScoreV2(data, currentYear, {
          objectif: objectif,
          objectivesConfig: objConfig
        });
        ChartsEnrichis.renderPerformanceScore(scoreData, 'perf-score-widget');
      } catch(e) { console.warn('[v5] performanceScore error', e); }
    }

    // Projection EOY
    if (Analytics.projectedYearEnd) {
      try {
        var projData = Analytics.projectedYearEnd(data, currentYear, objectif);
        ChartsEnrichis.renderProjectionWidget(projData, 'projection-eoy-widget');
      } catch(e) { console.warn('[v5] projection error', e); }
    }

    // Efficiency
    if (Analytics.commercialEfficiency) {
      try {
        var effData = Analytics.commercialEfficiency(data);
        ChartsEnrichis.renderCommercialEfficiency(effData, 'efficiency-widget');
      } catch(e) { console.warn('[v5] efficiency error', e); }
    }

    // Concentration
    if (Analytics.clientConcentration) {
      try {
        var concData = Analytics.clientConcentration(data, currentYear);
        ChartsEnrichis.renderClientConcentration(concData, 'concentration-widget');
      } catch(e) { console.warn('[v5] concentration error', e); }
    }

    // Executive Summary (Narrative)
    if (Analytics.generateExecutiveSummary) {
      try {
        var positiveOnly = (Analytics.displayMode && Analytics.displayMode.positiveOnly) || false;
        var summary = Analytics.generateExecutiveSummary(data, currentYear, objConfig, { positiveOnly: positiveOnly });
        ChartsEnrichis.renderExecutiveSummary(summary, 'analysis-text');
        var block = document.getElementById('annual-analysis-block');
        if (block && data.length > 3) block.classList.add('visible');
      } catch(e) { console.warn('[v5] summary error', e); }
    }

    // v5 Charts — skip si masqué
    function _isVisible(id) {
      var card = document.querySelector('[data-chart-id="' + id + '"]');
      return card && !card.classList.contains('hidden-chart') && !card.classList.contains('hidden');
    }

    if (ChartsEnrichis.createFunnelCAChart && _isVisible('chart-funnel-ca')) {
      try { ChartsEnrichis.createFunnelCAChart(data, 'chart-funnel-ca'); } catch(e) {}
    }


  }

  /* ══════════════════════════════════════════════
     4. HOOK INTO update()
  ══════════════════════════════════════════════ */
  var _prevUpdate = window.update;
  window.update = function() {
    // Add year-transition animation
    var main = document.querySelector('.grid');
    if (main) {
      main.classList.remove('year-transition');
      void main.offsetWidth; // force reflow
      main.classList.add('year-transition');
    }

    if (typeof _prevUpdate === 'function') _prevUpdate();
    var data = (typeof AE !== 'undefined') ? AE.getFiltered() : (window.DATA || []);
    renderFloatingFilters();
    renderV5Widgets(data);
  };

  /* ══════════════════════════════════════════════
     5. ANALYSIS BLOCK TOGGLE
  ══════════════════════════════════════════════ */
  document.addEventListener('DOMContentLoaded', function() {
    var toggleBtn = document.getElementById('btn-toggle-analysis');
    var block = document.getElementById('annual-analysis-block');
    if (toggleBtn && block) {
      toggleBtn.addEventListener('click', function() {
        var visible = block.classList.contains('visible');
        if (visible) {
          block.classList.remove('visible');
          toggleBtn.textContent = 'Afficher';
        } else {
          block.classList.add('visible');
          toggleBtn.textContent = 'Masquer';
        }
      });
    }
  });

  /* ══════════════════════════════════════════════
     6. POSITIVE MODE — Adapt visuals
  ══════════════════════════════════════════════ */
  // Already handled by btn-positive-only in v4 module.
  // We sync displayMode here:
  var _prevPositiveUpdate = null;
  document.addEventListener('DOMContentLoaded', function() {
    var btn = document.getElementById('btn-positive-only');
    if (btn) {
      btn.addEventListener('click', function() {
        if (typeof Analytics !== 'undefined' && Analytics.displayMode) {
          Analytics.displayMode.positiveOnly = !Analytics.displayMode.positiveOnly;
        }
      });
    }
  });

  console.log('%c🚀 v5.0 Module chargé — Intelligence Décisionnelle', 'color:#00d4aa;font-weight:700');
})();
