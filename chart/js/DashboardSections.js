/**
 * ════════════════════════════════════════════════════════════════
 *  DASHBOARD SECTIONS v1.0 — Sections Repliables + Catégories
 * ════════════════════════════════════════════════════════════════
 *
 *  Fonctionnalités :
 *   ✅ Améliore les sections repliables existantes (.section-div)
 *   ✅ Remplace les onclick inline par des listeners centralisés
 *   ✅ Sauvegarde l'état ouvert/fermé dans localStorage
 *   ✅ Restaure l'état au rechargement
 *   ✅ Barre de navigation rapide entre sections (jump-bar)
 *   ✅ Bouton "Tout replier / Tout déplier" dans le header
 *   ✅ Animation fluide avec max-height calculée dynamiquement
 *   ✅ Compteur de graphiques visibles par section
 *
 *  Structure HTML attendue (déjà présente dans charts.html) :
 *   <div class="section-div">
 *     <span class="section-toggle">▼</span>
 *     <span class="section-lbl">Titre de section</span>
 *   </div>
 *   <div class="section-collapsible"> ... </div>
 *
 *  Usage :
 *   DashboardSections.init()
 *   DashboardSections.collapseAll()
 *   DashboardSections.expandAll()
 *
 *  Stockage clé : "dashboard_sections_state"
 * ════════════════════════════════════════════════════════════════
 */
