/* ── TooltipInfo — initialisation sur charts.html ── */
(function () {
  /* Définitions des tooltips funnel injectés dynamiquement dans les étapes */
  var FUNNEL_TIPS = {
    'Consultations':  "Volume total de projets identifiés ou consultés. Point d'entrée du pipeline commercial.",
    'Offres':         "Nombre total de projets au <strong>statut Offre</strong> \u2014 propositions déposées en attente de décision client.",
    'Décidés':        "Projets ayant reçu une décision finale : <code>Obtenus + Perdus</code>. Mesure le volume de projets traités.",
    'Obtenus':        "Projets gagnés. <code>Obtenus \u00f7 Décidés \u00d7 100</code> = taux de conversion sur projets décidés."
  };

  /* Initialise les icônes statiques déjà dans le DOM */
  function initStatic() {
    TooltipInfo.init(document);
  }

  /* Surveille l'injection dynamique des étapes du funnel */
  function watchFunnel() {
    var wrap = document.getElementById('funnel-steps');
    if (!wrap) return;

    function injectFunnelTips() {
      wrap.querySelectorAll('.funnel-step-name').forEach(function (el) {
        if (el.__tipDone) return;
        var name = el.textContent.trim();
        Object.keys(FUNNEL_TIPS).forEach(function (key) {
          if (name.toLowerCase().indexOf(key.toLowerCase()) !== -1) {
            el.__tipDone = true;
            TooltipInfo.inject(el, FUNNEL_TIPS[key]);
          }
        });
      });
    }

    /* Observer les mutations pour détecter quand le funnel est rendu */
    var obs = new MutationObserver(injectFunnelTips);
    obs.observe(wrap, { childList: true, subtree: true });
    injectFunnelTips(); /* tenter immédiatement si déjà rendu */
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      initStatic();
      watchFunnel();
    });
  } else {
    initStatic();
    watchFunnel();
  }
})();
