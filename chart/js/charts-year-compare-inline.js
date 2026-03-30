(function () {
  'use strict';

  /* ── État du module ─────────────────────────────────── */
  var compareState = {
    enabled:      false,
    yearA:        null,
    yearB:        null,
    positiveOnly: false
  };

  var _lastCmp = null;  // dernier résultat Analytics.compareYears()

  /* ── Helpers ──────────────────────────────────────────── */
  function _raw() {
    return (typeof AE !== 'undefined') ? AE.getRaw() : (window.DATA || []);
  }

  function _populate(id, years) {
    var el = document.getElementById(id);
    if (!el) return;
    var prev = el.value;
    // Vider + reconstruire
    el.innerHTML = '<option value="">—</option>';
    (years || []).forEach(function (y) {
      var o = document.createElement('option');
      o.value = y; o.textContent = y;
      el.appendChild(o);
    });
    // Restaurer sélection précédente
    if (prev) el.value = prev;
  }

  function _populateAll() {
    if (typeof Analytics === 'undefined' || !Analytics.availableYears) return;
    var years = Analytics.availableYears(_raw());
    _populate('compare-year-a', years);
    _populate('compare-year-b', years);
    // Défauts : A = année la plus récente, B = N-1
    var selA = document.getElementById('compare-year-a');
    var selB = document.getElementById('compare-year-b');
    if (selA && !selA.value && years.length >= 1) selA.value = String(years[0]);
    if (selB && !selB.value && years.length >= 2) selB.value = String(years[1]);
  }

  function _readSelects() {
    return {
      a: (document.getElementById('compare-year-a') || {}).value,
      b: (document.getElementById('compare-year-b') || {}).value
    };
  }

  /* ── Rendu verdict ──────────────────────────────────── */
  function _updateVerdictBadge(verdict) {
    var badge = document.getElementById('cmp-verdict-badge');
    if (!badge) return;
    var map = {
      better: { text: '▲ En progression', bg: 'rgba(0,212,170,.15)', border: 'rgba(0,212,170,.45)', color: '#00d4aa' },
      worse:  { text: '▼ En recul',       bg: 'rgba(255,77,109,.15)',  border: 'rgba(255,77,109,.45)',  color: '#ff4d6d' },
      mixed:  { text: '⟷ Mixte',          bg: 'rgba(245,183,64,.12)',  border: 'rgba(245,183,64,.45)',  color: '#f5b740' }
    };
    var c = map[verdict] || map.mixed;
    badge.style.display    = '';
    badge.textContent      = c.text;
    badge.style.background = c.bg;
    badge.style.borderColor= c.border;
    badge.style.color      = c.color;
  }

  /* ── Rendu du bouton positif ────────────────────────── */
  function _updatePositiveBtn() {
    var btn = document.getElementById('btn-positive-only');
    if (!btn) return;
    if (compareState.positiveOnly) {
      btn.style.background    = 'rgba(0,212,170,.25)';
      btn.style.borderColor   = 'rgba(0,212,170,.7)';
      btn.style.boxShadow     = '0 0 8px rgba(0,212,170,.25)';
      btn.textContent         = '✦ Positif ✓';
      btn.title               = 'Mode positif actif — cliquer pour désactiver';
    } else {
      btn.style.background    = 'rgba(0,212,170,.08)';
      btn.style.borderColor   = 'rgba(0,212,170,.3)';
      btn.style.boxShadow     = 'none';
      btn.textContent         = '✦ Positif';
      btn.title               = 'Afficher uniquement les progressions';
    }
  }

  /* ── Lancement de la comparaison (appelé par btn + auto) ── */
  function runComparison() {
    var sel = _readSelects();

    if (!sel.a || !sel.b || sel.a === sel.b) {
      // Invalide
      document.getElementById('cmp-result-zone')  && (document.getElementById('cmp-result-zone').style.display  = 'none');
      document.getElementById('cmp-empty-state')  && (document.getElementById('cmp-empty-state').style.display  = '');
      document.getElementById('cmp-active-badge') && (document.getElementById('cmp-active-badge').style.display = 'none');
      document.getElementById('cmp-verdict-badge')&& (document.getElementById('cmp-verdict-badge').style.display= 'none');
      compareState.enabled = false;
      return;
    }

    if (typeof Analytics === 'undefined' || !Analytics.compareYears) return;

    compareState.enabled = true;
    compareState.yearA   = sel.a;
    compareState.yearB   = sel.b;

    // Sync positiveOnly dans Analytics.compareConfig (non-gelé)
    if (Analytics.compareConfig) Analytics.compareConfig.positiveOnly = compareState.positiveOnly;

    // ── CALCUL — uniquement dans Analytics ──
    _lastCmp = Analytics.compareYears(_raw(), sel.a, sel.b);

    // ── RENDU ──
    _renderAll();
  }

  function _renderAll() {
    if (!_lastCmp) return;

    /* Narrative */
    var narrativeEl = document.getElementById('cmp-narrative');
    if (narrativeEl) narrativeEl.innerHTML = _lastCmp.narrative;

    /* Verdict badge */
    _updateVerdictBadge(_lastCmp.verdict);

    /* Badge "Mode Comparaison" */
    var activeBadge = document.getElementById('cmp-active-badge');
    if (activeBadge) activeBadge.style.display = '';

    /* Empty state → masquer */
    var emptyState = document.getElementById('cmp-empty-state');
    if (emptyState) emptyState.style.display = 'none';

    /* Sync positiveOnly */
    if (Analytics.compareConfig) Analytics.compareConfig.positiveOnly = compareState.positiveOnly;

    /* ── Déléguer le rendu visuel à ChartsEnrichis ── */
    if (typeof ChartsEnrichis !== 'undefined') {
      if (ChartsEnrichis.renderDeltaKPIs)
        ChartsEnrichis.renderDeltaKPIs(_lastCmp, 'year-delta-kpis');

      if (ChartsEnrichis.createYearComparisonChart)
        ChartsEnrichis.createYearComparisonChart(_lastCmp, 'chart-year-comparison');

      if (ChartsEnrichis.renderZoneComparisonTable)
        ChartsEnrichis.renderZoneComparisonTable(_lastCmp, 'year-zone-table');
    }

    /* Afficher zone résultats avec animation */
    var resultZone = document.getElementById('cmp-result-zone');
    if (resultZone) {
      resultZone.style.opacity    = '0';
      resultZone.style.display    = '';
      requestAnimationFrame(function () {
        resultZone.style.transition = 'opacity .3s ease';
        resultZone.style.opacity    = '1';
      });
    }

    /* Re-render barre objectif multi-années (highlight A/B) */
    if (typeof window.renderObjectiveBars === 'function')
      window.renderObjectiveBars();
  }

  /* ── Wiring DOM ─────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function () {

    // Peupler les selects dès que disponible
    _populateAll();

    // Bouton Comparer (ctrl-bar + éventuel doublon panel)
    document.querySelectorAll('#btn-compare').forEach(function (btn) {
      btn.addEventListener('click', function () {
        // Ouvrir le panel si fermé
        var panel = document.getElementById('compare-panel');
        if (panel && panel.style.display === 'none') panel.style.display = '';
        runComparison();
      });
    });

    // Auto-comparaison : recalcul dès que les deux sélects ont des valeurs différentes
    ['compare-year-a', 'compare-year-b'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', function () {
        var sel = _readSelects();
        // Auto-remplir B si vide : B = A - 1
        if (sel.a && !sel.b) {
          var autoB = String(parseInt(sel.a, 10) - 1);
          var selB = document.getElementById('compare-year-b');
          if (selB) {
            // Vérifier si l'année existe
            var opts = Array.from(selB.options).map(function (o) { return o.value; });
            if (opts.indexOf(autoB) !== -1) selB.value = autoB;
          }
        }
        var selFinal = _readSelects();
        if (selFinal.a && selFinal.b && selFinal.a !== selFinal.b) {
          runComparison();
        }
      });
    });

    // Bouton Positif uniquement (ctrl-bar)
    document.querySelectorAll('#btn-positive-only').forEach(function (btn) {
      btn.addEventListener('click', function () {
        compareState.positiveOnly = !compareState.positiveOnly;
        _updatePositiveBtn();
        // Re-render uniquement visuel — aucun recalcul métier
        _renderAll();
        // Re-render barre objectif (mode positif)
        if (typeof window.renderObjectiveBars === 'function')
          window.renderObjectiveBars();
      });
    });

    // Swap A ↔ B
    var swapBtn = document.getElementById('cmp-swap');
    if (swapBtn) {
      swapBtn.addEventListener('click', function () {
        var selA = document.getElementById('compare-year-a');
        var selB = document.getElementById('compare-year-b');
        if (!selA || !selB) return;
        var tmp = selA.value; selA.value = selB.value; selB.value = tmp;
        var sel = _readSelects();
        if (sel.a && sel.b && sel.a !== sel.b) runComparison();
      });
    }

    // Preset N vs N-1
    var presetBtn = document.getElementById('cmp-preset-n-n1');
    if (presetBtn) {
      presetBtn.addEventListener('click', function () {
        if (typeof Analytics === 'undefined' || !Analytics.availableYears) return;
        var years = Analytics.availableYears(_raw());
        if (years.length < 2) return;
        var selA = document.getElementById('compare-year-a');
        var selB = document.getElementById('compare-year-b');
        if (selA) selA.value = String(years[0]);
        if (selB) selB.value = String(years[1]);
        runComparison();
      });
    }

    // Toggle panel depuis la barre de mode stratégique
    var toggleBtn = document.getElementById('btn-toggle-compare');
    var panel     = document.getElementById('compare-panel');
    if (toggleBtn && panel) {
      toggleBtn.addEventListener('click', function () {
        var visible = panel.style.display !== 'none' && panel.style.display !== '';
        panel.style.display = visible ? 'none' : '';
        toggleBtn.style.borderColor = visible ? '' : 'var(--brand2)';
        toggleBtn.style.color       = visible ? '' : 'var(--brand2)';
        if (!visible) {
          _populateAll();
          var sel = _readSelects();
          if (sel.a && sel.b && sel.a !== sel.b) runComparison();
        }
      });
    }

  });

  /* ── Exposition ─────────────────────────────────────── */
  window._v4compare = {
    run:           runComparison,
    populateAll:   _populateAll,
    getState:      function () { return compareState; },
    getLast:       function () { return _lastCmp; }
  };

})();
