/**
 * FILTER MANAGER - Gestionnaire Central des Filtres
 * ==================================================
 * 
 * Responsabilités :
 * - Stocker l'état des filtres actifs
 * - Notifier tous les abonnés lors d'un changement
 * - Fournir une API unifiée pour ajouter/supprimer des filtres
 * - Gérer la persistance (optionnel)
 * 
 * Architecture :
 * - Pattern Observer pour la réactivité
 * - Single Source of Truth pour les filtres
 * - API claire et typée
 */

const FilterManager = (() => {
  'use strict';

  const state = {
    filters: new Map(),
    subscribers: new Set(),
    history: []
  };

  function addFilter(type, value, label = null) {
    if (!type || value === undefined || value === null) {
      console.warn('[FilterManager] Impossible d\'ajouter un filtre invalide', { type, value });
      return false;
    }

    // Les filtres dateRange utilisent un objet — ne pas normaliser comme string
    if (type === 'dateRange') {
      const key = 'dateRange:range';
      const filter = { type, value, label: label || 'Plage temporelle', timestamp: new Date() };
      state.filters.set(key, filter);
      state.history.push({ action: 'add', filter, timestamp: new Date() });
      console.log('[FilterManager] Filtre dateRange ajouté');
      notifySubscribers();
      return true;
    }

    const normalizedValue = normalizeValue(value);
    if (!normalizedValue) {
      console.warn('[FilterManager] Valeur filtre ignorée (vide ou invalide)', { type, value });
      return false;
    }

    const key = `${type}:${normalizedValue}`;

    if (state.filters.has(key)) {
      console.log('[FilterManager] Filtre déjà actif', key);
      return false;
    }

    const filter = {
      type,
      value: normalizedValue,
      label: label || normalizedValue,
      timestamp: new Date()
    };

    state.filters.set(key, filter);
    state.history.push({ action: 'add', filter, timestamp: new Date() });

    console.log('[FilterManager] Filtre ajouté:', key);
    notifySubscribers();
    return true;
  }

  function removeFilter(type, value) {
    const normalizedValue = normalizeValue(value);
    const key = `${type}:${normalizedValue}`;

    if (!state.filters.has(key)) {
      console.log('[FilterManager] Filtre inexistant', key);
      return false;
    }

    const filter = state.filters.get(key);
    state.filters.delete(key);
    state.history.push({ action: 'remove', filter, timestamp: new Date() });

    console.log('[FilterManager] Filtre retiré:', key);
    notifySubscribers();
    return true;
  }

  function toggleFilter(type, value, label = null) {
    const normalizedValue = normalizeValue(value);
    const key = `${type}:${normalizedValue}`;

    if (state.filters.has(key)) {
      return removeFilter(type, value);
    } else {
      return addFilter(type, value, label);
    }
  }

  function hasFilter(type, value) {
    const normalizedValue = normalizeValue(value);
    const key = `${type}:${normalizedValue}`;
    return state.filters.has(key);
  }

  function getFilters() {
    return Array.from(state.filters.values());
  }

  function getFiltersByType(type) {
    return getFilters().filter(f => f.type === type);
  }

  function getFilterCount() {
    return state.filters.size;
  }

  function clearAllFilters() {
    if (state.filters.size === 0) {
      return false;
    }

    state.filters.clear();
    state.history.push({ action: 'clear_all', timestamp: new Date() });

    console.log('[FilterManager] Tous les filtres supprimés');
    notifySubscribers();
    return true;
  }

  function clearFiltersByType(type) {
    let removed = 0;
    const keysToRemove = [];

    for (const [key, filter] of state.filters.entries()) {
      if (filter.type === type) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach(key => {
      state.filters.delete(key);
      removed++;
    });

    if (removed > 0) {
      state.history.push({ action: 'clear_type', type, count: removed, timestamp: new Date() });
      console.log(`[FilterManager] ${removed} filtre(s) de type "${type}" supprimé(s)`);
      notifySubscribers();
    }

    return removed;
  }

  function subscribe(callback) {
    if (typeof callback !== 'function') {
      console.error('[FilterManager] Subscribe nécessite une fonction callback');
      return () => {};
    }

    state.subscribers.add(callback);
    console.log(`[FilterManager] Nouvel abonné (total: ${state.subscribers.size})`);

    return () => {
      state.subscribers.delete(callback);
      console.log(`[FilterManager] Abonné retiré (total: ${state.subscribers.size})`);
    };
  }

  function notifySubscribers() {
    const filters = getFilters();
    const count = filters.length;

    console.log(`[FilterManager] Notification de ${state.subscribers.size} abonné(s)`);

    state.subscribers.forEach(callback => {
      try {
        callback(filters, count);
      } catch (error) {
        console.error('[FilterManager] Erreur dans un callback subscriber', error);
      }
    });
  }

  function normalizeValue(value) {
    if (value === null || value === undefined) {
      return null;
    }

    const str = String(value).trim();

    const invalidValues = [
      '',
      'null',
      'undefined',
      'non spécifié',
      'non specifie',
      'non défini',
      'non defini',
      'n/a',
      'na',
      '-',
      '?',
      'inconnu',
      'unknown'
    ];

    const normalized = str.toLowerCase();
    if (invalidValues.includes(normalized)) {
      return null;
    }

    return str;
  }

  function exportState() {
    return {
      filters: getFilters(),
      count: getFilterCount(),
      history: state.history.slice(-20),
      timestamp: new Date()
    };
  }

  function importState(exportedState) {
    if (!exportedState || !Array.isArray(exportedState.filters)) {
      console.error('[FilterManager] État invalide à importer');
      return false;
    }

    clearAllFilters();

    exportedState.filters.forEach(filter => {
      addFilter(filter.type, filter.value, filter.label);
    });

    console.log(`[FilterManager] État importé : ${getFilterCount()} filtres`);
    return true;
  }

  function debug() {
    console.group('[FilterManager] DEBUG');
    console.log('Filtres actifs:', getFilters());
    console.log('Nombre de filtres:', getFilterCount());
    console.log('Abonnés:', state.subscribers.size);
    console.log('Historique (10 derniers):', state.history.slice(-10));
    console.groupEnd();
  }

  function init() {
    console.log('[FilterManager] Initialisation...');
    
    try {
      const saved = localStorage.getItem('filterManager_state');
      if (saved) {
        const parsed = JSON.parse(saved);
        importState(parsed);
        console.log('[FilterManager] État restauré depuis localStorage');
      }
    } catch (error) {
      console.warn('[FilterManager] Impossible de restaurer l\'état', error);
    }

    console.log('[FilterManager] ✅ Prêt');
  }

  function saveState() {
    try {
      const exported = exportState();
      localStorage.setItem('filterManager_state', JSON.stringify(exported));
      console.log('[FilterManager] État sauvegardé');
      return true;
    } catch (error) {
      console.error('[FilterManager] Erreur sauvegarde état', error);
      return false;
    }
  }

  let saveTimeout = null;
  function autoSave() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      saveState();
    }, 1000);
  }

  subscribe(() => {
    autoSave();
  });

  return {
    init,
    addFilter,
    removeFilter,
    toggleFilter,
    hasFilter,
    getFilters,
    getFiltersByType,
    getFilterCount,
    clearAllFilters,
    clearFiltersByType,
    subscribe,
    exportState,
    importState,
    saveState,
    debug
  };
})();

if (typeof window !== 'undefined') {
  window.FilterManager = FilterManager;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => FilterManager.init());
} else {
  FilterManager.init();
}