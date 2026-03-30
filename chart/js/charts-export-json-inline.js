(function () {
  'use strict';

  function doExportJSON(data, suffix) {
    // Enrichir chaque projet avec annee_finale = annee_manuel || annee
    var enriched = (typeof Analytics !== 'undefined' && Analytics.exportWithAnneefinale)
      ? Analytics.exportWithAnneefinale(data)
      : data.map(function(p) {
          return Object.assign({}, p, {
            annee_finale: p._annee != null ? String(p._annee) : null
          });
        });
    var filename = 'export_analytics_' + new Date().toISOString().slice(0,10) + (suffix||'') + '.json';
    var blob = new Blob([JSON.stringify(enriched, null, 2)], { type: 'application/json;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
    notify('Export JSON', enriched.length + ' projets — ' + filename, 'success');
  }

  document.getElementById('btn-export-json').addEventListener('click', function() {
    var filtered = AE.getFiltered();
    var hasFilters = Object.keys(AE.getFilters()).length > 0 || false;
    if (hasFilters && filtered.length < (window.DATA||[]).length) {
      // Offer choice via a simple prompt-like approach using notif
      if (confirm('Exporter ' + filtered.length + ' projets filtrés ?\n(Annuler = exporter les ' + (window.DATA||[]).length + ' projets totaux)')) {
        doExportJSON(filtered, '_filtre');
      } else {
        doExportJSON(window.DATA || [], '_total');
      }
    } else {
      doExportJSON(window.DATA || [], '_total');
    }
  });

})();
