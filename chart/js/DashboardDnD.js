/**
 * ════════════════════════════════════════════════════════════════
 *  DASHBOARD DnD v2.0 — Drag & Drop fluide + Redimensionnement
 * ════════════════════════════════════════════════════════════════
 *
 *  Architecture v2.0 : "Ghost in-flow"
 *  ─────────────────────────────────────────────────────────────
 *  La carte draggée RESTE dans le flux du grid CSS pendant toute
 *  la durée du drag. On déplace uniquement un clone visuel (ghost)
 *  en position fixe. Cela évite :
 *    • Le reflow erratique de la grille
 *    • Les sauts de placeholder
 *    • Le bug ownerDocument (Chart.js)
 *    • La perte de gridColumn/taille au drop
 *
 *  Algorithme de réordonnancement :
 *    1. Le ghost flotte sous le curseur (position:fixed)
 *    2. En live, la carte source est swappée dans le grid
 *       vers la position la plus proche du curseur
 *    3. Au drop : snap animé du ghost → position finale, puis cleanup
 *
 *  Fonctionnalités :
 *   ✅ Drag fluide — ghost fixe, grid stable
 *   ✅ Carte source dimmée in-place (indique l'origine)
 *   ✅ Snap animé au drop
 *   ✅ Seuil de déclenchement (évite drag accidentel)
 *   ✅ Boutons S/M/L/⬛ resize animé
 *   ✅ Sauvegarde ordre + tailles dans localStorage
 *   ✅ Restauration au rechargement
 *   ✅ Touch support
 *   ✅ Chart.js compatible (pas de ownerDocument error)
 * ════════════════════════════════════════════════════════════════
 */
