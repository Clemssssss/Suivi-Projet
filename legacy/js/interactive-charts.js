/**
 * Interactive Charts Module - Version 2.0
 * =======================================
 * 
 * Intégration avec la nouvelle architecture de filtrage :
 * - Utilise FilterManager pour l'état
 * - Utilise ChartFilterController pour les interactions
 * - Conserve les tooltips et infobulles
 * - API simplifiée et cohérente
 */

const InteractiveCharts = (() => {
  'use strict';

  const chartDescriptions = {
    'chart-status': {
      title: 'Répartition par Statut',
      description: 'Montre la distribution des projets par statut commercial (Obtenu, Perdu, Offre)',
      tips: [
        'Cliquez sur une section pour filtrer',
        'Le taux de conversion est calculé sur (Obtenu / Obtenu+Perdu)',
        'Les offres actives ne sont pas comptabilisées dans le taux'
      ],
      metrics: ['Total projets', 'Distribution', 'Taux conversion']
    },
    'chart-perdu': {
      title: 'Projets Perdus par Société',
      description: 'Top 10 des sociétés avec le plus de projets perdus',
      tips: [
        'Cliquez sur une barre pour voir uniquement cette société',
        'Recliquez pour enlever le filtre',
        'La hauteur = nombre de projets perdus'
      ],
      metrics: ['Nombre de perdus', 'Taux perte', 'Analyse par société']
    },
    'chart-obtenu': {
      title: 'Projets Obtenus par Société',
      description: 'Top 10 des sociétés avec le plus de projets obtenus',
      tips: [
        'Cliquez sur une barre pour filtrer',
        'Identifiez vos top performers',
        'Comparez avec les projets perdus'
      ],
      metrics: ['Nombre de wins', 'Taux réussite', 'Analyse par société']
    },
    'chart-obtenu-zone': {
      title: 'Projets Obtenus par Zone Géographique',
      description: 'Distribution des projets OBTENUS par zone géographique',
      tips: [
        'Cliquez sur une zone pour voir ses projets',
        'Analysez la répartition géographique',
        'Identifiez les zones à fort potentiel'
      ],
      metrics: ['Zone', 'Nombre projets', 'CA par zone']
    },
    'chart-montant': {
      title: 'CA par Société (Top 8)',
      description: 'Top 8 des sociétés classées par montant CA',
      tips: [
        'Cliquez sur une barre pour filtrer par société',
        'Les valeurs incluent uniquement les projets OBTENUS',
        'Identifiez vos clients les plus lucratifs'
      ],
      metrics: ['CA gagné', 'Nombre de projets', 'CA moyen']
    },
    'chart-montant-statut': {
      title: 'Montant Total par Statut',
      description: 'CA total regroupé par statut (Obtenu, Perdu, Offre)',
      tips: [
        'Cliquez sur une barre pour filtrer',
        'Comparez les montants entre statuts',
        'Identifiez le pipeline commercial'
      ],
      metrics: ['CA total', 'CA moyen', 'Distribution']
    }
  };

  function createChartTooltip(chartId) {
    const meta = chartDescriptions[chartId] || {
      title: 'Détails du Graphique',
      description: 'Cliquez sur les éléments pour filtrer',
      tips: [],
      metrics: []
    };

    const tooltip = document.createElement('div');
    tooltip.className = 'chart-tooltip-container';
    tooltip.innerHTML = `
      <div class="chart-tooltip-header">
        <div class="chart-tooltip-title">${meta.title}</div>
        <button class="chart-tooltip-close" aria-label="Fermer">✕</button>
      </div>
      
      <div class="chart-tooltip-content">
        <p class="chart-tooltip-description">${meta.description}</p>
        
        ${meta.tips.length > 0 ? `
          <div class="chart-tooltip-section">
            <h4>💡 Conseils d'utilisation</h4>
            <ul>
              ${meta.tips.map(tip => `<li>${tip}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
        
        ${meta.metrics.length > 0 ? `
          <div class="chart-tooltip-section">
            <h4>📊 Métriques</h4>
            <ul>
              ${meta.metrics.map(m => `<li>${m}</li>`).join('')}
            </ul>
          </div>
        ` : ''}

        <div class="chart-tooltip-section">
          <h4>🎯 Interactions</h4>
          <ul>
            <li><strong>Cliquez</strong> sur un élément pour appliquer un filtre</li>
            <li><strong>Recliquez</strong> pour enlever le filtre</li>
            <li>Le filtrage s'applique en temps réel à tous les graphiques</li>
          </ul>
        </div>
      </div>
    `;

    return tooltip;
  }

  function addInfoButton(canvas, chartId) {
    if (!canvas || !canvas.parentElement) return;

    const container = canvas.parentElement;
    
    if (container.querySelector('.chart-info-btn')) {
      return;
    }

    const infoBtn = document.createElement('button');
    infoBtn.className = 'chart-info-btn';
    infoBtn.title = 'Afficher les informations sur ce graphique';
    infoBtn.innerHTML = 'ⓘ';
    infoBtn.setAttribute('aria-label', 'Informations sur le graphique');

    infoBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleChartInfo(chartId);
    });

    container.style.position = 'relative';
    container.appendChild(infoBtn);
  }

  function toggleChartInfo(chartId) {
    const canvas = document.getElementById(chartId);
    if (!canvas) return;

    const container = canvas.parentElement;
    let tooltip = container.querySelector('.chart-tooltip-container');

    if (tooltip) {
      tooltip.remove();
    } else {
      tooltip = createChartTooltip(chartId);
      const closeBtn = tooltip.querySelector('.chart-tooltip-close');
      
      closeBtn.addEventListener('click', () => {
        tooltip.remove();
      });

      container.appendChild(tooltip);
      tooltip.style.animation = 'slideDown 0.3s ease-out';
    }
  }

  function initChart(chartInstance, chartId, options = {}) {
    if (!chartInstance || !chartId) {
      console.error('[InteractiveCharts] initChart nécessite chartInstance et chartId');
      return false;
    }

    const defaults = {
      clickable: true,
      showInfo: true,
      filterType: 'societe',
      reRenderOnFilter: true,
      dataSource: null,
      ...options
    };

    if (defaults.showInfo) {
      addInfoButton(chartInstance.canvas, chartId);
    }

    if (typeof ChartFilterController !== 'undefined') {
      ChartFilterController.registerChart(chartId, chartInstance, {
        filterType: defaults.filterType,
        clickable: defaults.clickable,
        highlightOnFilter: true,
        reRenderOnFilter: defaults.reRenderOnFilter,
        dataSource: defaults.dataSource
      });
    } else {
      console.warn('[InteractiveCharts] ChartFilterController non disponible');
    }

    console.log(`[InteractiveCharts] Graphique "${chartId}" initialisé`);
    return true;
  }

  function init() {
    console.log('[InteractiveCharts] Initialisation...');

    if (typeof ChartFilterController !== 'undefined') {
      ChartFilterController.init();
    }

    console.log('[InteractiveCharts] ✅ Prêt');
  }

  return {
    init,
    initChart,
    createChartTooltip,
    addInfoButton,
    toggleChartInfo
  };
})();

if (typeof window !== 'undefined') {
  window.InteractiveCharts = InteractiveCharts;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => InteractiveCharts.init());
} else {
  InteractiveCharts.init();
}