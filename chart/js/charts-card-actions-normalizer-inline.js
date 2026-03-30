(function() {
  'use strict';

  /**
   * Pour chaque chart-card :
   *  1. Déplace les info-icon hors du titre vers chart-title-actions (bouton ℹ)
   *  2. S'assure que tous les boutons ont la même taille / style CSS
   *  3. Ordre normalisé : [badge filtre] [ℹ info] [💾 export] [👁 toggle]
   *     Le bouton ⚙️ (cfg) et 🔍 (focus) sont injectés par ChartConfigManager / DashboardUX
   */
  function _normalizeCardButtons() {
    document.querySelectorAll('.chart-card[data-chart-id]').forEach(card => {
      const chartId = card.dataset.chartId;
      const actions = card.querySelector('.chart-title-actions');
      const titleEl = card.querySelector('.chart-title');
      if (!actions || !titleEl) return;

      // 1. Migrer info-icon inline vers bouton info dans les actions
      // Uniquement si la carte n'a pas encore de chart-info-btn
      const infoIcon = titleEl.querySelector('.info-icon');
      if (infoIcon && !actions.querySelector('.chart-info-btn')) {
        const infoText = infoIcon.getAttribute('data-info') || '';
        const btn = document.createElement('button');
        btn.className = 'chart-info-btn';
        btn.dataset.info = chartId;
        btn.title = 'En savoir plus';
        btn.innerHTML = 'ℹ';

        // Creer popup si pas deja presente
        if (!document.getElementById('info-' + chartId)) {
          const popup = document.createElement('div');
          popup.className = 'chart-info-popup';
          popup.id = 'info-' + chartId;
          popup.innerHTML = '<div class="chart-info-popup-title">ℹ ' +
            (titleEl.textContent.replace('ⓘ', '').trim()) + '</div>' +
            '<div class="chart-info-popup-text">' + infoText + '</div>';
          actions.appendChild(popup);
        }

        // Inserer le bouton avant le premier bouton existant
        const firstBtn = actions.querySelector('button');
        if (firstBtn && firstBtn.parentNode === actions) actions.insertBefore(btn, firstBtn);
        else actions.prepend(btn);

        // Supprimer l'info-icon du titre
        infoIcon.remove();
      }

      // 2. Forcer une taille uniforme sur tous les boutons d'action (style seulement, PAS de deplacement DOM)
      // IMPORTANT : ne pas deplacer les boutons avec appendChild/insertBefore — cela detruit
      // les event listeners attaches par TooltipInfo/bindChartInfoBtns.
      actions.querySelectorAll('button:not(.chart-cfg-btn):not(.chart-filter-badge)').forEach(btn => {
        btn.style.width = '28px';
        btn.style.height = '28px';
        btn.style.display = 'inline-flex';
        btn.style.alignItems = 'center';
        btn.style.justifyContent = 'center';
        btn.style.flexShrink = '0';
        btn.style.borderRadius = '6px';
        btn.style.fontSize = '.82rem';
        btn.style.lineHeight = '1';
      });
    });

    // Re-brancher les nouveaux boutons info migres sur TooltipInfo
    if (typeof TooltipInfo !== 'undefined') {
      TooltipInfo.init(document);
    }

    console.log('[ButtonNorm] Boutons normalises (style uniforme + migration info-icon)');
  }

  // Attendre que tous les modules aient injecte leurs boutons
  const _delay = document.readyState === 'loading' ? 3500 : 2800;
  setTimeout(_normalizeCardButtons, _delay);

  // Re-appliquer apres chaque update() pour les cartes rechargees
  const _origUpdate = window.update;
  if (typeof _origUpdate === 'function') {
    window.update = function() {
      const r = _origUpdate.apply(this, arguments);
      setTimeout(_normalizeCardButtons, 700);
      return r;
    };
  }

  window._normalizeCardButtons = _normalizeCardButtons;
})();