if (!window.DashboardDnD) {
window.DashboardDnD = (() => {
  'use strict';

  const STORAGE_KEY  = 'dashboard_dnd_state_v2';
  const DEBOUNCE_MS  = 600;
  const DRAG_THRESH  = 6;   // px avant activation
  let _saveTimer     = null;
  let _isInit        = false;

  /* ══════════════════════════════════════════════════════
     TAILLES
  ══════════════════════════════════════════════════════ */
  const SIZES = {
    small:  { label: 'S',  title: 'Petit',         gridColumn: 'span 1', height: '220px' },
    medium: { label: 'M',  title: 'Moyen',          gridColumn: 'span 1', height: '300px' },
    large:  { label: 'L',  title: 'Grand',          gridColumn: 'span 2', height: '380px' },
    full:   { label: '\u2B1B', title: 'Pleine largeur', gridColumn: '1 / -1', height: '420px' },
  };
  const SIZE_KEYS    = Object.keys(SIZES);
  const SIZE_DEFAULT = 'medium';

  /* ══════════════════════════════════════════════════════
     PERSISTANCE
  ══════════════════════════════════════════════════════ */
  function _load() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
  }
  function _write(data) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) {
      console.warn('[DashboardDnD] localStorage:', e);
    }
  }
  function _scheduleSave() {
    if (_saveTimer) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(_doSave, DEBOUNCE_MS);
  }
  function _doSave() {
    const state = { version: 2, grids: {} };
    document.querySelectorAll('.charts-grid').forEach((grid, gi) => {
      const key = grid.id || ('grid_' + gi);
      state.grids[key] = [];
      grid.querySelectorAll('.chart-card[data-chart-id]').forEach(card => {
        state.grids[key].push({ id: card.dataset.chartId, size: card.dataset.dndSize || SIZE_DEFAULT });
      });
    });
    _write(state);
    if (typeof DashboardState !== 'undefined' && DashboardState.save) DashboardState.save();
  }

  /* ══════════════════════════════════════════════════════
     RESTAURATION
  ══════════════════════════════════════════════════════ */
  function _restore() {
    const state = _load();
    if (!state || !state.grids) return;
    document.querySelectorAll('.charts-grid').forEach((grid, gi) => {
      const key   = grid.id || ('grid_' + gi);
      const saved = state.grids[key];
      if (!saved || !saved.length) return;
      const frag     = document.createDocumentFragment();
      const restored = new Set();
      saved.forEach(function(item) {
        const card = grid.querySelector('[data-chart-id="' + item.id + '"]');
        if (card) { _applySize(card, item.size, false); frag.appendChild(card); restored.add(item.id); }
      });
      grid.querySelectorAll('.chart-card[data-chart-id]').forEach(card => {
        if (!restored.has(card.dataset.chartId)) frag.appendChild(card);
      });
      grid.appendChild(frag);
    });
    console.log('[DashboardDnD] Layout restaure');
  }

  /* ══════════════════════════════════════════════════════
     REDIMENSIONNEMENT
  ══════════════════════════════════════════════════════ */
  function _applySize(card, sizeKey, animate) {
    if (animate === undefined) animate = true;
    const s = SIZES[sizeKey] || SIZES[SIZE_DEFAULT];
    card.dataset.dndSize  = sizeKey;
    card.style.gridColumn = s.gridColumn;

    const container = card.querySelector('.chart-container');
    if (container) {
      if (animate) {
        container.style.transition = 'height .28s cubic-bezier(.4,0,.2,1)';
        setTimeout(function() { container.style.transition = ''; }, 320);
      }
      container.style.height = s.height;
    }

    card.querySelectorAll('.dnd-size-btn').forEach(function(btn) {
      const active = btn.dataset.size === sizeKey;
      btn.classList.toggle('active', active);
      btn.style.background = active ? 'rgba(0,212,170,.18)' : 'transparent';
      btn.style.color      = active ? '#00d4aa'             : 'rgba(159,179,200,.5)';
    });

    if (animate) setTimeout(function() { _resizeChart(card); }, 340);
  }

  function _resizeChart(card) {
    const canvas = card.querySelector('canvas');
    if (!canvas || typeof Chart === 'undefined') return;
    try {
      const inst = (Chart.getChart ? Chart.getChart(canvas) : null)
        || Object.values(Chart.instances || {}).find(function(i) { return i.canvas === canvas; });
      if (inst) inst.resize();
    } catch (_) {}
  }

  /* ══════════════════════════════════════════════════════
     INJECTION CONTROLS
  ══════════════════════════════════════════════════════ */
  function _injectControls(card) {
    if (card.querySelector('.dnd-controls')) return;
    const curSize = card.dataset.dndSize || SIZE_DEFAULT;
    const actions = card.querySelector('.chart-title-actions, .chart-header');
    if (!actions) return;

    const handle = document.createElement('span');
    handle.className = 'dnd-handle';
    handle.title     = 'Deplacer';
    handle.innerHTML = '\u2807'; // ⠷ braille 6 dots
    handle.setAttribute('aria-hidden', 'true');

    const sizeBar = document.createElement('div');
    sizeBar.className = 'dnd-controls';

    SIZE_KEYS.forEach(function(key) {
      const btn = document.createElement('button');
      btn.className    = 'dnd-size-btn';
      btn.dataset.size = key;
      btn.title        = SIZES[key].title;
      btn.textContent  = SIZES[key].label;
      const active = (key === curSize);
      btn.classList.toggle('active', active);
      btn.style.background = active ? 'rgba(0,212,170,.18)' : 'transparent';
      btn.style.color      = active ? '#00d4aa' : 'rgba(159,179,200,.5)';
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        _applySize(card, key);
        _scheduleSave();
      });
      btn.addEventListener('mouseenter', function() {
        if (!btn.classList.contains('active')) { btn.style.background = 'rgba(255,255,255,.06)'; btn.style.color = '#9fb3c8'; }
      });
      btn.addEventListener('mouseleave', function() {
        if (!btn.classList.contains('active')) { btn.style.background = 'transparent'; btn.style.color = 'rgba(159,179,200,.5)'; }
      });
      sizeBar.appendChild(btn);
    });

    const firstBtn = actions.querySelector('button');
    if (firstBtn && firstBtn.parentNode === actions) {
      actions.insertBefore(handle, firstBtn);
      const ref = actions.querySelector('button:not(.dnd-handle)');
      if (ref && ref.parentNode === actions) actions.insertBefore(sizeBar, ref);
      else actions.appendChild(sizeBar);
    } else {
      actions.appendChild(handle);
      actions.appendChild(sizeBar);
    }
  }

  /* ══════════════════════════════════════════════════════
     DRAG & DROP CORE — "Ghost in-flow"
  ══════════════════════════════════════════════════════ */
  var _dnd = null;

  function _makeDraggable(card) {
    const handle = card.querySelector('.dnd-handle');
    if (!handle || card._dndBound) return;
    card._dndBound = true;
    handle.addEventListener('mousedown',   function(e) { _onDown(e, card); });
    handle.addEventListener('touchstart',  function(e) { _onDown(e, card); }, { passive: false });
  }

  function _onDown(e, card) {
    const pt = e.touches ? e.touches[0] : e;
    if (!e.touches && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    _dnd = {
      card:       card,
      grid:       card.parentElement,
      startX:     pt.clientX,
      startY:     pt.clientY,
      started:    false,
      ghost:      null,
      offsetX:    0,
      offsetY:    0,
      lastTarget: null,
      swapTimer:  null,
    };

    document.addEventListener('mousemove',   _onMove, { passive: false });
    document.addEventListener('mouseup',     _onUp);
    document.addEventListener('touchmove',   _onMove, { passive: false });
    document.addEventListener('touchend',    _onUp);
    document.addEventListener('touchcancel', _onUp);
  }

  function _startGhost() {
    const card = _dnd.card;
    const rect = card.getBoundingClientRect();

    // Ghost : rectangle visuel flottant
    const ghost = document.createElement('div');
    ghost.className = 'dnd-ghost';

    const titleEl = card.querySelector('.chart-title');
    const titleTxt = titleEl ? titleEl.textContent.replace(/\u24d8/g,'').trim() : '';

    ghost.style.cssText = [
      'position:fixed',
      'left:' + rect.left + 'px',
      'top:'  + rect.top  + 'px',
      'width:'  + rect.width  + 'px',
      'height:' + rect.height + 'px',
      'z-index:9999',
      'pointer-events:none',
      'border-radius:12px',
      'background:linear-gradient(150deg,rgba(0,30,25,.92),rgba(0,20,35,.92))',
      'border:2px solid rgba(0,212,170,.55)',
      'box-shadow:0 28px 72px rgba(0,0,0,.75),0 0 0 1px rgba(0,212,170,.18),inset 0 1px 0 rgba(0,212,170,.1)',
      'transition:none',
      'will-change:left,top',
      'overflow:hidden',
    ].join(';');

    ghost.innerHTML =
      '<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;' +
      'justify-content:center;gap:.5rem;padding:1.5rem;">' +
      '<span style="font-size:1.5rem;opacity:.4;">\u2807\u2807</span>' +
      '<span style="font-size:.82rem;font-weight:700;color:rgba(0,212,170,.85);text-align:center;' +
      'font-family:system-ui,sans-serif;text-shadow:0 2px 8px rgba(0,0,0,.8);max-width:90%;' +
      'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' +
      titleTxt + '</span>' +
      '<span style="font-size:.65rem;color:rgba(0,212,170,.4);font-family:monospace;">glisser pour repositionner</span>' +
      '</div>' +
      // shimmer line at top
      '<div style="position:absolute;top:0;left:0;right:0;height:2px;' +
      'background:linear-gradient(90deg,transparent,rgba(0,212,170,.6),transparent);' +
      'animation:dnd-shimmer 1.8s ease-in-out infinite;"></div>';

    document.body.appendChild(ghost);

    // Dimmer la carte source
    card.classList.add('dnd-dragging');

    _dnd.ghost   = ghost;
    _dnd.offsetX = _dnd.startX - rect.left;
    _dnd.offsetY = _dnd.startY - rect.top;

    document.body.classList.add('dnd-active');
  }

  function _onMove(e) {
    if (!_dnd) return;
    const pt = e.touches ? e.touches[0] : e;
    if (e.cancelable) e.preventDefault();

    const dx = pt.clientX - _dnd.startX;
    const dy = pt.clientY - _dnd.startY;

    if (!_dnd.started) {
      if (Math.hypot(dx, dy) < DRAG_THRESH) return;
      _dnd.started = true;
      _startGhost();
    }

    // Positionner le ghost exactement sous le curseur
    _dnd.ghost.style.left = (pt.clientX - _dnd.offsetX) + 'px';
    _dnd.ghost.style.top  = (pt.clientY - _dnd.offsetY) + 'px';

    // Réordonner en live (debouncé par rAF)
    if (!_dnd._rafPending) {
      _dnd._rafPending = true;
      requestAnimationFrame(function() {
        if (_dnd) {
          _liveReorder(pt.clientX, pt.clientY);
          _dnd._rafPending = false;
        }
      });
    }
  }

  function _liveReorder(cx, cy) {
    const { card, grid } = _dnd;
    const cards = Array.from(grid.querySelectorAll('.chart-card[data-chart-id]'))
      .filter(function(c) { return c !== card; });

    if (!cards.length) return;

    var best = null, bestDist = Infinity;
    cards.forEach(function(c) {
      const r  = c.getBoundingClientRect();
      const mx = r.left + r.width  * 0.5;
      const my = r.top  + r.height * 0.5;
      const d  = Math.hypot(cx - mx, cy - my);
      if (d < bestDist) { bestDist = d; best = { c: c, r: r, mx: mx, my: my }; }
    });

    if (!best) return;

    // Zone d'attraction = 42% du rayon de la carte cible
    const attract = Math.min(best.r.width, best.r.height) * 0.42;
    if (bestDist > attract) return;

    if (_dnd.lastTarget === best.c) return;
    _dnd.lastTarget = best.c;

    // Insertion : avant si curseur au-dessus du centre, après sinon
    const before = cy < best.my - 8 || (Math.abs(cy - best.my) <= 8 && cx < best.mx);
    const ref    = before ? best.c : best.c.nextSibling;

    if (ref === card || ref === card.nextSibling) return;
    grid.insertBefore(card, ref || null);
  }

  function _onUp() {
    document.removeEventListener('mousemove',   _onMove);
    document.removeEventListener('mouseup',     _onUp);
    document.removeEventListener('touchmove',   _onMove);
    document.removeEventListener('touchend',    _onUp);
    document.removeEventListener('touchcancel', _onUp);
    document.body.classList.remove('dnd-active');
    document.body.style.userSelect = '';
    document.body.style.cursor     = '';

    if (!_dnd) return;
    const { card, ghost, started } = _dnd;
    const state = _dnd;
    _dnd = null;

    if (!started) return; // simple clic sans drag

    // Snap animé : ghost vers la position finale de la carte
    const finalRect = card.getBoundingClientRect();
    ghost.style.transition = [
      'left .2s cubic-bezier(.4,0,.2,1)',
      'top .2s cubic-bezier(.4,0,.2,1)',
      'opacity .18s ease',
      'transform .2s ease',
      'box-shadow .2s ease',
    ].join(',');
    ghost.style.left      = finalRect.left + 'px';
    ghost.style.top       = finalRect.top  + 'px';
    ghost.style.opacity   = '0';
    ghost.style.transform = 'scale(0.97)';
    ghost.style.boxShadow = '0 4px 20px rgba(0,0,0,.3)';

    setTimeout(function() {
      ghost.remove();
      card.classList.remove('dnd-dragging');
      // Réappliquer gridColumn (conservé car carte restait in-flow, mais sécurité)
      const sz = card.dataset.dndSize || SIZE_DEFAULT;
      card.style.gridColumn = SIZES[sz].gridColumn;
      _resizeChart(card);
      _scheduleSave();
    }, 220);
  }

  /* ══════════════════════════════════════════════════════
     CSS
  ══════════════════════════════════════════════════════ */
  function _injectCSS() {
    if (document.getElementById('dnd-styles')) return;
    const style = document.createElement('style');
    style.id = 'dnd-styles';
    style.textContent = `
      .dnd-handle {
        cursor: grab !important;
        color: rgba(159,179,200,.28);
        font-size: 1.1rem;
        line-height: 1;
        padding: .1rem .26rem;
        border-radius: 4px;
        transition: color .15s, background .15s;
        user-select: none;
        flex-shrink: 0;
        display: inline-flex;
        align-items: center;
      }
      .dnd-handle:hover {
        color: rgba(0,212,170,.9) !important;
        background: rgba(0,212,170,.07);
      }
      .dnd-handle:active { cursor: grabbing !important; }

      .dnd-controls {
        display: inline-flex;
        gap: 2px;
        align-items: center;
        background: rgba(255,255,255,.04);
        border: 1px solid rgba(255,255,255,.07);
        border-radius: 6px;
        padding: 2px;
        flex-shrink: 0;
      }
      .dnd-size-btn {
        background: transparent;
        border: none;
        color: rgba(159,179,200,.5);
        font-size: .62rem;
        font-family: 'DM Mono', monospace;
        font-weight: 700;
        padding: .12rem .32rem;
        border-radius: 4px;
        cursor: pointer;
        transition: background .12s, color .12s;
        line-height: 1;
      }
      .dnd-size-btn.active {
        background: rgba(0,212,170,.18) !important;
        color: #00d4aa !important;
      }
      .dnd-size-btn:hover:not(.active) {
        background: rgba(255,255,255,.06);
        color: #9fb3c8;
      }

      /* Carte source dimmée pendant le drag */
      .chart-card.dnd-dragging {
        opacity: 0.22 !important;
        transform: scale(0.982) !important;
        transition: opacity .15s, transform .15s !important;
        pointer-events: none !important;
        outline: 2px dashed rgba(0,212,170,.25);
        outline-offset: 4px;
      }

      /* Ghost flottant */
      .dnd-ghost { overflow: hidden; }

      @keyframes dnd-shimmer {
        0%   { transform: translateX(-100%); }
        100% { transform: translateX(100%);  }
      }

      /* Tailles */
      .chart-card[data-dnd-size="small"]  { grid-column: span 1; }
      .chart-card[data-dnd-size="medium"] { grid-column: span 1; }
      .chart-card[data-dnd-size="large"]  { grid-column: span 2; }
      .chart-card[data-dnd-size="full"]   { grid-column: 1 / -1; }

      .chart-card[data-dnd-size="small"]  .chart-container { height: 220px; }
      .chart-card[data-dnd-size="medium"] .chart-container { height: 300px; }
      .chart-card[data-dnd-size="large"]  .chart-container { height: 380px; }
      .chart-card[data-dnd-size="full"]   .chart-container { height: 420px; }

      body.dnd-active { user-select: none !important; cursor: grabbing !important; }
    `;
    document.head.appendChild(style);
  }

  /* ══════════════════════════════════════════════════════
     SETUP & API
  ══════════════════════════════════════════════════════ */
  function _setup() {
    _injectCSS();
    document.querySelectorAll('.chart-card[data-chart-id]').forEach(function(card) {
      _injectControls(card);
      _makeDraggable(card);
    });
    _restore();

    const obs = new MutationObserver(function(muts) {
      muts.forEach(function(m) {
        m.addedNodes.forEach(function(node) {
          if (node.nodeType !== 1) return;
          if (node.matches && node.matches('.chart-card[data-chart-id]')) {
            _injectControls(node); _makeDraggable(node);
          }
          if (node.querySelectorAll) {
            node.querySelectorAll('.chart-card[data-chart-id]').forEach(function(c) {
              _injectControls(c); _makeDraggable(c);
            });
          }
        });
      });
    });
    document.querySelectorAll('.charts-grid').forEach(function(g) {
      obs.observe(g, { childList: true });
    });
    console.log('[DashboardDnD] \u2705 Pr\u00EAt v2.0 \u2014 Ghost in-flow');
  }

  function init() {
    if (_isInit) return;
    _isInit = true;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() { setTimeout(_setup, 400); });
    } else {
      setTimeout(_setup, 400);
    }
  }
  function save()  { _doSave(); }
  function reset() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
    document.querySelectorAll('.chart-card[data-chart-id]').forEach(function(card) {
      _applySize(card, SIZE_DEFAULT, false);
    });
  }
  function applySize(cardId, sizeKey) {
    const card = document.querySelector('[data-chart-id="' + cardId + '"]');
    if (card) { _applySize(card, sizeKey); _scheduleSave(); }
  }

  return { init, save, reset, applySize };
})();
}
