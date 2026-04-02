/**
 * ════════════════════════════════════════════════════════════════
 *  FLOATING FILTER BAR v2.0 — Barre de Filtres Unique & Flottante
 * ════════════════════════════════════════════════════════════════
 *
 *  RÉSOUT :
 *   ✅ Supprime la duplication UI (#filter-panel inline + #floating-filter-bar)
 *   ✅ Une seule barre, toujours visible, sticky/fixed lors du scroll
 *   ✅ Sources unifiées : AE (legacy) + FilterManager (Chart.js)
 *   ✅ Suppression individuelle des filtres
 *   ✅ Bouton "Tout effacer"
 *   ✅ Affichage labels lisibles (plus les clés internes)
 *   ✅ Animation fluide apparition/disparition
 *   ✅ Compatible dark theme
 *
 *  Usage :
 *   FloatingFilterBar.init()   — appelé après DOMContentLoaded
 *   FloatingFilterBar.render() — forcer un re-rendu
 *
 *  Remplace définitivement :
 *   - #filter-panel (inline sticky)
 *   - renderFilterPanel() (inline dans charts.html)
 *   - renderFloatingFilters() (module v5.0)
 * ════════════════════════════════════════════════════════════════
 */

// ── GUARD ANTI-REDÉCLARATION ─────────────────────────────────────────────────
if (!window.FloatingFilterBar) {
window.FloatingFilterBar = (() => {
  'use strict';

  /* ── Labels lisibles pour les clés de filtres ─────────────────── */
  const FILTER_LABELS = {
    'Client':                     'Client',
    'Zone Géographique':          'Zone',
    'Statut':                     'Statut',
    '_annee':                     'Année',
    'Type de projet (Activité)':  'Type',
    'status':                     'Statut',
    'societe':                    'Client',
    'zone_geo':                   'Zone',
    'type_offre':                 'Type',
    'partenaire_gc':              'Partenaire',
    'annee':                      'Année',
    'annee_facturation':          'Année fact.',
    'dateRange':                  'Période',
    '_tranche':                   'Tranche',
    '_mois':                      'Mois',
    '__selection__':              'Graphique',
  };

  /* ── Icônes par type de filtre ────────────────────────────────── */
  const FILTER_ICONS = {
    'Client': '🏢',
    'Zone Géographique': '🌍',
    'Statut': '📋',
    '_annee': '📅',
    'Type de projet (Activité)': '🎯',
    'annee_facturation': '💰',
    'dateRange': '🗓️',
    'status': '📋',
    'partenaire_gc': '🤝',
    '_tranche': '💶',
    '_mois': '📆',
    '__selection__': '📊',
  };

  let _container = null;
  let _isInit    = false;

  /* ── Obtenir tous les filtres actifs (AE + FilterManager) ─────── */
  function _getAllFilters() {
    const filters = [];

    // Source 1 : AE (legacy, pilote l'UI principale)
    if (typeof AE !== 'undefined' && AE.getFilters) {
      const aeFilters = AE.getFilters();
      Object.entries(aeFilters).forEach(([type, value]) => {
        if (value != null && value !== '') {
          filters.push({ type, value, source: 'ae' });
        }
      });
    }
    if (typeof AE !== 'undefined' && AE.getSelection) {
      const selection = AE.getSelection();
      if (selection && selection.label) {
        filters.push({
          type: '__selection__',
          value: selection.label + (selection.count ? ' (' + selection.count + ')' : ''),
          source: 'ae-selection'
        });
      }
    }

    // Source 2 : FilterManager (pilote les graphiques Chart.js)
    // Dédupliquer avec AE pour éviter les doublons
    if (typeof FilterManager !== 'undefined' && FilterManager.getFilters) {
      const fmFilters = FilterManager.getFilters();
      fmFilters.forEach(f => {
        const alreadyIn = filters.some(
          existing => existing.type === f.type && String(existing.value) === String(f.value)
        );
        if (!alreadyIn) {
          filters.push({ type: f.type, value: f.label || f.value, source: 'fm', rawValue: f.value });
        }
      });
    }

    return filters;
  }

  /* ── Supprimer un filtre dans les deux systèmes ───────────────── */
  function _removeFilter(type, value, source) {
    if (type === '__selection__') {
      if (typeof AE !== 'undefined' && AE.clearSelection) AE.clearSelection();
      return;
    }
    // Supprimer dans AE
    if (typeof AE !== 'undefined' && AE.removeFilter) {
      AE.removeFilter(type);
    }
    // Supprimer dans FilterManager
    if (typeof FilterManager !== 'undefined' && FilterManager.toggleFilter) {
      const fmFilters = FilterManager.getFilters();
      const matching = fmFilters.filter(f => f.type === type);
      matching.forEach(f => FilterManager.toggleFilter(f.type, f.value));
    }
  }

  /* ── Effacer tous les filtres ─────────────────────────────────── */
  function _clearAll() {
    if (typeof AE !== 'undefined' && AE.clearAll) {
      AE.clearAll();
    }
    if (typeof FilterManager !== 'undefined' && FilterManager.clearAll) {
      FilterManager.clearAll();
    } else if (typeof FilterManager !== 'undefined' && FilterManager.getFilters) {
      // Supprimer un par un si pas de clearAll
      FilterManager.getFilters().forEach(f => FilterManager.toggleFilter(f.type, f.value));
    }
  }

  /* ── Formater une valeur de filtre ───────────────────────────── */
  function _formatValue(type, value) {
    if (type === 'dateRange' && typeof value === 'object') {
      const s = value.start ? value.start.slice(0, 10) : '';
      const e = value.end   ? value.end.slice(0, 10)   : '';
      return s && e ? `${s} → ${e}` : s || e || '?';
    }
    // Normaliser les valeurs de statut
    const statusMap = { obtenu: 'Gagné', perdu: 'Perdu', offre: 'En cours' };
    if (type === 'Statut' || type === 'status') {
      return statusMap[String(value).toLowerCase()] || value;
    }
    return String(value);
  }

  /* ── Rendu de la barre ───────────────────────────────────────── */
  function render() {
    if (!_container) return;
    const filters = _getAllFilters();

    const summary = _container.querySelector('#ffb-summary');
    const clearBtn = _container.querySelector('#ffb-clear-all');
    const countBadge = _container.querySelector('#ffb-count');

    if (!summary) return;

    if (filters.length === 0) {
      _container.classList.remove('ffb-visible');
      document.body.classList.remove('dashboard-filtered');
      return;
    }

    _container.classList.add('ffb-visible');
    document.body.classList.add('dashboard-filtered');

    // Mettre à jour le compteur
    if (countBadge) {
      countBadge.textContent = filters.length + ' filtre' + (filters.length > 1 ? 's' : '');
    }

    // Rendre les pills de filtres
    summary.innerHTML = filters.map((f, idx) => {
      const icon  = FILTER_ICONS[f.type] || '🔍';
      const label = FILTER_LABELS[f.type] || f.type;
      const val   = _formatValue(f.type, f.value);
      return `<span class="ffb-pill" data-idx="${idx}" data-type="${f.type}" data-source="${f.source}">
        <span class="ffb-pill-icon">${icon}</span>
        <span class="ffb-pill-label">${label}</span>
        <span class="ffb-pill-sep">:</span>
        <span class="ffb-pill-value">${val}</span>
        <span class="ffb-pill-close" aria-label="Supprimer ce filtre">✕</span>
      </span>`;
    }).join('');

    // Listeners de suppression individuelle
    summary.querySelectorAll('.ffb-pill').forEach(pill => {
      pill.addEventListener('click', (e) => {
        e.stopPropagation();
        const type   = pill.dataset.type;
        const source = pill.dataset.source;
        const val    = filters[parseInt(pill.dataset.idx)].value;
        _removeFilter(type, val, source);
      });
    });
  }

  /* ── Injection du CSS ────────────────────────────────────────── */
  function _injectCSS() {
    if (document.getElementById('ffb-styles')) return;
    const style = document.createElement('style');
    style.id = 'ffb-styles';
    style.textContent = `
      /* ── Floating Filter Bar v2.0 ── */
      #floating-filter-bar-v2 {
        position: fixed;
        bottom: 1.5rem;
        left: 50%;
        transform: translateX(-50%) translateY(20px);
        z-index: 600;
        display: flex;
        align-items: center;
        gap: .55rem;
        background: rgba(6,12,20,.97);
        backdrop-filter: blur(24px);
        -webkit-backdrop-filter: blur(24px);
        border: 1px solid rgba(0,212,170,.35);
        border-radius: 18px;
        padding: .55rem 1rem .55rem .85rem;
        box-shadow: 0 10px 48px rgba(0,0,0,.6), 0 0 0 1px rgba(0,212,170,.1);
        max-width: 92vw;
        flex-wrap: wrap;
        opacity: 0;
        pointer-events: none;
        transition: opacity .25s ease, transform .25s cubic-bezier(.4,0,.2,1);
      }
      #floating-filter-bar-v2.ffb-visible {
        opacity: 1;
        pointer-events: all;
        transform: translateX(-50%) translateY(0);
      }
      #ffb-label {
        font-family: 'DM Mono', monospace;
        font-size: .62rem;
        text-transform: uppercase;
        letter-spacing: .08em;
        color: rgba(0,212,170,.7);
        font-weight: 700;
        white-space: nowrap;
        flex-shrink: 0;
      }
      #ffb-count {
        font-family: 'DM Mono', monospace;
        font-size: .6rem;
        color: rgba(0,212,170,.5);
        background: rgba(0,212,170,.08);
        border: 1px solid rgba(0,212,170,.2);
        border-radius: 99px;
        padding: .1rem .45rem;
        white-space: nowrap;
        flex-shrink: 0;
      }
      #ffb-summary {
        display: flex;
        flex-wrap: wrap;
        gap: .35rem;
        flex: 1;
        align-items: center;
        min-width: 0;
      }
      .ffb-pill {
        display: inline-flex;
        align-items: center;
        gap: .25rem;
        background: rgba(0,212,170,.10);
        border: 1px solid rgba(0,212,170,.28);
        color: #dce8f5;
        padding: .22rem .65rem .22rem .45rem;
        border-radius: 99px;
        font-family: 'DM Mono', monospace;
        font-size: .68rem;
        cursor: pointer;
        transition: all .18s ease;
        white-space: nowrap;
        max-width: 200px;
      }
      .ffb-pill:hover {
        background: rgba(255,77,109,.15);
        border-color: rgba(255,77,109,.4);
        color: #ff4d6d;
      }
      .ffb-pill:hover .ffb-pill-close {
        opacity: 1;
        color: #ff4d6d;
      }
      .ffb-pill-icon { font-size: .7rem; flex-shrink: 0; }
      .ffb-pill-label {
        color: rgba(0,212,170,.85);
        font-weight: 600;
        font-size: .64rem;
        text-transform: uppercase;
        letter-spacing: .04em;
        flex-shrink: 0;
      }
      .ffb-pill-sep { color: rgba(255,255,255,.2); flex-shrink: 0; }
      .ffb-pill-value {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 120px;
      }
      .ffb-pill-close {
        font-size: .7rem;
        opacity: .45;
        transition: opacity .15s;
        flex-shrink: 0;
        margin-left: .1rem;
      }
      #ffb-divider {
        width: 1px;
        height: 18px;
        background: rgba(255,255,255,.08);
        flex-shrink: 0;
      }
      #ffb-clear-all {
        display: inline-flex;
        align-items: center;
        gap: .3rem;
        background: rgba(255,77,109,.1);
        border: 1px solid rgba(255,77,109,.3);
        color: #ff4d6d;
        font-family: 'DM Mono', monospace;
        font-size: .64rem;
        font-weight: 600;
        padding: .22rem .7rem;
        border-radius: 99px;
        cursor: pointer;
        white-space: nowrap;
        transition: all .18s ease;
        flex-shrink: 0;
      }
      #ffb-clear-all:hover {
        background: rgba(255,77,109,.22);
        border-color: rgba(255,77,109,.6);
      }

      /* Masquer l'ancienne barre inline (évite la duplication) */
      #filter-panel { display: none !important; }

      /* Masquer l'ancienne floating bar (remplacée) */
      #floating-filter-bar { display: none !important; }

      @media (max-width: 640px) {
        #floating-filter-bar-v2 {
          bottom: .75rem;
          left: .75rem;
          right: .75rem;
          transform: translateY(20px);
          max-width: calc(100vw - 1.5rem);
        }
        #floating-filter-bar-v2.ffb-visible {
          transform: translateY(0);
        }
      }
    `;
    document.head.appendChild(style);
  }

  /* ── Création du DOM de la barre ─────────────────────────────── */
  function _buildDOM() {
    // Vérifier si déjà dans le DOM
    const existing = document.getElementById('floating-filter-bar-v2');
    if (existing) { _container = existing; return; }

    _container = document.createElement('div');
    _container.id = 'floating-filter-bar-v2';
    _container.setAttribute('role', 'status');
    _container.setAttribute('aria-label', 'Filtres actifs');
    _container.innerHTML = `
      <span id="ffb-label">🔍 Filtres</span>
      <span id="ffb-count"></span>
      <div id="ffb-summary"></div>
      <div id="ffb-divider"></div>
      <button id="ffb-clear-all" title="Supprimer tous les filtres">✕ Tout effacer</button>
    `;
    document.body.appendChild(_container);

    // Listener "Tout effacer"
    _container.querySelector('#ffb-clear-all').addEventListener('click', () => {
      _clearAll();
    });
  }

  /* ── Connexion aux sources de filtres ────────────────────────── */
  function _subscribeSources() {
    // Abonnement à AE (source principale UI)
    if (typeof AE !== 'undefined' && AE.subscribe) {
      AE.subscribe(render);
    }

    // Abonnement à FilterManager (graphiques Chart.js)
    if (typeof FilterManager !== 'undefined' && FilterManager.subscribe) {
      FilterManager.subscribe(render);
    }
  }

  /* ── API publique ────────────────────────────────────────────── */
  function init() {
    if (_isInit) return;
    _isInit = true;

    _injectCSS();
    _buildDOM();
    _subscribeSources();
    render(); // Rendu initial

    // ── CORRECTION 7 : écouter le sélecteur de date global ──────────
    // Après setActiveDateField(), FloatingFilterBar doit se re-render
    // pour rester synchronisé avec les filtres recalculés.
    const dateFieldSel = document.getElementById('date-field-selector');
    if (dateFieldSel && !dateFieldSel._ffbBound) {
      dateFieldSel.addEventListener('change', function () {
        // Délai court : laisser setActiveDateField() recalculer _annee en premier
        setTimeout(render, 80);
      });
      dateFieldSel._ffbBound = true;
    }

    console.log('%c🔍 FloatingFilterBar v2.0 — Barre unique unifiée + sync date (correction 7)', 'color:#00d4aa;font-weight:700');
  }

  // Auto-init
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      setTimeout(init, 100);
    }
  }

  return { init, render };
})();
} // end guard
