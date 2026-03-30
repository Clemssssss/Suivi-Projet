/**
 * ════════════════════════════════════════════════════════════════
 *  DASHBOARD STATE v1.0 — Sauvegarde/restauration de l'état
 * ════════════════════════════════════════════════════════════════
 *
 *  Sauvegarde automatiquement :
 *   ✅ L'ordre des graphiques (drag-and-drop futur)
 *   ✅ Les graphiques masqués
 *   ✅ Les graphiques personnalisés (via ChartEditor)
 *   ✅ Les filtres actifs (FilterManager + AE)
 *   ✅ Les sections repliées
 *   ✅ Le mode CA actif
 *   ✅ L'année active
 *
 *  Usage :
 *   DashboardState.init()   — auto-restauration + auto-save
 *   DashboardState.save()   — sauvegarde manuelle
 *   DashboardState.reset()  — tout effacer et recharger
 *
 *  Stockage : localStorage (clé "cahors_dashboard_state")
 * ════════════════════════════════════════════════════════════════
 */
if (!window.DashboardState) {
window.DashboardState = (() => {
  'use strict';

  const STORAGE_KEY  = 'cahors_dashboard_state';
  const REMOTE_SCOPE = 'chart';
  const REMOTE_DOC_TYPE = 'dashboard-state';
  const REMOTE_DOC_KEY_LEGACY = 'shared';
  const DEBOUNCE_MS  = 1500;
  let _saveTimer     = null;
  let _isInit        = false;
  let _cachedState   = null;

  /* ── Lecture/écriture localStorage ─────────────────────── */
  function _load() {
    if (_cachedState && typeof _cachedState === 'object') return _cachedState;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }
  function _userKey() {
    if (window.AuthClient && typeof window.AuthClient.getCurrentUser === 'function') {
      return window.AuthClient.getCurrentUser() || 'anonymous';
    }
    return 'anonymous';
  }
  function _remoteDocKey() {
    return 'user::' + _userKey();
  }

  function _write(state) {
    _cachedState = state || {};
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (e) { console.warn('[DashboardState] Erreur localStorage:', e); }
    if (typeof DashboardSharedStore !== 'undefined') {
      DashboardSharedStore.upsert(REMOTE_DOC_TYPE, _remoteDocKey(), _cachedState, REMOTE_SCOPE)
        .catch(function(err) { console.warn('[DashboardState] Sync DB impossible', err); });
    }
  }

  async function _loadRemote() {
    if (typeof DashboardSharedStore === 'undefined') return null;
    try {
      var doc = await DashboardSharedStore.get(REMOTE_DOC_TYPE, _remoteDocKey(), REMOTE_SCOPE);
      if ((!doc || !doc.payload || typeof doc.payload !== 'object') && !_cachedState) {
        doc = await DashboardSharedStore.get(REMOTE_DOC_TYPE, REMOTE_DOC_KEY_LEGACY, REMOTE_SCOPE);
      }
      if (doc && doc.payload && typeof doc.payload === 'object') {
        _cachedState = doc.payload;
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_cachedState)); } catch (_) {}
        return _cachedState;
      }
    } catch (err) {
      console.warn('[DashboardState] Chargement DB indisponible, fallback local', err);
    }
    return null;
  }

  /* ── Capturer l'état courant ──────────────────────────── */
  function _captureState() {
    const state = { version: 1, timestamp: Date.now() };

    // 1. Graphiques masqués
    state.hiddenCharts = {};
    document.querySelectorAll('.chart-card[data-chart-id]').forEach(card => {
      if (card.classList.contains('hidden-chart') || card.classList.contains('hidden')) {
        state.hiddenCharts[card.dataset.chartId] = true;
      }
    });

    // 2. Sections repliées
    state.collapsedSections = [];
    document.querySelectorAll('.section-div.collapsed').forEach(div => {
      const label = div.querySelector('.section-lbl');
      if (label) state.collapsedSections.push(label.textContent.trim());
    });

    // 3. Filtres actifs (FilterManager)
    if (typeof FilterManager !== 'undefined' && FilterManager.getFilters) {
      state.filters = FilterManager.getFilters().map(f => ({
        type: f.type, value: f.value, label: f.label
      }));
    }

    // 4. Mode CA
    if (typeof AE !== 'undefined' && AE.getCAMode) {
      state.caMode = AE.getCAMode();
    }

    // 5. Année active
    const yearFilter = document.getElementById('year-filter');
    if (yearFilter) state.activeYear = yearFilter.value;

    // 6. Date field
    const dateField = document.getElementById('date-field-selector');
    if (dateField) state.dateField = dateField.value;

    return state;
  }

  /* ── Restaurer l'état ────────────────────────────────── */
  function _restoreState(state) {
    if (!state || !state.version) return;

    // 1. Graphiques masqués (via _chartVis si disponible)
    if (state.hiddenCharts && window._chartVis) {
      Object.keys(state.hiddenCharts).forEach(id => {
        if (state.hiddenCharts[id]) {
          const card = document.querySelector(`[data-chart-id="${id}"]`);
          if (card && !card.classList.contains('hidden-chart')) {
            card.classList.add('hidden-chart');
            const btn = card.querySelector('.chart-toggle-btn');
            if (btn) btn.classList.remove('active');
          }
        }
      });
      window._chartVis.update();
    }

    // 2. Sections repliées
    if (state.collapsedSections && state.collapsedSections.length) {
      document.querySelectorAll('.section-div').forEach(div => {
        const label = div.querySelector('.section-lbl');
        if (label && state.collapsedSections.includes(label.textContent.trim())) {
          div.classList.add('collapsed');
          const next = div.nextElementSibling;
          if (next && next.classList.contains('section-collapsible')) {
            next.classList.add('collapsed');
          }
        }
      });
    }

    // 3. Filtres (restaurés via FilterManager)
    if (state.filters && state.filters.length && typeof FilterManager !== 'undefined') {
      state.filters.forEach(f => {
        if (f.type && f.value) {
          FilterManager.toggleFilter(f.type, f.value, f.label || f.value);
        }
      });
    }

    // 4. Mode CA
    if (state.caMode && typeof AE !== 'undefined') {
      const selector = document.getElementById('ca-mode');
      if (selector) {
        selector.value = state.caMode;
        selector.dispatchEvent(new Event('change'));
      }
    }

    // 5. Année
    if (state.activeYear) {
      const yearFilter = document.getElementById('year-filter');
      if (yearFilter) {
        yearFilter.value = state.activeYear;
        yearFilter.dispatchEvent(new Event('change'));
      }
    }

    // 6. Date field
    if (state.dateField) {
      const dateField = document.getElementById('date-field-selector');
      if (dateField) {
        dateField.value = state.dateField;
        dateField.dispatchEvent(new Event('change'));
      }
    }

    console.log('[DashboardState] État restauré');
  }

  /* ── Auto-save avec debounce ─────────────────────────── */
  function _scheduleSave() {
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => {
      const state = _captureState();
      _write(state);
    }, DEBOUNCE_MS);
  }

  /* ── API publique ────────────────────────────────────── */
  function save() {
    const state = _captureState();
    _write(state);
    console.log('[DashboardState] Sauvegardé manuellement');
  }

  function reset() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    _cachedState = null;
    if (typeof DashboardSharedStore !== 'undefined') {
      DashboardSharedStore.remove(REMOTE_DOC_TYPE, _remoteDocKey(), REMOTE_SCOPE)
        .catch(function(err) { console.warn('[DashboardState] Suppression DB impossible', err); });
    }
    console.log('[DashboardState] État effacé — rechargement...');
    location.reload();
  }

  function getState() { return _load(); }

  function init() {
    if (_isInit) return;
    _isInit = true;

    // Restaurer l'état sauvegardé (après un délai pour laisser le DOM se charger)
    setTimeout(async function() {
      const remote = await _loadRemote();
      const state = (remote && remote.version) ? remote : _load();
      if (state && state.version) {
        _restoreState(state);
      }
    }, 500);

    // S'abonner aux changements pour auto-save
    if (typeof FilterManager !== 'undefined' && FilterManager.subscribe) {
      FilterManager.subscribe(_scheduleSave);
    }
    if (typeof AE !== 'undefined' && AE.subscribe) {
      AE.subscribe(_scheduleSave);
    }

    // Observer les mutations DOM (masquage graphiques, sections collapsées)
    const observer = new MutationObserver(_scheduleSave);
    const target = document.querySelector('.shell, main, body');
    if (target) {
      observer.observe(target, { attributes: true, subtree: true, attributeFilter: ['class'] });
    }

    console.log('[DashboardState] \u2705 Pr\u00EAt (v1.0) — auto-save activ\u00E9');
  }

  return { init, save, reset, getState };
})();
}
