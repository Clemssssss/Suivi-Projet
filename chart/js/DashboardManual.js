if (!window.DashboardManual) {
window.DashboardManual = (() => {
  'use strict';

  function qs(id) {
    return document.getElementById(id);
  }

  function setOpen(open) {
    var modal = qs('manual-modal');
    if (!modal) return;
    modal.classList.toggle('is-open', !!open);
    modal.setAttribute('aria-hidden', open ? 'false' : 'true');
    document.body.style.overflow = open ? 'hidden' : '';
  }

  function openManual() {
    setOpen(true);
  }

  function closeManual() {
    setOpen(false);
  }

  function bind() {
    var openBtn = qs('btn-open-manual');
    var closeBtn = qs('btn-close-manual');
    var modal = qs('manual-modal');
    if (openBtn && !openBtn._manualBound) {
      openBtn._manualBound = true;
      openBtn.addEventListener('click', openManual);
    }
    if (closeBtn && !closeBtn._manualBound) {
      closeBtn._manualBound = true;
      closeBtn.addEventListener('click', closeManual);
    }
    if (modal && !modal._manualBound) {
      modal._manualBound = true;
      modal.addEventListener('click', function(e) {
        if (e.target && e.target.getAttribute && e.target.getAttribute('data-manual-close') === '1') {
          closeManual();
        }
      });
    }
    if (!document._manualEscBound) {
      document._manualEscBound = true;
      document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') closeManual();
      });
    }
  }

  function init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bind);
    } else {
      bind();
    }
  }

  init();

  return {
    open: openManual,
    close: closeManual
  };
})();
}
