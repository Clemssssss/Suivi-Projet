(function() {
  'use strict';

  function syncShellPadding() {
    var hdr  = document.querySelector('.hdr');
    var bar  = document.getElementById('ctrl-bars-sticky');
    var shell = document.querySelector('.shell');
    if (!shell) return;
    var hdrH = hdr ? hdr.offsetHeight : 64;
    var barH = bar ? bar.offsetHeight : 0;
    shell.style.paddingTop = (hdrH + barH + 4) + 'px';
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
  window.addEventListener('resize', syncShellPadding);

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
})();
