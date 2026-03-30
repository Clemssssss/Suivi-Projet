(function() {
  'use strict';

  var _viewportRefreshTimer = null;
  var _viewportRefreshFallbackTimer = null;

  function syncShellPadding() {
    var hdr  = document.querySelector('.hdr');
    var bar  = document.getElementById('ctrl-bars-sticky');
    var shell = document.querySelector('.shell');
    if (!shell) return;
    var hdrH = hdr ? hdr.offsetHeight : 64;
    var barPos = bar ? window.getComputedStyle(bar).position : '';
    var barH = (bar && barPos === 'fixed') ? bar.offsetHeight : 0;
    shell.style.paddingTop = (hdrH + barH + 4) + 'px';
  }

  function refreshVisibleCharts() {
    var hadInstance = false;
    var canvases = Array.prototype.slice.call(document.querySelectorAll('.chart-card canvas[id], .business-chart-card canvas[id]'));

    canvases.forEach(function(canvas) {
      if (!canvas || canvas.offsetParent === null) return;
      var instance = null;
      try {
        if (typeof Chart !== 'undefined') {
          instance = (typeof Chart.getChart === 'function' ? Chart.getChart(canvas) : null)
            || Object.values(Chart.instances || {}).find(function(item) { return item && item.canvas === canvas; })
            || null;
        }
      } catch (_) {}

      if (!instance) return;
      hadInstance = true;
      try {
        instance.resize();
      } catch (_) {}
    });

    return hadInstance;
  }

  function scheduleViewportRefresh() {
    syncShellPadding();
    if (_viewportRefreshTimer) clearTimeout(_viewportRefreshTimer);
    if (_viewportRefreshFallbackTimer) clearTimeout(_viewportRefreshFallbackTimer);

    _viewportRefreshTimer = setTimeout(function() {
      var hadInstance = refreshVisibleCharts();
      setTimeout(refreshVisibleCharts, 90);
      setTimeout(refreshVisibleCharts, 220);

      _viewportRefreshFallbackTimer = setTimeout(function() {
        if (!hadInstance && typeof window.update === 'function') {
          try { window.update(); } catch (_) {}
        }
      }, 320);
    }, 40);
  }

  /* Exécution immédiate dès que le DOM est prêt */
  if (document.readyState !== 'loading') {
    requestAnimationFrame(syncShellPadding);
    setTimeout(syncShellPadding, 50);
    setTimeout(syncShellPadding, 300);
  } else {
    document.addEventListener('DOMContentLoaded', function() {
      requestAnimationFrame(syncShellPadding);
      setTimeout(syncShellPadding, 50);
      setTimeout(syncShellPadding, 300);
    });
  }

  /* ResizeObserver sur la barre : réajuste si les filtres wrappent */
  if (window.ResizeObserver) {
    var ro = new ResizeObserver(syncShellPadding);
    function observeWhenReady() {
      var bar = document.getElementById('ctrl-bars-sticky');
      if (bar) { ro.observe(bar); }
      else { setTimeout(observeWhenReady, 100); }
    }
    observeWhenReady();
  }
  window.addEventListener('resize', scheduleViewportRefresh);
  window.addEventListener('orientationchange', scheduleViewportRefresh);
  if (window.visualViewport && typeof window.visualViewport.addEventListener === 'function') {
    window.visualViewport.addEventListener('resize', scheduleViewportRefresh);
  }

  /* Hook update() */
  var _origU = window.update;
  if (typeof _origU === 'function') {
    window.update = function() {
      var r = _origU.apply(this, arguments);
      setTimeout(syncShellPadding, 100);
      return r;
    };
  }

  window._syncShellPadding = syncShellPadding;
  window._scheduleViewportRefresh = scheduleViewportRefresh;
})();
