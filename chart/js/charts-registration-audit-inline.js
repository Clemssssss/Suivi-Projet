(function() {
  'use strict';
  function _auditChartRegistration() {
    if (typeof ChartFilterController === 'undefined') {
      console.warn('[Audit] ChartFilterController non disponible — audit ignoré');
      return;
    }
    const registered = new Set(ChartFilterController.getRegisteredCharts ? ChartFilterController.getRegisteredCharts() : []);
    const canvases   = Array.from(document.querySelectorAll('canvas[id]'))
      .filter(c => !c.closest('#business-dashboard-root'))
      .filter(c => {
        // Vérifier que c'est bien un graphique Chart.js
        if (typeof Chart !== 'undefined') {
          if (typeof Chart.getChart === 'function' && Chart.getChart(c)) return true;
          if (Chart.instances && Object.values(Chart.instances).find(i => i.canvas === c)) return true;
        }
        if (typeof ChartsEnrichis !== 'undefined' && ChartsEnrichis.charts && ChartsEnrichis.charts[c.id]) return true;
        return false;
      });

    let unregistered = 0;
    canvases.forEach(c => {
      if (!registered.has(c.id)) {
        console.warn(`%c[Audit] ⚠️ Chart non enregistré dans ChartFilterController : ${c.id}`, 'color:#f5b740;font-weight:600');
        unregistered++;
      }
    });

    if (unregistered === 0) {
      console.log(`%c[Audit] ✅ Tous les graphiques (${canvases.length}) sont enregistrés dans ChartFilterController`, 'color:#00d4aa;font-weight:600');
    } else {
      console.warn(`%c[Audit] ${unregistered} graphique(s) non enregistré(s) sur ${canvases.length} détectés`, 'color:#ff4d6d;font-weight:700');
    }
  }

  // Délai 2.5s pour laisser le temps à tous les graphiques de se créer
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { setTimeout(_auditChartRegistration, 2500); });
  } else {
    setTimeout(_auditChartRegistration, 2500);
  }

  // Exposer pour debug manuel
  window._auditCharts = _auditChartRegistration;
})();
