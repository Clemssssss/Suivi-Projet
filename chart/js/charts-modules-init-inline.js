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

  // Initialiser les nouveaux modules après le chargement complet
  function initV3Modules() {
    if (typeof ChartEditor !== 'undefined') ChartEditor.init();
    if (typeof DashboardState !== 'undefined') DashboardState.init();
    if (typeof DashboardUX !== 'undefined') DashboardUX.init();
    if (typeof DashboardDnD !== 'undefined') DashboardDnD.init();
    if (typeof DashboardSections !== 'undefined') DashboardSections.init();
    if (typeof DashboardNotes !== 'undefined') DashboardNotes.init();
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
