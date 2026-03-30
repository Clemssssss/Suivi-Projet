/**
 * UI FILTER BADGE - Badge de Filtres Actifs
 * ==========================================
 * 
 * Responsabilités :
 * - Afficher un badge avec le nombre de filtres actifs
 * - Afficher la liste des filtres actifs
 * - Bouton pour supprimer tous les filtres
 * - Bouton pour supprimer un filtre individuel
 */

const UIFilterBadge = (() => {
  'use strict';

  let badgeContainer = null;
  let clearButton = null;

  function createBadgeHTML() {
    return `
      <div class="filter-badge-container" id="filter-badge-container" style="display: none;">
        <div class="filter-badge-header">
          <span class="filter-badge-title">
            🔍 <span id="filter-count">0</span> filtre(s) actif(s)
          </span>
          <button class="filter-badge-clear-all" id="filter-clear-all" title="Supprimer tous les filtres">
            ✕ Tout effacer
          </button>
        </div>
        <div class="filter-badge-list" id="filter-badge-list"></div>
      </div>
    `;
  }

  function injectCSS() {
    const style = document.createElement('style');
    style.textContent = `
      .filter-badge-container {
        position: fixed;
        bottom: 24px;
        right: 24px;
        background: linear-gradient(135deg, #101928 0%, #0d1420 100%);
        border: 1px solid rgba(0, 212, 170, 0.3);
        border-radius: 12px;
        padding: 16px;
        z-index: 999;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5),
                    inset 0 1px 0 rgba(255, 255, 255, 0.1);
        animation: slideIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        backdrop-filter: blur(10px);
        max-width: 400px;
        min-width: 280px;
      }

      @keyframes slideIn {
        from {
          opacity: 0;
          transform: translateY(20px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .filter-badge-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 12px;
        padding-bottom: 12px;
        border-bottom: 1px solid rgba(0, 212, 170, 0.2);
      }

      .filter-badge-title {
        font-family: 'DM Sans', system-ui, sans-serif;
        font-size: 14px;
        font-weight: 600;
        color: #dce8f5;
      }

      .filter-badge-clear-all {
        background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
        color: white;
        border: none;
        border-radius: 6px;
        padding: 6px 12px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .filter-badge-clear-all:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4);
      }

      .filter-badge-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .filter-badge-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        background: rgba(0, 212, 170, 0.1);
        border: 1px solid rgba(0, 212, 170, 0.2);
        border-radius: 8px;
        padding: 8px 12px;
        font-size: 13px;
        color: #dce8f5;
        transition: all 0.2s ease;
      }

      .filter-badge-item:hover {
        background: rgba(0, 212, 170, 0.15);
        border-color: rgba(0, 212, 170, 0.4);
      }

      .filter-badge-item-label {
        flex: 1;
        font-weight: 500;
      }

      .filter-badge-item-type {
        font-size: 11px;
        color: #9fb3c8;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .filter-badge-item-remove {
        background: none;
        border: none;
        color: #ef4444;
        font-size: 16px;
        cursor: pointer;
        padding: 0;
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        transition: all 0.2s ease;
      }

      .filter-badge-item-remove:hover {
        background: rgba(239, 68, 68, 0.2);
      }

      @media (max-width: 768px) {
        .filter-badge-container {
          right: 16px;
          bottom: 16px;
          max-width: calc(100% - 32px);
        }
      }
    `;
    document.head.appendChild(style);
  }

  function createBadge() {
    const existingBadge = document.getElementById('filter-badge-container');
    if (existingBadge) {
      existingBadge.remove();
    }

    const badge = document.createElement('div');
    badge.innerHTML = createBadgeHTML();
    document.body.appendChild(badge.firstElementChild);

    badgeContainer = document.getElementById('filter-badge-container');
    clearButton = document.getElementById('filter-clear-all');

    clearButton.addEventListener('click', () => {
      if (typeof FilterManager !== 'undefined') {
        FilterManager.clearAllFilters();
      }
    });
  }

  function updateBadge(filters, count) {
    if (!badgeContainer) return;

    const countSpan = document.getElementById('filter-count');
    const listDiv = document.getElementById('filter-badge-list');

    if (count === 0) {
      badgeContainer.style.display = 'none';
      return;
    }

    badgeContainer.style.display = 'block';
    countSpan.textContent = count;

    listDiv.innerHTML = filters.map(filter => `
      <div class="filter-badge-item">
        <div style="flex: 1;">
          <div class="filter-badge-item-label">${filter.label}</div>
          <div class="filter-badge-item-type">${getFilterTypeLabel(filter.type)}</div>
        </div>
        <button 
          class="filter-badge-item-remove" 
          data-type="${filter.type}" 
          data-value="${filter.value}"
          title="Supprimer ce filtre"
        >
          ✕
        </button>
      </div>
    `).join('');

    const removeButtons = listDiv.querySelectorAll('.filter-badge-item-remove');
    removeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.getAttribute('data-type');
        const value = btn.getAttribute('data-value');
        
        if (typeof FilterManager !== 'undefined') {
          FilterManager.removeFilter(type, value);
        }
      });
    });
  }

  function getFilterTypeLabel(type) {
    const labels = {
      'societe': 'Société',
      'statut': 'Statut',
      'zone_geo': 'Zone géo',
      'consultation_cahors': 'CAHORS'
    };
    return labels[type] || type;
  }

  function init() {
    console.log('[UIFilterBadge] Initialisation...');

    injectCSS();
    createBadge();

    if (typeof FilterManager !== 'undefined') {
      FilterManager.subscribe(updateBadge);
    } else {
      console.warn('[UIFilterBadge] FilterManager non disponible');
    }

    console.log('[UIFilterBadge] ✅ Prêt');
  }

  return {
    init,
    updateBadge
  };
})();

if (typeof window !== 'undefined') {
  window.UIFilterBadge = UIFilterBadge;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => UIFilterBadge.init());
} else {
  UIFilterBadge.init();
}