if (!window.DashboardSections) {
window.DashboardSections = (() => {
  'use strict';

  const STORAGE_KEY = 'dashboard_sections_state';
  const REMOTE_SCOPE = 'chart';
  const REMOTE_DOC_TYPE = 'dashboard-sections';
  const REMOTE_DOC_KEY = 'shared';
  let _isInit = false;
  let _cachedState = null;

  /* ── Persistance ─────────────────────────────────────────────── */
  function _load() {
    if (_cachedState && typeof _cachedState === 'object') return _cachedState;
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
  }
  function _save(state) {
    _cachedState = state || {};
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
    if (typeof DashboardSharedStore !== 'undefined') {
      DashboardSharedStore.upsert(REMOTE_DOC_TYPE, REMOTE_DOC_KEY, _cachedState, REMOTE_SCOPE)
        .catch(function(err) { console.warn('[DashboardSections] Sync DB impossible', err); });
    }
  }
  async function _loadRemote() {
    if (typeof DashboardSharedStore === 'undefined') return null;
    try {
      var doc = await DashboardSharedStore.get(REMOTE_DOC_TYPE, REMOTE_DOC_KEY, REMOTE_SCOPE);
      if (doc && doc.payload && typeof doc.payload === 'object') {
        _cachedState = doc.payload;
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_cachedState)); } catch (_) {}
        return _cachedState;
      }
    } catch (err) {
      console.warn('[DashboardSections] Chargement DB indisponible, fallback local', err);
    }
    return null;
  }

  function _saveAll() {
    const state = {};
    document.querySelectorAll('.section-div').forEach(div => {
      const key = _getKey(div);
      state[key] = div.classList.contains('collapsed');
    });
    _save(state);
  }

  function _getKey(div) {
    const lbl = div.querySelector('.section-lbl');
    return lbl ? lbl.textContent.trim() : div.id || Math.random().toString(36).slice(2);
  }

  /* ── Toggle section ─────────────────────────────────────────── */
  function _toggle(div, forceState) {
    const collapsible = div.nextElementSibling;
    if (!collapsible || !collapsible.classList.contains('section-collapsible')) return;

    const shouldCollapse = forceState !== undefined ? forceState : !div.classList.contains('collapsed');

    if (shouldCollapse) {
      _collapse(div, collapsible);
    } else {
      _expand(div, collapsible);
    }

    _updateSectionCount(div);
    _saveAll();
  }

  function _collapse(div, collapsible) {
    // Capter la hauteur actuelle pour l'animation
    const h = collapsible.scrollHeight;
    collapsible.style.maxHeight = h + 'px';
    collapsible.style.overflow  = 'hidden';
    // Forcer le reflow
    void collapsible.offsetHeight;

    collapsible.style.transition = 'max-height .38s cubic-bezier(.4,0,.2,1), opacity .3s ease';
    collapsible.style.maxHeight  = '0px';
    collapsible.style.opacity    = '0';

    div.classList.add('collapsed');

    setTimeout(() => {
      collapsible.classList.add('collapsed');
      collapsible.style.maxHeight  = '';
      collapsible.style.transition = '';
    }, 390);
  }

  function _expand(div, collapsible) {
    collapsible.classList.remove('collapsed');
    collapsible.style.overflow  = 'hidden';
    collapsible.style.maxHeight = '0px';
    collapsible.style.opacity   = '0';

    div.classList.remove('collapsed');

    const targetH = collapsible.scrollHeight;
    void collapsible.offsetHeight;

    collapsible.style.transition = 'max-height .38s cubic-bezier(.4,0,.2,1), opacity .3s ease';
    collapsible.style.maxHeight  = targetH + 'px';
    collapsible.style.opacity    = '1';

    setTimeout(() => {
      collapsible.style.maxHeight  = 'none';
      collapsible.style.overflow   = '';
      collapsible.style.transition = '';
    }, 400);
  }

  /* ── Compteur graphiques par section ─────────────────────────── */
  function _updateSectionCount(div) {
    const collapsible = div.nextElementSibling;
    if (!collapsible) return;

    const visible = collapsible.querySelectorAll('.chart-card[data-chart-id]:not(.hidden)').length;
    let badge = div.querySelector('.section-count');

    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'section-count';
      badge.style.cssText = `
        margin-left:.5rem;
        background:rgba(0,212,170,.12);border:1px solid rgba(0,212,170,.25);
        color:#00d4aa;font-size:.6rem;font-family:'DM Mono',monospace;font-weight:700;
        padding:.08rem .4rem;border-radius:99px;vertical-align:middle;
        transition:opacity .2s;
      `;
      const lbl = div.querySelector('.section-lbl');
      if (lbl) lbl.appendChild(badge);
    }

    badge.textContent = visible > 0 ? visible : '';
    badge.style.display = visible > 0 ? '' : 'none';
  }

  function _updateAllCounts() {
    document.querySelectorAll('.section-div').forEach(_updateSectionCount);
  }

  /* ── Barre de navigation rapide ─────────────────────────────── */
  function _injectJumpBar() {
    if (document.getElementById('section-jump-bar')) return;

    const sections = Array.from(document.querySelectorAll('.section-div'));
    if (sections.length < 2) return;

    const bar = document.createElement('div');
    bar.id = 'section-jump-bar';
    bar.style.cssText = `
      position: sticky;
      top: 0;
      z-index: 200;
      display: flex;
      align-items: center;
      gap: .4rem;
      padding: .45rem 2.5rem;
      background: rgba(6,12,20,.92);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid rgba(255,255,255,.06);
      overflow-x: auto;
      scrollbar-width: none;
      flex-wrap: wrap;
    `;

    // Boutons "Tout replier / Tout déplier"
    const globalDiv = document.createElement('div');
    globalDiv.style.cssText = 'display:flex;gap:.3rem;margin-right:.5rem;flex-shrink:0;';

    ['Tout replier', 'Tout déplier'].forEach((label, i) => {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.style.cssText = `
        background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);
        color:#6b7f96;font-size:.62rem;font-family:'DM Mono',monospace;
        padding:.22rem .6rem;border-radius:5px;cursor:pointer;
        transition:all .15s;white-space:nowrap;
      `;
      btn.addEventListener('click', () => i === 0 ? collapseAll() : expandAll());
      btn.addEventListener('mouseenter', () => { btn.style.color = '#9fb3c8'; btn.style.background = 'rgba(255,255,255,.09)'; });
      btn.addEventListener('mouseleave', () => { btn.style.color = '#6b7f96'; btn.style.background = 'rgba(255,255,255,.05)'; });
      globalDiv.appendChild(btn);
    });
    bar.appendChild(globalDiv);

    // Séparateur
    const sep = document.createElement('div');
    sep.style.cssText = 'width:1px;height:16px;background:rgba(255,255,255,.1);margin:0 .3rem;flex-shrink:0;';
    bar.appendChild(sep);

    // Boutons de jump par section
    sections.forEach(div => {
      const lbl = div.querySelector('.section-lbl');
      if (!lbl) return;

      const btn = document.createElement('button');
      btn.dataset.sectionKey = _getKey(div);
      btn.textContent        = lbl.textContent.replace(/\s*\d+$/, '').trim().substring(0, 28);
      btn.style.cssText = `
        background: transparent;
        border: 1px solid rgba(255,255,255,.06);
        color: #5a7089;
        font-size: .62rem;
        font-family: 'DM Mono', monospace;
        padding: .22rem .65rem;
        border-radius: 5px;
        cursor: pointer;
        transition: all .15s;
        white-space: nowrap;
        flex-shrink: 0;
      `;

      btn.addEventListener('click', () => {
        // Déplier si replié
        if (div.classList.contains('collapsed')) _toggle(div, false);
        // Scroll vers la section
        div.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });

      btn.addEventListener('mouseenter', () => {
        btn.style.color = '#00d4aa';
        btn.style.borderColor = 'rgba(0,212,170,.3)';
        btn.style.background = 'rgba(0,212,170,.06)';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.color = '#5a7089';
        btn.style.borderColor = 'rgba(255,255,255,.06)';
        btn.style.background = 'transparent';
      });

      bar.appendChild(btn);
    });

    // Insérer avant le premier section-div
    const firstSection = document.querySelector('.section-div');
    if (firstSection) {
      firstSection.parentElement.insertBefore(bar, firstSection);
    }
  }

  /* ── Mettre en évidence la section active (scroll) ─────────── */
  function _setupScrollSpy() {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const div = entry.target;
        const key = _getKey(div);
        document.querySelectorAll('#section-jump-bar button[data-section-key]').forEach(btn => {
          const isActive = btn.dataset.sectionKey === key;
          btn.style.color       = isActive ? '#00d4aa' : '#5a7089';
          btn.style.borderColor = isActive ? 'rgba(0,212,170,.3)' : 'rgba(255,255,255,.06)';
          btn.style.background  = isActive ? 'rgba(0,212,170,.06)' : 'transparent';
        });
      });
    }, { rootMargin: '-40px 0px -60% 0px' });

    document.querySelectorAll('.section-div').forEach(div => observer.observe(div));
  }

  /* ── Améliorer les section-div existants ─────────────────────── */
  function _enhanceSections() {
    document.querySelectorAll('.section-div').forEach(div => {
      // Supprimer l'ancien onclick inline
      div.removeAttribute('onclick');

      // Éviter les doubles listeners
      if (div._sectionEnhanced) return;
      div._sectionEnhanced = true;

      // S'assurer que le toggle SVG/icône est présent
      let toggle = div.querySelector('.section-toggle');
      if (!toggle) {
        toggle = document.createElement('span');
        toggle.className = 'section-toggle';
        toggle.textContent = '▼';
        div.prepend(toggle);
      }

      // Améliorer le style de la section
      div.style.cssText += `
        display: flex;
        align-items: center;
        cursor: pointer;
        user-select: none;
      `;

      div.addEventListener('click', e => {
        // Ne pas toggle si on clique sur un bouton enfant
        if (e.target.tagName === 'BUTTON' || e.target.tagName === 'A') return;
        _toggle(div);
      });

      // Compteur initial
      _updateSectionCount(div);
    });
  }

  /* ── Restaurer l'état sauvegardé ────────────────────────────── */
  function _restoreState() {
    const state = _load();
    if (!state || !Object.keys(state).length) return;

    document.querySelectorAll('.section-div').forEach(div => {
      const key       = _getKey(div);
      const collapsed = state[key];
      if (collapsed === true && !div.classList.contains('collapsed')) {
        const collapsible = div.nextElementSibling;
        if (collapsible && collapsible.classList.contains('section-collapsible')) {
          div.classList.add('collapsed');
          collapsible.classList.add('collapsed');
          collapsible.style.maxHeight = '0';
          collapsible.style.opacity   = '0';
        }
      }
    });
  }

  /* ── API publique ────────────────────────────────────────────── */
  function collapseAll() {
    document.querySelectorAll('.section-div').forEach(div => _toggle(div, true));
  }

  function expandAll() {
    document.querySelectorAll('.section-div').forEach(div => _toggle(div, false));
  }

  function toggle(sectionLabel) {
    const divs = Array.from(document.querySelectorAll('.section-div'));
    const target = divs.find(d => {
      const lbl = d.querySelector('.section-lbl');
      return lbl && lbl.textContent.trim().includes(sectionLabel);
    });
    if (target) _toggle(target);
  }

  function init() {
    if (_isInit) return;
    _isInit = true;

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', _setup);
    } else {
      setTimeout(_setup, 200);
    }
  }

  async function _setup() {
    await _loadRemote();
    _enhanceSections();
    _restoreState();
    _injectJumpBar();
    _setupScrollSpy();

    // Mettre à jour les compteurs quand les filtres changent
    if (typeof FilterManager !== 'undefined' && FilterManager.subscribe) {
      FilterManager.subscribe(() => setTimeout(_updateAllCounts, 50));
    }

    // Observer l'ajout/masquage de cartes
    const observer = new MutationObserver(() => _updateAllCounts());
    document.querySelectorAll('.charts-grid, .section-collapsible').forEach(el => {
      observer.observe(el, { childList: true, attributes: true, attributeFilter: ['class'], subtree: true });
    });

    console.log('[DashboardSections] ✅ Prêt (v1.0) — Sections + Jump Bar + Persistance');
  }

  return { init, collapseAll, expandAll, toggle };
})();
}
