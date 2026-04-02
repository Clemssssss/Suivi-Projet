(function() {
  'use strict';

  var STORAGE_KEY = 'chart_mobile_shell_v1';

  function isMobile() {
    return window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (_) {
      return {};
    }
  }

  function saveState(state) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state || {})); } catch (_) {}
  }

  function getState() {
    var state = loadState();
    return {
      actionsOpen: !!state.actionsOpen,
      filtersOpen: state.filtersOpen !== false,
      controlsCollapsed: !!state.controlsCollapsed
    };
  }

  function setButtonState(button, isOpen, labels) {
    if (!button) return;
    button.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    button.textContent = isOpen ? labels.open : labels.closed;
    button.classList.toggle('is-open', isOpen);
  }

  function applyState() {
    var body = document.body;
    if (!body) return;

    var actionsBtn = document.getElementById('mobile-actions-toggle');
    var filtersBtn = document.getElementById('mobile-filters-toggle');
    var controlsBtn = document.getElementById('ctrl-bars-toggle');
    var controlsBar = document.getElementById('ctrl-bars-sticky');

    if (!isMobile()) {
      body.classList.remove('mobile-shell-ready', 'mobile-actions-open', 'mobile-filters-open');
      setButtonState(actionsBtn, true, { open: '✕ Actions', closed: '☰ Actions' });
      setButtonState(filtersBtn, true, { open: '✕ Filtres', closed: '⚙ Filtres' });
      if (controlsBar) controlsBar.classList.toggle('is-minimized', getState().controlsCollapsed);
      if (controlsBtn) {
        var desktopCollapsed = getState().controlsCollapsed;
        controlsBtn.setAttribute('aria-expanded', desktopCollapsed ? 'false' : 'true');
        controlsBtn.textContent = desktopCollapsed ? '▸ Afficher' : '▾ Réduire';
      }
      if (typeof window._syncShellPadding === 'function') setTimeout(window._syncShellPadding, 30);
      if (typeof window._scheduleViewportRefresh === 'function') setTimeout(window._scheduleViewportRefresh, 60);
      return;
    }

    var state = getState();
    body.classList.add('mobile-shell-ready');
    body.classList.toggle('mobile-actions-open', state.actionsOpen);
    body.classList.toggle('mobile-filters-open', state.filtersOpen);
    if (controlsBar) controlsBar.classList.toggle('is-minimized', state.controlsCollapsed);
    setButtonState(actionsBtn, state.actionsOpen, { open: '✕ Actions', closed: '☰ Actions' });
    setButtonState(filtersBtn, state.filtersOpen, { open: '✕ Filtres', closed: '⚙ Filtres' });
    if (controlsBtn) {
      controlsBtn.setAttribute('aria-expanded', state.controlsCollapsed ? 'false' : 'true');
      controlsBtn.textContent = state.controlsCollapsed ? '▸ Afficher' : '▾ Réduire';
    }
    if (typeof window._syncShellPadding === 'function') setTimeout(window._syncShellPadding, 30);
    if (typeof window._scheduleViewportRefresh === 'function') setTimeout(window._scheduleViewportRefresh, 60);
  }

  function toggleKey(key) {
    var state = getState();
    state[key] = !state[key];
    saveState(state);
    applyState();
  }

  function ensureHeaderGroups() {
    var headerRight = document.querySelector('.hdr-right');
    if (!headerRight) return null;

    var actionsMain = headerRight.querySelector('.hdr-actions-main');
    var actionsMeta = headerRight.querySelector('.hdr-actions-meta');
    var actionsStatus = headerRight.querySelector('.hdr-actions-status');

    if (!actionsMain) {
      actionsMain = document.createElement('div');
      actionsMain.className = 'hdr-actions-main';
      headerRight.insertBefore(actionsMain, headerRight.firstChild || null);
    }
    if (!actionsMeta) {
      actionsMeta = document.createElement('div');
      actionsMeta.className = 'hdr-actions-meta';
      if (actionsStatus) headerRight.insertBefore(actionsMeta, actionsStatus);
      else headerRight.appendChild(actionsMeta);
    }

    Array.prototype.slice.call(headerRight.children).forEach(function(child) {
      if (!child || child === actionsMain || child === actionsMeta || child === actionsStatus) return;
      if (child.id === 'mobile-shell-toggles') return;
      if (child.id === 'project-count' || child.id === 'filter-micro' || child.classList.contains('hdr-pill') || child.classList.contains('filter-micro-badge')) {
        actionsMeta.appendChild(child);
        return;
      }
      actionsMain.appendChild(child);
    });

    return { headerRight: headerRight, actionsMain: actionsMain, actionsMeta: actionsMeta, actionsStatus: actionsStatus };
  }

  function injectToggles() {
    var groups = ensureHeaderGroups();
    var headerRight = groups && groups.headerRight ? groups.headerRight : document.querySelector('.hdr-right');
    if (!headerRight || document.getElementById('mobile-shell-toggles')) return;

    var wrap = document.createElement('div');
    wrap.id = 'mobile-shell-toggles';
    wrap.className = 'mobile-shell-toggles';

    var actionsBtn = document.createElement('button');
    actionsBtn.type = 'button';
    actionsBtn.id = 'mobile-actions-toggle';
    actionsBtn.className = 'mobile-shell-toggle-btn';
    actionsBtn.addEventListener('click', function() { toggleKey('actionsOpen'); });

    var filtersBtn = document.createElement('button');
    filtersBtn.type = 'button';
    filtersBtn.id = 'mobile-filters-toggle';
    filtersBtn.className = 'mobile-shell-toggle-btn';
    filtersBtn.addEventListener('click', function() { toggleKey('filtersOpen'); });

    wrap.appendChild(actionsBtn);
    wrap.appendChild(filtersBtn);
    headerRight.insertBefore(wrap, headerRight.firstChild || null);
  }

  function init() {
    ensureHeaderGroups();
    injectToggles();
    var controlsBtn = document.getElementById('ctrl-bars-toggle');
    if (controlsBtn && !controlsBtn._ctrlBarBound) {
      controlsBtn._ctrlBarBound = true;
      controlsBtn.addEventListener('click', function() { toggleKey('controlsCollapsed'); });
    }
    applyState();
  }

  window.addEventListener('resize', applyState);
  document.addEventListener('dashboard-auth-ready', function() { setTimeout(init, 20); });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
