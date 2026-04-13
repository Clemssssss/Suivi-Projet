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
  var REMOTE_SCOPE = 'chart';
  var REMOTE_DOC_TYPE = 'objective-config';
  var REMOTE_DOC_KEY = 'shared';
  var PREF_REMOTE_DOC_TYPE = 'objective-config-preferences';
  var PREF_REMOTE_DOC_KEY_LEGACY = 'shared';
  var STORAGE_PREFIX = 'dashboard.objectives.preferences.v1';
  var YEAR_DISPLAY_MODE = 'current'; // 'current' | 'last_n' | 'all'
  var LAST_N_YEARS = 3;

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

  function _userKey() {
    if (window.AuthClient && typeof window.AuthClient.getCurrentUser === 'function') {
      return window.AuthClient.getCurrentUser() || 'anonymous';
    }
    return 'anonymous';
  }

  function _storageKey() {
    return STORAGE_PREFIX + '::' + _userKey();
  }

  function _prefRemoteDocKey() {
    return 'user::' + _userKey();
  }

  function _readDisplayPrefsLocal() {
    try {
      if (!window.localStorage) return null;
      var raw = localStorage.getItem(_storageKey());
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function _setDisplayPrefs(prefs) {
    if (!prefs || typeof prefs !== 'object') return;
    var mode = String(prefs.mode || '').toLowerCase();
    if (mode === 'current' || mode === 'last_n' || mode === 'all') {
      YEAR_DISPLAY_MODE = mode;
    }
    var n = parseInt(prefs.lastN, 10);
    if (Number.isFinite(n) && n > 0) LAST_N_YEARS = Math.min(n, 15);
  }

  function _persistDisplayPrefsLocal() {
    try {
      if (!window.localStorage) return;
      localStorage.setItem(_storageKey(), JSON.stringify({
        mode: YEAR_DISPLAY_MODE,
        lastN: LAST_N_YEARS
      }));
    } catch (_) {}
  }

  function _persistDisplayPrefsRemote() {
    if (typeof DashboardSharedStore === 'undefined') return;
    DashboardSharedStore.upsert(PREF_REMOTE_DOC_TYPE, _prefRemoteDocKey(), {
      mode: YEAR_DISPLAY_MODE,
      lastN: LAST_N_YEARS
    }, REMOTE_SCOPE).catch(function(err) {
      console.warn('[Objectives] Sync preferences DB impossible', err);
    });
  }

  function _persistDisplayPrefs() {
    _persistDisplayPrefsLocal();
    _persistDisplayPrefsRemote();
  }

  function _loadDisplayPrefsRemote() {
    if (typeof DashboardSharedStore === 'undefined') return Promise.resolve();
    return DashboardSharedStore.get(PREF_REMOTE_DOC_TYPE, _prefRemoteDocKey(), REMOTE_SCOPE)
      .then(function(doc) {
        if (doc && doc.payload) {
          _setDisplayPrefs(doc.payload);
          _persistDisplayPrefsLocal();
          return;
        }
        return DashboardSharedStore.get(PREF_REMOTE_DOC_TYPE, PREF_REMOTE_DOC_KEY_LEGACY, REMOTE_SCOPE)
          .then(function(legacyDoc) {
            if (legacyDoc && legacyDoc.payload) _setDisplayPrefs(legacyDoc.payload);
          });
      })
      .catch(function(err) {
        console.warn('[Objectives] Chargement preferences DB indisponible, fallback local', err);
      });
  }

  function _currentYearStr() {
    return String(new Date().getFullYear());
  }

  function _sortYearsAsc(years) {
    return (years || []).map(String).sort(function(a, b) {
      return (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0);
    });
  }

  function _resolveVisibleYears(allYears, cmpEnabled, cmpYearA, cmpYearB) {
    var years = _sortYearsAsc(allYears);
    if (!years.length) return [];
    if (YEAR_DISPLAY_MODE === 'all') return years;

    if (YEAR_DISPLAY_MODE === 'last_n') {
      var lastN = Math.max(1, parseInt(LAST_N_YEARS, 10) || 1);
      var picked = years.slice(-lastN);
      if (cmpEnabled && cmpYearA && years.indexOf(cmpYearA) !== -1 && picked.indexOf(cmpYearA) === -1) picked.push(cmpYearA);
      if (cmpEnabled && cmpYearB && years.indexOf(cmpYearB) !== -1 && picked.indexOf(cmpYearB) === -1) picked.push(cmpYearB);
      return _sortYearsAsc(picked);
    }

    var current = _currentYearStr();
    var visible = [];
    if (years.indexOf(current) !== -1) {
      visible.push(current);
    } else {
      visible.push(years[years.length - 1]);
    }

    if (cmpEnabled && cmpYearA && years.indexOf(cmpYearA) !== -1 && visible.indexOf(cmpYearA) === -1) visible.push(cmpYearA);
    if (cmpEnabled && cmpYearB && years.indexOf(cmpYearB) !== -1 && visible.indexOf(cmpYearB) === -1) visible.push(cmpYearB);
    return _sortYearsAsc(visible);
  }

  function _renderTitle(visibleYears, allYears) {
    var titleEl = document.querySelector('.obj-title');
    if (!titleEl) return;

    var base = '🎯 Objectif CA — Facturation Réelle';
    if (YEAR_DISPLAY_MODE === 'all') {
      titleEl.textContent = base + ' (toutes années)';
      return;
    }
    if (YEAR_DISPLAY_MODE === 'last_n') {
      titleEl.textContent = base + ' (' + visibleYears.length + '/' + allYears.length + ' années)';
      return;
    }
    var y = (visibleYears && visibleYears.length) ? visibleYears[visibleYears.length - 1] : _currentYearStr();
    titleEl.textContent = base + ' (' + y + ')';
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

  function _persistObjectives() {
    if (typeof DashboardSharedStore === 'undefined') return;
    DashboardSharedStore.upsert(REMOTE_DOC_TYPE, REMOTE_DOC_KEY, {
      objectives: OBJECTIVES_CONFIG,
      forcedYears: FORCED_YEARS
    }, REMOTE_SCOPE).catch(function(err) {
      console.warn('[Objectives] Sync DB impossible', err);
    });
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
      var yearsFromData = Object.keys(caByYear || {});
      var currentYear = _currentYearStr();
      if (yearsFromData.indexOf(currentYear) === -1) yearsFromData.push(currentYear);
      var autoYears = [];
      var from = (parseInt(currentYear, 10) || 0) - 2;
      var to = (parseInt(currentYear, 10) || 0) + 1;
      for (var y = from; y <= to; y += 1) autoYears.push(String(y));
      allYears = _sortYearsAsc(Array.from(new Set([]
        .concat(allYears || [])
        .concat(yearsFromData)
        .concat(Object.keys(mergedConfig || {}))
        .concat(autoYears))));

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
      var visibleYears = _resolveVisibleYears(allYears, cmpEnabled, cmpYearA, cmpYearB);
      _renderTitle(visibleYears, allYears);

      // Vider le container (supprime "Chargement…")
      container.innerHTML = '';

      var renderedCount = 0;

      trend.forEach(function (entry) {
        var yr          = String(entry.year);
        if (visibleYears.indexOf(yr) === -1) return;
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
        block.dataset.objYear = yr;

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
        labelEl.dataset.objYear = yr;
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
        barWrap.dataset.objYear = yr;
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
        objInput.dataset.objYear = yr;
        objInput.value = entry.objectif || '';
        objInput.placeholder = 'ex : 5 000 000';
        objInput.min = '0';
        objInput.step = '100000';

        var confirmBtn = document.createElement('button');
        confirmBtn.className = 'obj-input-confirm';
        confirmBtn.dataset.objYear = yr;
        confirmBtn.textContent = '✓ OK';
        confirmBtn.type = 'button';
        confirmBtn.title = 'Appliquer l\'objectif';

        function _applyObjective(y, inputEl) {
          var val = parseFloat(inputEl.value) || 0;
          OBJECTIVES_CONFIG[y] = val;
          OBJECTIVES[y] = val;
          _persistObjectives();
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
      _renderSummaryChips(trend, cmpEnabled, cmpYearA, cmpYearB, positiveOnly, visibleYears.length, allYears.length);

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
  function _renderSummaryChips(trend, cmpEnabled, cmpYearA, cmpYearB, positiveOnly, visibleCount, totalCount) {
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
    if (YEAR_DISPLAY_MODE === 'current') chips.push({
      text: '📅 ' + _currentYearStr() + ' uniquement',
      color: '#9fb3c8'
    });
    if (YEAR_DISPLAY_MODE === 'last_n' && totalCount > 1) chips.push({
      text: '📅 ' + visibleCount + '/' + totalCount + ' années (N=' + LAST_N_YEARS + ')',
      color: '#9fb3c8'
    });
    if (YEAR_DISPLAY_MODE === 'all' && totalCount > 1) chips.push({
      text: '📅 ' + visibleCount + '/' + totalCount + ' années',
      color: '#9fb3c8'
    });

    el.innerHTML = chips.map(function (c) {
      return '<span style="font-family:var(--mono);font-size:.62rem;font-weight:600;color:' + c.color
        + ';background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);'
        + 'padding:.18rem .6rem;border-radius:99px;">' + c.text + '</span>';
    }).join('')
      + '<span style="display:inline-flex;gap:.35rem;align-items:center;">'
      + '<select id="obj-years-mode" style="font-family:var(--mono);font-size:.62rem;background:rgba(255,255,255,.04);'
      + 'border:1px solid rgba(255,255,255,.12);color:var(--snow);border-radius:99px;padding:.18rem .55rem;cursor:pointer;">'
      + '<option value="current"' + (YEAR_DISPLAY_MODE === 'current' ? ' selected' : '') + '>Année en cours</option>'
      + '<option value="last_n"' + (YEAR_DISPLAY_MODE === 'last_n' ? ' selected' : '') + '>N dernières années</option>'
      + '<option value="all"' + (YEAR_DISPLAY_MODE === 'all' ? ' selected' : '') + '>Toutes les années</option>'
      + '</select>'
      + '<input id="obj-years-count" type="number" min="1" max="15" value="' + LAST_N_YEARS + '" style="'
      + 'width:56px;font-family:var(--mono);font-size:.62rem;background:rgba(255,255,255,.04);'
      + 'border:1px solid rgba(255,255,255,.12);color:var(--snow);border-radius:99px;padding:.18rem .45rem;'
      + (YEAR_DISPLAY_MODE === 'last_n' ? '' : 'display:none;')
      + '">'
      + '</span>'
      + '<button id="obj-toggle-years-visibility" type="button" style="font-family:var(--mono);font-size:.62rem;font-weight:600;'
      + 'color:var(--snow);background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);'
      + 'padding:.18rem .6rem;border-radius:99px;cursor:pointer;">'
      + (YEAR_DISPLAY_MODE === 'all' ? 'Année en cours seulement' : 'Afficher toutes les années')
      + '</button>';

    var modeSelect = document.getElementById('obj-years-mode');
    var countInput = document.getElementById('obj-years-count');
    if (modeSelect) {
      modeSelect.addEventListener('change', function() {
        YEAR_DISPLAY_MODE = this.value === 'all' ? 'all' : this.value === 'last_n' ? 'last_n' : 'current';
        _persistDisplayPrefs();
        window.renderObjectiveBars && window.renderObjectiveBars();
      });
    }
    if (countInput) {
      countInput.addEventListener('change', function() {
        var n = parseInt(this.value, 10);
        LAST_N_YEARS = Number.isFinite(n) && n > 0 ? Math.min(n, 15) : 3;
        this.value = LAST_N_YEARS;
        _persistDisplayPrefs();
        if (YEAR_DISPLAY_MODE === 'last_n') window.renderObjectiveBars && window.renderObjectiveBars();
      });
    }

    var toggleBtn = document.getElementById('obj-toggle-years-visibility');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', function () {
        YEAR_DISPLAY_MODE = YEAR_DISPLAY_MODE === 'all' ? 'current' : 'all';
        _persistDisplayPrefs();
        window.renderObjectiveBars && window.renderObjectiveBars();
      });
    }
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
    _setDisplayPrefs(_readDisplayPrefsLocal());

    if (typeof DashboardSharedStore !== 'undefined') {
      DashboardSharedStore.get(REMOTE_DOC_TYPE, REMOTE_DOC_KEY, REMOTE_SCOPE)
        .then(function(doc) {
          if (!doc || !doc.payload) return;
          if (doc.payload.objectives && typeof doc.payload.objectives === 'object') {
            OBJECTIVES_CONFIG = Object.assign({}, OBJECTIVES_CONFIG, doc.payload.objectives);
            OBJECTIVES = OBJECTIVES_CONFIG;
          }
          if (Array.isArray(doc.payload.forcedYears) && doc.payload.forcedYears.length) {
            FORCED_YEARS = doc.payload.forcedYears.map(String);
          }
          var tgt = document.getElementById('target-amount');
          var yr = (document.getElementById('year-filter') || {}).value;
          if (tgt && yr && OBJECTIVES_CONFIG[yr]) tgt.value = OBJECTIVES_CONFIG[yr];
          if (window.renderObjectiveBars) setTimeout(window.renderObjectiveBars, 120);
        })
        .catch(function(err) {
          console.warn('[Objectives] Chargement DB indisponible, fallback local', err);
        });
    }
    _loadDisplayPrefsRemote().then(function() {
      if (window.renderObjectiveBars) setTimeout(window.renderObjectiveBars, 120);
    });
    document.addEventListener('dashboard-auth-ready', function () {
      _loadDisplayPrefsRemote().then(function() {
        if (window.renderObjectiveBars) window.renderObjectiveBars();
      });
    });

    // Resync objectif quand le champ change
    var tgtInput = document.getElementById('target-amount');
    if (tgtInput) tgtInput.addEventListener('change', function () {
      _syncObjective();
      _persistObjectives();
      window.renderObjectiveBars && window.renderObjectiveBars();
    });

    // Re-render quand le filtre année change
    var yearFilter = document.getElementById('year-filter');
    if (yearFilter) yearFilter.addEventListener('change', function () {
      _syncObjective();
      _persistObjectives();
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
      _persistObjectives();
    },
    setObjectives:   function (cfg) {
      Object.assign(OBJECTIVES_CONFIG, cfg);
      Object.assign(OBJECTIVES, cfg);
      _persistObjectives();
    },
    getObjectives:   function () { return OBJECTIVES_CONFIG; },
    setForcedYears:  function (arr) { FORCED_YEARS = arr.map(String); },
    getForcedYears:  function () { return FORCED_YEARS.slice(); },
    showAllYears:    function (on) {
      YEAR_DISPLAY_MODE = on ? 'all' : 'current';
      _persistDisplayPrefs();
      window.renderObjectiveBars && window.renderObjectiveBars();
    },
    setYearDisplayMode: function(mode, n) {
      YEAR_DISPLAY_MODE = (mode === 'all' || mode === 'last_n') ? mode : 'current';
      if (Number.isFinite(parseInt(n, 10)) && parseInt(n, 10) > 0) LAST_N_YEARS = Math.min(parseInt(n, 10), 15);
      _persistDisplayPrefs();
      window.renderObjectiveBars && window.renderObjectiveBars();
    }
  };

})();
