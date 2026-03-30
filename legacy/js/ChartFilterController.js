/**
 * CHART FILTER CONTROLLER — Contrôleur des Graphiques Interactifs v2.0
 * ======================================================================
 *
 * CORRECTIFS v2.0 :
 *  ✅ extraFilters dans registerChart() — graphiques spécialisés (ex: obtenus)
 *     peuvent forcer un filtre statut:obtenu dans le DrillDown
 *  ✅ ChartDrillDown.show() appelé avec extraFilters transmis
 *  ✅ Bouton ⚙️ de configuration sur chaque graphique
 *  ✅ Délégation à ChartConfigManager pour re-render dynamique
 *
 * Responsabilités :
 * - Rendre les graphiques cliquables
 * - Gérer les interactions utilisateur (clic, hover)
 * - Synchroniser avec FilterManager
 * - Re-render les graphiques lors des changements de filtres
 * - Gérer les états visuels (highlight, opacity, etc.)
 * - Afficher le bouton ⚙️ et déléguer à ChartConfigManager
 */

// ── GUARD ANTI-REDÉCLARATION ─────────────────────────────────────────────────
if (!window.ChartFilterController) {
window.ChartFilterController = (() => {
  'use strict';

  const registeredCharts = new Map();
  let isInitialized = false;

  /**
   * Enregistrer un graphique Chart.js.
   *
   * @param {string}       chartId
   * @param {Object}       chartInstance   Instance Chart.js
   * @param {Object}       [config]
   * @param {string}       [config.filterType]         Type de filtre (ex: 'Client', '_annee')
   * @param {boolean}      [config.clickable=true]
   * @param {boolean}      [config.highlightOnFilter=true]
   * @param {boolean}      [config.reRenderOnFilter=true]
   * @param {Function}     [config.dataSource]          Callback retournant { labels, datasets }
   * @param {Object}       [config.extraFilters]        Filtres additionnels forcés lors du DrillDown
   *                                                    Ex: { status: 'obtenu' } pour graphique obtenus
   * @param {boolean}      [config.showConfigButton=true]  Afficher le bouton ⚙️ (true par défaut — correction 6)
   */
  function registerChart(chartId, chartInstance, config = {}) {
    if (!chartId || !chartInstance) {
      console.error('[ChartFilterController] registerChart nécessite chartId et chartInstance');
      return false;
    }

    const defaultConfig = {
      filterType:        null,
      clickable:         true,
      highlightOnFilter: true,
      reRenderOnFilter:  true,
      dataSource:        null,
      extraFilters:      null,    // ← NOUVEAU
      showConfigButton:  true     // ← true par défaut (correction 6) — passer false explicitement pour opt-out
    };

    const finalConfig = { ...defaultConfig, ...config };

    registeredCharts.set(chartId, {
      instance: chartInstance,
      config:   finalConfig
    });

    if (finalConfig.clickable) {
      makeChartClickable(chartId, chartInstance, finalConfig.filterType);
    }

    if (finalConfig.showConfigButton && typeof ChartConfigManager !== 'undefined') {
      ChartConfigManager.injectConfigButton(chartId, finalConfig);
    }

    console.log(`[ChartFilterController] Graphique "${chartId}" enregistré`);
    return true;
  }

  function makeChartClickable(chartId, chartInstance, filterType) {
    if (!chartInstance || !chartInstance.canvas) {
      console.error('[ChartFilterController] Impossible de rendre clickable, canvas manquant');
      return;
    }

    const canvas = chartInstance.canvas;
    canvas.style.cursor = 'pointer';
    canvas.setAttribute('data-clickable', 'true');

    const existingListener = canvas._filterClickHandler;
    if (existingListener) {
      canvas.removeEventListener('click', existingListener);
    }

    const clickHandler = (event) => {
      handleChartClick(event, chartInstance, filterType, chartId);
    };

    canvas._filterClickHandler = clickHandler;
    canvas.addEventListener('click', clickHandler);

    console.log(`[ChartFilterController] Graphique "${chartId}" rendu cliquable`);
  }

  function handleChartClick(event, chartInstance, filterType, chartId) {
    const elements = chartInstance.getElementsAtEventForMode(
      event,
      'nearest',
      { intersect: true },
      true
    );

    if (elements.length === 0) {
      console.log('[ChartFilterController] Clic hors élément');
      return;
    }

    const element = elements[0];
    const index   = element.index;

    // Sécurisation label — String() force la conversion sans textContent
    const rawLabel = chartInstance.data.labels?.[index];
    const label    = (rawLabel == null) ? '' : String(rawLabel).trim();

    console.log(`[ChartFilterController] Clic index=${index} label="${label}" filterType="${filterType}" dans "${chartId}"`);

    if (!filterType) {
      console.warn('[ChartFilterController] Pas de filterType défini pour ce graphique');
      return;
    }

    if (!label || label === 'undefined' || label === 'null') {
      console.warn('[ChartFilterController] Label invalide après String():', rawLabel);
      return;
    }

    const cleanedLabel = DataFilterEngine.cleanValue(label);
    if (!cleanedLabel) {
      console.warn('[ChartFilterController] Label vide après nettoyage, ignoré. rawLabel:', rawLabel);
      return;
    }

    // Mapper les labels UI vers les valeurs de filtre
    let filterValue = cleanedLabel;
    if (filterType === 'Statut') {
      const STATUS_MAP = {
        'obtenu': 'obtenu', 'gagné': 'obtenu', '✅ obtenu': 'obtenu',
        'perdu': 'perdu', '❌ perdu': 'perdu',
        'offre': 'offre', 'en cours': 'offre', '📋 offre': 'offre',
      };
      filterValue = STATUS_MAP[cleanedLabel.toLowerCase()] || cleanedLabel;
    }

    console.log(`[ChartFilterController] → FilterManager.toggleFilter("${filterType}", "${filterValue}")`);
    FilterManager.toggleFilter(filterType, filterValue, label);

    updateChartVisualState(chartId, chartInstance);

    // ── DrillDown avec extraFilters ──────────────────────────────
    // Le DrillDown est déclenché dans un setTimeout 0 pour laisser
    // DataFilterEngine.applyFilters() s'exécuter EN PREMIER.
    if (typeof ChartDrillDown !== 'undefined') {
      const chartData = registeredCharts.get(chartId);
      const extraFilters = chartData ? chartData.config.extraFilters : null;

      setTimeout(() => {
        ChartDrillDown.show(chartId, filterType, filterValue, label, {
          extraFilters: extraFilters || null
        });
      }, 0);
    }
  }

  function updateChartVisualState(chartId, chartInstance) {
    const chartData = registeredCharts.get(chartId);
    if (!chartData || !chartData.config.highlightOnFilter) {
      return;
    }

    const filters = FilterManager.getFilters();
    const filterType  = chartData.config.filterType;
    const activeValues = filters
      .filter(f => f.type === filterType)
      .map(f => f.value);

    if (activeValues.length === 0) {
      resetChartOpacity(chartInstance);
      return;
    }

    applyChartOpacity(chartInstance, activeValues);
  }

  function applyChartOpacity(chartInstance, activeValues) {
    if (!chartInstance || !chartInstance.data) return;

    const labels   = chartInstance.data.labels;
    const datasets = chartInstance.data.datasets;

    datasets.forEach(dataset => {
      if (!dataset.backgroundColor) return;

      const originalColors = dataset._originalBackgroundColor || dataset.backgroundColor;
      if (!dataset._originalBackgroundColor) {
        dataset._originalBackgroundColor = Array.isArray(originalColors)
          ? [...originalColors]
          : originalColors;
      }

      const newColors = labels.map((label, index) => {
        const cleanedLabel = DataFilterEngine.cleanValue(label);
        const isActive     = activeValues.includes(cleanedLabel);

        if (isActive) {
          return Array.isArray(originalColors) ? originalColors[index] : originalColors;
        } else {
          const color = Array.isArray(originalColors) ? originalColors[index] : originalColors;
          return makeColorTransparent(color, 0.2);
        }
      });

      dataset.backgroundColor = newColors;
    });

    chartInstance.update('none');
  }

  function resetChartOpacity(chartInstance) {
    if (!chartInstance || !chartInstance.data) return;

    chartInstance.data.datasets.forEach(dataset => {
      if (dataset._originalBackgroundColor) {
        dataset.backgroundColor = Array.isArray(dataset._originalBackgroundColor)
          ? [...dataset._originalBackgroundColor]
          : dataset._originalBackgroundColor;
      }
    });

    chartInstance.update('none');
  }

  function makeColorTransparent(color, opacity = 0.2) {
    if (typeof color !== 'string') return color;

    if (color.startsWith('rgba(')) {
      return color.replace(/[\d.]+\)$/g, `${opacity})`);
    }
    if (color.startsWith('rgb(')) {
      return color.replace('rgb(', 'rgba(').replace(')', `, ${opacity})`);
    }
    if (color.startsWith('#')) {
      const r = parseInt(color.slice(1, 3), 16);
      const g = parseInt(color.slice(3, 5), 16);
      const b = parseInt(color.slice(5, 7), 16);
      return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }
    return color;
  }

  function reRenderChart(chartId, newData) {
    const chartData = registeredCharts.get(chartId);
    if (!chartData) {
      console.warn(`[ChartFilterController] Graphique "${chartId}" non enregistré`);
      return false;
    }

    const { instance, config } = chartData;

    if (!config.reRenderOnFilter) return false;

    if (config.dataSource && typeof config.dataSource === 'function') {
      updateChartData(instance, config.dataSource());
    } else if (newData) {
      updateChartData(instance, newData);
    }

    updateChartVisualState(chartId, instance);
    return true;
  }

  function updateChartData(chartInstance, newData) {
    if (!chartInstance || !newData) return;
    if (newData.labels)   chartInstance.data.labels   = newData.labels;
    if (newData.datasets) chartInstance.data.datasets = newData.datasets;
    chartInstance.update();
  }

  function reRenderAllCharts() {
    registeredCharts.forEach((_, chartId) => reRenderChart(chartId));
    console.log('[ChartFilterController] ✅ Tous les graphiques mis à jour');
  }

  function onFilterChange(filters, count) {
    console.log(`[ChartFilterController] Changement de filtres (${count} actifs)`);
    reRenderAllCharts();
  }

  function unregisterChart(chartId) {
    const chartData = registeredCharts.get(chartId);
    if (!chartData) return false;

    const canvas = chartData.instance.canvas;
    if (canvas && canvas._filterClickHandler) {
      canvas.removeEventListener('click', canvas._filterClickHandler);
      delete canvas._filterClickHandler;
    }

    registeredCharts.delete(chartId);
    return true;
  }

  function getRegisteredCharts() {
    return Array.from(registeredCharts.keys());
  }

  function debug() {
    console.group('[ChartFilterController] DEBUG');
    console.log('Graphiques enregistrés:', getRegisteredCharts());
    registeredCharts.forEach((data, id) => {
      console.log(`  - ${id}:`, {
        filterType:   data.config.filterType,
        extraFilters: data.config.extraFilters,
        clickable:    data.config.clickable,
      });
    });
    console.groupEnd();
  }

  function init() {
    if (isInitialized) {
      console.warn('[ChartFilterController] Déjà initialisé');
      return false;
    }

    if (typeof FilterManager === 'undefined') {
      console.error('[ChartFilterController] FilterManager non disponible');
      return false;
    }

    if (!window.ChartFilterController || !window.ChartFilterController._fmSubscribed) {
      FilterManager.subscribe(onFilterChange);
      if (window.ChartFilterController) window.ChartFilterController._fmSubscribed = true;
    }

    isInitialized = true;
    console.log('[ChartFilterController] ✅ Prêt (v2.0 — extraFilters + ConfigButton)');
    return true;
  }

  return {
    init,
    registerChart,
    unregisterChart,
    reRenderChart,
    reRenderAllCharts,
    getRegisteredCharts,
    debug
  };
})();
} // end guard !window.ChartFilterController
