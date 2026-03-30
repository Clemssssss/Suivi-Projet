(function() {
  'use strict';
  function waitForAuthReady(callback, attempt) {
    var tries = typeof attempt === 'number' ? attempt : 0;
    var guardMissing = typeof window.DashboardAuthGuard === 'undefined';
    var authReady = document.documentElement.classList.contains('auth-ready');

    if (guardMissing || authReady) {
      callback();
      return;
    }

    if (tries > 80) {
      console.warn('[ModulesInit] Auth non confirmée, initialisation annulée');
      return;
    }

    setTimeout(function() { waitForAuthReady(callback, tries + 1); }, 150);
  }

  function bindStaticUiActions() {
    document.querySelectorAll('[data-section-toggle="1"]').forEach(function(div) {
      if (div._sectionToggleBound) return;
      div._sectionToggleBound = true;
      div.addEventListener('click', function() {
        this.classList.toggle('collapsed');
        var next = this.nextElementSibling;
        if (next && next.classList.contains('section-collapsible')) next.classList.toggle('collapsed');
      });
    });

    var btnShare = document.getElementById('btn-bottom-share');
    if (btnShare && !btnShare._boundBottomAction) {
      btnShare._boundBottomAction = true;
      btnShare.addEventListener('click', function() {
        if (typeof DashboardUX !== 'undefined' && typeof DashboardUX.copyShareLink === 'function') {
          DashboardUX.copyShareLink();
        }
      });
    }

    var btnSave = document.getElementById('btn-bottom-save');
    if (btnSave && !btnSave._boundBottomAction) {
      btnSave._boundBottomAction = true;
      btnSave.addEventListener('click', function() {
        if (typeof DashboardState !== 'undefined' && typeof DashboardState.save === 'function') {
          DashboardState.save();
        }
      });
    }

    var btnReset = document.getElementById('btn-bottom-reset');
    if (btnReset && !btnReset._boundBottomAction) {
      btnReset._boundBottomAction = true;
      btnReset.addEventListener('click', function() {
        if (typeof DashboardState !== 'undefined' && typeof DashboardState.reset === 'function') {
          DashboardState.reset();
        }
      });
    }
  }

  // Initialiser les nouveaux modules après le chargement complet
  function initV3Modules() {
    bindStaticUiActions();
    if (typeof ChartEditor !== 'undefined') ChartEditor.init();
    if (typeof DashboardState !== 'undefined') DashboardState.init();
    if (typeof DashboardUX !== 'undefined') DashboardUX.init();
    if (typeof DashboardDnD !== 'undefined') DashboardDnD.init();
    if (typeof DashboardSections !== 'undefined') DashboardSections.init();
    if (typeof DashboardNotes !== 'undefined') DashboardNotes.init();
    if (typeof DashboardChartPreferences !== 'undefined') DashboardChartPreferences.init();
    if (typeof DashboardLocalData !== 'undefined') DashboardLocalData.bindUi();
    console.log('%c🚀 Cahors Analytics v3.0 — Tous les modules chargés', 'color:#00d4aa;font-weight:700;font-size:1rem');
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      setTimeout(function() { waitForAuthReady(initV3Modules); }, 800);
    });
  } else {
    setTimeout(function() { waitForAuthReady(initV3Modules); }, 800);
  }
})();
