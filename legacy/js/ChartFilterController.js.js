/**
 * CHART FILTER CONTROLLER - Contrôleur des Graphiques Interactifs
 * ================================================================
 * 
 * Responsabilités :
 * - Rendre les graphiques cliquables
 * - Gérer les interactions utilisateur (clic, hover)
 * - Synchroniser avec FilterManager
 * - Re-render les graphiques lors des changements de filtres
 * - Gérer les états visuels (highlight, opacity, etc.)
 */

const ChartFilterController = (() => {
  'use strict';

  const registeredCharts = new Map();
  let isInitialized = false;

  function registerChart(chartId, chartInstance, config = {}) {
    if (!chartId || !chartInstance) {
      console.error('[ChartFilterController] registerChart nécessite chartId et chartInstance');
      return false;
    }

    const defaultConfig = {
      filterType: null,
      clickable: true,
      highlightOnFilter: true,
      reRenderOnFilter: true,
      dataSource: null
    };

    const finalConfig = { ...defaultConfig, ...config };

    registeredCharts.set(chartId, {
      instance: chartInstance,
      config: finalConfig
    });

    if (finalConfig.clickable) {
      makeChartClickable(chartId, chartInstance, finalConfig.filterType);
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
    const index = element.index;
    const label = chartInstance.data.labels[index];
    const value = chartInstance.data.datasets[0].data[index];

    console.log(`[ChartFilterController] Clic sur "${label}" (valeur: ${value}) dans "${chartId}"`);

    if (!filterType) {
      console.warn('[ChartFilterController] Pas de filterType défini pour ce graphique');
      return;
    }

    const cleanedLabel = DataFilterEngine.cleanValue(label);
    if (!cleanedLabel) {
      console.warn('[ChartFilterController] Valeur de label invalide, filtrage ignoré');
      return;
    }

    FilterManager.toggleFilter(filterType, cleanedLabel, label);

    updateChartVisualState(chartId, chartInstance);
  }

  function updateChartVisualState(chartId, chartInstance) {
    const filters = FilterManager.getFilters();
    const hasActiveFilters = filters.length > 0;

    const chartData = registeredCharts.get(chartId);
    if (!chartData || !chartData.config.highlightOnFilter) {
      return;
    }

    const filterType = chartData.config.filterType;
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

    const labels = chartInstance.data.labels;
    const datasets = chartInstance.data.datasets;

    datasets.forEach(dataset => {
      if (!dataset.backgroundColor) return;

      const originalColors = dataset._originalBackgroundColor || dataset.backgroundColor;
      if (!dataset._originalBackgroundColor) {
        dataset._originalBackgroundColor = [...originalColors];
      }

      const newColors = labels.map((label, index) => {
        const cleanedLabel = DataFilterEngine.cleanValue(label);
        const isActive = activeValues.includes(cleanedLabel);

        if (isActive) {
          return originalColors[index];
        } else {
          const color = originalColors[index];
          return makeColorTransparent(color, 0.2);
        }
      });

      dataset.backgroundColor = newColors;
    });

    chartInstance.update('none');
  }

  function resetChartOpacity(chartInstance) {
    if (!chartInstance || !chartInstance.data) return;

    const datasets = chartInstance.data.datasets;

    datasets.forEach(dataset => {
      if (dataset._originalBackgroundColor) {
        dataset.backgroundColor = [...dataset._originalBackgroundColor];
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

    if (!config.reRenderOnFilter) {
      console.log(`[ChartFilterController] Re-render désactivé pour "${chartId}"`);
      return false;
    }

    if (config.dataSource && typeof config.dataSource === 'function') {
      const freshData = config.dataSource();
      updateChartData(instance, freshData);
    } else if (newData) {
      updateChartData(instance, newData);
    }

    updateChartVisualState(chartId, instance);

    console.log(`[ChartFilterController] Graphique "${chartId}" re-rendu`);
    return true;
  }

  function updateChartData(chartInstance, newData) {
    if (!chartInstance || !newData) return;

    if (newData.labels) {
      chartInstance.data.labels = newData.labels;
    }

    if (newData.datasets) {
      chartInstance.data.datasets = newData.datasets;
    }

    chartInstance.update();
  }

  function reRenderAllCharts() {
    console.log('[ChartFilterController] Re-render de tous les graphiques...');

    registeredCharts.forEach((chartData, chartId) => {
      reRenderChart(chartId);
    });

    console.log('[ChartFilterController] ✅ Tous les graphiques mis à jour');
  }

  function onFilterChange(filters, count) {
    console.log(`[ChartFilterController] Changement de filtres détecté (${count} actifs)`);
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
    console.log(`[ChartFilterController] Graphique "${chartId}" désenregistré`);
    return true;
  }

  function getRegisteredCharts() {
    return Array.from(registeredCharts.keys());
  }

  function debug() {
    console.group('[ChartFilterController] DEBUG');
    console.log('Graphiques enregistrés:', getRegisteredCharts());
    console.log('Total:', registeredCharts.size);
    registeredCharts.forEach((data, id) => {
      console.log(`  - ${id}:`, {
        filterType: data.config.filterType,
        clickable: data.config.clickable,
        reRenderOnFilter: data.config.reRenderOnFilter
      });
    });
    console.groupEnd();
  }

  function init() {
    if (isInitialized) {
      console.warn('[ChartFilterController] Déjà initialisé');
      return false;
    }

    console.log('[ChartFilterController] Initialisation...');

    if (typeof FilterManager === 'undefined') {
      console.error('[ChartFilterController] FilterManager non disponible');
      return false;
    }

    FilterManager.subscribe(onFilterChange);

    isInitialized = true;
    console.log('[ChartFilterController] ✅ Prêt');
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

if (typeof window !== 'undefined') {
  window.ChartFilterController = ChartFilterController;
}