(function () {
  'use strict';

  /* ── Config objectifs par année ─────────────────────────
     { "2023": 4000000, "2024": 3000000, ... }
     Alimenté par le champ #target-amount + #year-filter.
     Exposé via window._v42.setObjective(year, amount)
  ────────────────────────────────────────────────────────── */
  /* ══════════════════════════════════════════════════════
     CONFIGURATION CENTRALE DES OBJECTIFS PAR ANNÉE
     ─────────────────────────────────────────────────────
     ✅  Source unique de vérité — ne jamais hardcoder ailleurs.
     ✅  Ajouter 2026 : OBJECTIVES_CONFIG["2026"] = 7200000;
         puis ajouter "2026" dans FORCED_YEARS.
  ════════════════════════════════════════════════════════ */
  var OBJECTIVES_CONFIG = {
    "2023": 3000000,
    "2024": 3000000,
    "2025": 3000000,
    "2026": 7200000
  };

  /* Années toujours affichées, même sans données projet */
  var FORCED_YEARS = ["2023", "2024", "2025", "2026"];

  /* OBJECTIVES reste un alias mutable pour la rétrocompatibilité */
  var OBJECTIVES = OBJECTIVES_CONFIG;

  /* ── Helpers ─────────────────────────────────────────── */
  function _raw() {
    return (typeof AE !== 'undefined') ? AE.getRaw() : (window.DATA || []);
  }

  function _fmt(v) {
    if (typeof ProjectUtils !== 'undefined' && ProjectUtils.formatMontant)
      return ProjectUtils.formatMontant(v, true);
    if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(2) + 'M€';
    if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(0) + 'k€';
    return v + '€';
  }

  function _syncObjective() {
    var tgt = parseInt((document.getElementById('target-amount') || {}).value, 10) || 0;
    if (!tgt) return;
    var yr = (document.getElementById('year-filter') || {}).value;
    if (yr) {
      OBJECTIVES_CONFIG[yr] = tgt;
      OBJECTIVES[yr] = tgt;
    } else {
      // Affecter à l'année la plus récente du dataset
      if (typeof Analytics !== 'undefined' && Analytics.availableYears) {
        var years = Analytics.availableYears(_raw());
        if (years.length) {
          var key = String(years[0]);
          OBJECTIVES_CONFIG[key] = tgt;
          OBJECTIVES[key] = tgt;
        }
      }
    }
  }

  /* ── Couleur de barre selon % ────────────────────────── */
  function _barColor(pct) {
    if (pct === null)  return 'rgba(255,255,255,.12)';
    if (pct >= 100)    return 'linear-gradient(90deg,var(--brand2),var(--green))';
    if (pct >= 70)     return 'linear-gradient(90deg,#0099ff,var(--brand))';
    if (pct >= 40)     return 'linear-gradient(90deg,#f5b740,#e88c20)';
    return 'linear-gradient(90deg,#f5b740,#ff4d6d)';
  }

  /* ── Rendu principal ─────────────────────────────────── */
  window.renderObjectiveBars = function () {
    var container = document.getElementById('objective-bars-container');
    if (!container) return;
    if (typeof Analytics === 'undefined' || typeof Analytics.objectiveTrend !== 'function') {
      container.textContent = 'Analytics non disponible.';
      return;
    }

    try {
      _syncObjective();

      // ── Calcul via _annee — source unique de vérité ─────────────────
      // NE PAS utiliser objectiveTrendByFacturation (dépend de ca_facture_YYYY)
      // Chaque projet a _annee injecté par DataFilterEngine via Analytics.getProjectYear()
      var mergedConfig = Object.assign({}, OBJECTIVES_CONFIG, OBJECTIVES);
      var raw = _raw();

      var caByYear       = {};  // CA gagné = Bud des obtenus
      var countByYear    = {};  // TOUS statuts → badge affiché
      var countWonByYear = {};  // obtenus uniquement
      raw.forEach(function(p) {
        // _annee est la source unique — injecté par DataFilterEngine/setRawData
        var yr = p._annee;
        if (!yr && typeof Analytics !== 'undefined' && typeof Analytics.getProjectYear === 'function') {
          yr = Analytics.getProjectYear(p);  // fallback si _annee absent
        }
        if (!yr) return;
        yr = String(yr);
        if (!caByYear[yr])       caByYear[yr]       = 0;
        if (!countByYear[yr])    countByYear[yr]     = 0;
        if (!countWonByYear[yr]) countWonByYear[yr]  = 0;
        countByYear[yr]++;  // TOUS statuts pour le badge
        if (typeof ProjectUtils !== 'undefined' && ProjectUtils.getStatus(p) === 'obtenu') {
          caByYear[yr] += (ProjectUtils.parseMontant(p['Bud']) || 0);
          countWonByYear[yr]++;
        }
      });

      var allYears = FORCED_YEARS.length ? FORCED_YEARS : Object.keys(caByYear).sort();

      var trend = allYears.map(function(yr, i) {
        var y       = String(yr);
        var real    = caByYear[y]  || 0;
        var obj     = mergedConfig[y] || null;
        var completion  = (obj && obj > 0) ? Math.round(real / obj * 100) : null;
        var prevYr  = i > 0 ? String(allYears[i - 1]) : null;
        var prevReal = prevYr ? (caByYear[prevYr] || 0) : null;
        var delta   = (prevReal !== null && (real > 0 || prevReal > 0))
          ? Math.round((real - prevReal) / Math.max(prevReal, 1) * 100) : null;
        return {
          year:            y,
          real:            real,
          objectif:        obj,
          hasObjectif:     !!(obj && obj > 0),
          completion:      completion,
          deltaVsPrevious: delta,
          deltaObjectif:   null,
          projectCount:    countByYear[y]    || 0,  // TOUS statuts → badge
          projectWon:      countWonByYear[y] || 0,  // obtenus → tooltip CA
        };
      }).filter(function(e) { return e.year; });

      if (!trend || !trend.length) {
        container.textContent = 'Aucune donnée disponible.';
        return;
      }

      // État comparaison
      var cmpState     = (window._v4compare && window._v4compare.getState) ? window._v4compare.getState() : {};
      var cmpEnabled   = !!(cmpState.enabled && cmpState.yearA && cmpState.yearB);
      var cmpYearA     = String(cmpState.yearA || '');
      var cmpYearB     = String(cmpState.yearB || '');
      var positiveOnly = !!(typeof Analytics !== 'undefined' && Analytics.compareConfig && Analytics.compareConfig.positiveOnly);

      // Vider le container (supprime "Chargement…")
      container.innerHTML = '';

      var renderedCount = 0;

      trend.forEach(function (entry) {
        var yr          = String(entry.year);
        var pct         = (entry.completion !== null && !isNaN(entry.completion)) ? entry.completion : null;
        var pctDisplay  = pct !== null ? Math.min(pct, 100) : 0;
        var delta       = entry.deltaVsPrevious; // null pour la 1re année
        var isA         = cmpEnabled && yr === cmpYearA;
        var isB         = cmpEnabled && yr === cmpYearB;
        var isDimmed    = cmpEnabled && !isA && !isB;
        var isRecession = (delta !== null && !isNaN(delta) && delta < 0);

        // Mode positif : masquer les années en recul (sauf A et B)
        if (positiveOnly && isRecession && !isA && !isB) return;

        // Bloc principal
        var block = document.createElement('div');
        block.className = 'obj-year-block'
          + (isDimmed    ? ' dimmed'    : '')
          + (isA         ? ' highlight highlight-a' : '')
          + (isB         ? ' highlight highlight-b' : '')
          + (isRecession ? ' recession' : '');
        block.dataset.year = yr;

        // -- Projets de l'année : filtrage par _annee (TOUS statuts)
        // Source : _annee pré-calculé par DataFilterEngine (via Analytics.getProjectYear)
        // NE PAS filtrer sur ca_facture_YYYY (déprécié)
        var projectsForYear = _raw().filter(function(p) {
          return String(p._annee || '') === String(yr);
        });
        if (typeof AE !== 'undefined' && AE.getFilters) {
          var aeF = AE.getFilters();
          projectsForYear = projectsForYear.filter(function(p) {
            return Object.keys(aeF).every(function(k) {
              if (k === '_annee') return true; // déjà filtré
              var v = aeF[k];
              if (k === 'Statut') return (typeof ProjectUtils !== 'undefined')
                ? (ProjectUtils.getStatus(p) === v || (typeof ProjectUtils.parseStatusKey === 'function' && ProjectUtils.parseStatusKey(v) === ProjectUtils.getStatus(p)))
                : String(p['Statut'] || '').toLowerCase() === String(v).toLowerCase();
              return String(p[k] || '') === String(v);
            });
          });
        }
        var projCount = entry.projectCount || projectsForYear.length;  // TOUS statuts
        var projWon   = entry.projectWon   || 0;                       // obtenus

        // -- Fonction d'ouverture du tableau détail intégré
        function _openDetail() {
          if (window._objDetail) {
            window._objDetail.show(yr);
          } else if (typeof showDetailTable === 'function') {
            showDetailTable(projectsForYear, 'Projets facturant en ' + yr + ' — ' + _fmt(entry.real));
          }
        }

        // -- Label année + badge A/B + compteur
        // CRITIQUE : utiliser createTextNode(yr) — jamais labelEl.textContent = yr
        // Car countBadge est un enfant → textContent retournerait "202432" (bug concat)
        var labelEl = document.createElement('span');
        labelEl.className = 'obj-year-label';
        labelEl.appendChild(document.createTextNode(yr));  // nœud textuel isolé
        // Tooltip : "2024 — 32 projets (8 gagnés)"
        var _tipTxt = yr + ' — ' + projCount + ' projet' + (projCount !== 1 ? 's' : '')
          + (projWon > 0 && projWon < projCount ? ' (' + projWon + ' gagné' + (projWon !== 1 ? 's' : '') + ')' : '');
        labelEl.title = _tipTxt;
        if (isA || isB) {
          var badge = document.createElement('span');
          badge.textContent = isA ? 'A' : 'B';
          badge.style.cssText = 'font-size:.56rem;background:' + (isA ? '#0099ff' : '#8b78f8')
            + ';color:#fff;border-radius:3px;padding:0 3px;margin-left:3px;vertical-align:middle;';
          labelEl.appendChild(badge);
        }
        if (projCount > 0) {
          var countBadge = document.createElement('span');
          countBadge.className = 'obj-year-count';
          countBadge.textContent = String(projCount);  // TOUS statuts (cohérent avec le tableau)
          if (projWon > 0 && projWon < projCount) {
            countBadge.title = projWon + ' gagné' + (projWon !== 1 ? 's' : '') + ' / ' + projCount;
          }
          labelEl.appendChild(countBadge);
        }
        labelEl.addEventListener('click', _openDetail);

        // -- Barre de progression (cliquable)
        var barWrap = document.createElement('div');
        barWrap.className = 'obj-year-bar-wrap';
        barWrap.title = _tipTxt; // même tooltip enrichi que labelEl
        barWrap.style.cursor = 'pointer';
        barWrap.addEventListener('click', _openDetail);

        var barFill = document.createElement('div');
        barFill.className = 'obj-year-bar-fill';
        barFill.style.width = pctDisplay.toFixed(1) + '%';
        barFill.style.background = _barColor(pct);

        var barPct = document.createElement('div');
        barPct.className = 'obj-year-bar-pct';
        barPct.textContent = pct !== null ? pct.toFixed(1) + '%' : '—';

        // Hint "voir détail →" visible au survol
        var barHint = document.createElement('div');
        barHint.className = 'obj-bar-hint';
        barHint.textContent = projCount > 0 ? '📋 ' + projCount + ' projets →' : 'aucun projet';

        barWrap.appendChild(barFill);
        barWrap.appendChild(barPct);
        barWrap.appendChild(barHint);

        // -- Méta colonne droite
        var meta = document.createElement('div');
        meta.className = 'obj-year-meta';

        // Delta taux vs N-1
        var deltaEl = document.createElement('span');
        deltaEl.className = 'obj-year-delta ';
        if (delta !== null && !isNaN(delta)) {
          var sign  = delta >= 0 ? '+' : '';
          deltaEl.className += delta > 0 ? 'pos' : delta < 0 ? 'neg' : 'neu';
          deltaEl.textContent = (delta > 0 ? '▲' : '▼') + ' ' + sign + delta.toFixed(1) + 'pt vs N-1';
        } else {
          deltaEl.className += 'neu';
          deltaEl.textContent = renderedCount === 0 ? '— 1ère année' : '—';
        }

        // CA réel + objectif
        var realEl = document.createElement('span');
        realEl.className = 'obj-year-real';
        realEl.textContent = _fmt(entry.real)
          + (entry.hasObjectif ? ' / ' + _fmt(entry.objectif) : ' — sans objectif');

        // Ambition (delta objectif vs N-1)
        var ambitionEl = null;
        if (entry.deltaObjectif !== null && entry.deltaObjectif !== undefined && entry.deltaObjectif !== 0) {
          ambitionEl = document.createElement('span');
          ambitionEl.className = 'obj-year-ambition';
          ambitionEl.textContent = 'Objectif ' + (entry.deltaObjectif > 0 ? '+' : '') + entry.deltaObjectif + '% vs N-1';
        }

        meta.appendChild(deltaEl);
        meta.appendChild(realEl);
        if (ambitionEl) meta.appendChild(ambitionEl);

        block.appendChild(labelEl);
        block.appendChild(barWrap);
        block.appendChild(meta);

        // -- Input modification objectif en live (pleine largeur, 2e ligne du grid)
        var inputRow = document.createElement('div');
        inputRow.className = 'obj-input-row';

        var inputLabel = document.createElement('span');
        inputLabel.className = 'obj-input-label';
        inputLabel.textContent = 'Objectif';

        var objInput = document.createElement('input');
        objInput.type = 'number';
        objInput.className = 'obj-input';
        objInput.dataset.year = yr;
        objInput.value = entry.objectif || '';
        objInput.placeholder = 'ex : 5 000 000';
        objInput.min = '0';
        objInput.step = '100000';

        var confirmBtn = document.createElement('button');
        confirmBtn.className = 'obj-input-confirm';
        confirmBtn.textContent = '✓ OK';
        confirmBtn.type = 'button';
        confirmBtn.title = 'Appliquer l\'objectif';

        function _applyObjective(y, inputEl) {
          var val = parseFloat(inputEl.value) || 0;
          OBJECTIVES_CONFIG[y] = val;
          OBJECTIVES[y] = val;
          window.renderObjectiveBars && window.renderObjectiveBars();
        }

        confirmBtn.addEventListener('click', function () {
          _applyObjective(yr, objInput);
        });
        objInput.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') _applyObjective(yr, objInput);
        });
        // Aussi sur change (tab out) pour compatibilité
        objInput.addEventListener('change', function () {
          _applyObjective(yr, objInput);
        });

        inputRow.appendChild(inputLabel);
        inputRow.appendChild(objInput);
        inputRow.appendChild(confirmBtn);
        block.appendChild(inputRow);

        container.appendChild(block);
        renderedCount++;
      });

      if (renderedCount === 0) {
        container.textContent = 'Aucune année à afficher.';
      }

      // Résumé chips
      _renderSummaryChips(trend, cmpEnabled, cmpYearA, cmpYearB, positiveOnly);

      // Delta row comparaison
      _renderDeltaRow(trend, cmpYearA, cmpYearB);

      // Rafraîchir le tableau détail si un onglet est actif
      if (window._objDetail) window._objDetail.refresh();

    } catch (err) {
      console.error('[renderObjectiveBars]', err);
      if (container) container.textContent = 'Erreur de rendu — voir la console.';
    }
  };

  /* ── Chips résumé dans l'en-tête ─────────────────────── */
  function _renderSummaryChips(trend, cmpEnabled, cmpYearA, cmpYearB, positiveOnly) {
    var el = document.getElementById('obj-summary-chips');
    if (!el) return;

    var atteints  = trend.filter(function (e) { return e.completion !== null && e.completion >= 100; }).length;
    var total     = trend.filter(function (e) { return e.hasObjectif; }).length;
    var enHausse  = trend.filter(function (e) { return e.progression === true; }).length;

    var chips = [];
    if (total > 0) chips.push({
      text: atteints + '/' + total + ' objectifs atteints',
      color: atteints === total ? '#00d4aa' : atteints > 0 ? '#f5b740' : '#ff4d6d'
    });
    if (enHausse > 0) chips.push({
      text: '▲ ' + enHausse + ' ans en progression',
      color: '#00d4aa'
    });
    if (cmpEnabled) chips.push({
      text: '⚖️ ' + cmpYearA + ' vs ' + cmpYearB,
      color: '#8b78f8'
    });
    if (positiveOnly) chips.push({ text: '✦ Positif uniquement', color: '#00d4aa' });

    el.innerHTML = chips.map(function (c) {
      return '<span style="font-family:var(--mono);font-size:.62rem;font-weight:600;color:' + c.color
        + ';background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);'
        + 'padding:.18rem .6rem;border-radius:99px;">' + c.text + '</span>';
    }).join('');
  }

  /* ── Rangée delta pour le mode comparaison ───────────── */
  function _renderDeltaRow(trend, cmpYearA, cmpYearB) {
    var el = document.getElementById('objective-comparison-delta');
    if (!el) return;
    if (!cmpYearA || !cmpYearB) { el.style.display = 'none'; return; }

    var entA = trend.find(function (e) { return String(e.year) === cmpYearA; });
    var entB = trend.find(function (e) { return String(e.year) === cmpYearB; });
    if (!entA || !entB) { el.style.display = 'none'; return; }

    var deltaComp = entA.completion !== null && entB.completion !== null
      ? Math.round((entA.completion - entB.completion) * 10) / 10 : null;
    var deltaReal = entA.real - entB.real;

    var items = [
      { label: '📈 Performance', val: _fmt(entA.real) + ' vs ' + _fmt(entB.real),
        delta: deltaReal, isCA: true },
      { label: '✅ Taux',
        val: (entA.completion !== null ? entA.completion + '%' : '—')
          + ' vs ' + (entB.completion !== null ? entB.completion + '%' : '—'),
        delta: deltaComp, isPts: true }
    ];
    if (entA.hasObjectif && entB.hasObjectif) {
      var dObj = entB.objectif > 0
        ? Math.round(((entA.objectif - entB.objectif) / entB.objectif) * 100) : null;
      items.unshift({
        label: '🎯 Objectif',
        val: _fmt(entA.objectif) + ' vs ' + _fmt(entB.objectif),
        delta: dObj, isPct: true
      });
    }

    el.innerHTML = items.map(function (it) {
      if (it.delta === null) return '';
      var pos   = it.delta >= 0;
      var color = pos ? '#00d4aa' : '#ff4d6d';
      var arrow = it.delta > 0 ? '▲' : '▼';
      var sign  = it.delta > 0 ? '+' : '';
      var dStr  = it.isPct ? sign + it.delta + '%'
                : it.isPts ? sign + it.delta + 'pt'
                : sign + _fmt(it.delta);
      return '<span style="color:' + color + ';font-weight:700;">'
        + it.label + ' ' + arrow + ' ' + dStr
        + '</span><span style="color:rgba(255,255,255,.2);margin:0 .25rem;">—</span>'
        + '<span style="color:var(--dust);">' + it.val + '</span>';
    }).join('<span style="color:rgba(255,255,255,.1);margin:0 .5rem;">|</span>');

    el.style.display = '';
  }

  /* ── Wiring DOM ──────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function () {

    // Resync objectif quand le champ change
    var tgtInput = document.getElementById('target-amount');
    if (tgtInput) tgtInput.addEventListener('change', function () {
      _syncObjective();
      window.renderObjectiveBars && window.renderObjectiveBars();
    });

    // Re-render quand le filtre année change
    var yearFilter = document.getElementById('year-filter');
    if (yearFilter) yearFilter.addEventListener('change', function () {
      _syncObjective();
      // Attendre que update() ait recalculé avant de re-render
      setTimeout(function () {
        window.renderObjectiveBars && window.renderObjectiveBars();
      }, 100);
    });
  });

  /* ── Exposition ──────────────────────────────────────── */
  window._v42 = {
    render:          function () { window.renderObjectiveBars && window.renderObjectiveBars(); },
    setObjective:    function (year, amount) {
      OBJECTIVES_CONFIG[String(year)] = amount;
      OBJECTIVES[String(year)] = amount;
    },
    setObjectives:   function (cfg) {
      Object.assign(OBJECTIVES_CONFIG, cfg);
      Object.assign(OBJECTIVES, cfg);
    },
    getObjectives:   function () { return OBJECTIVES_CONFIG; },
    setForcedYears:  function (arr) { FORCED_YEARS = arr.map(String); },
    getForcedYears:  function () { return FORCED_YEARS.slice(); }
  };

})();

