/**
 * CHART CONFIG MANAGER — Gestionnaire de configuration dynamique v1.0
 * =====================================================================
 *
 * Permet de modifier dynamiquement les graphiques via un bouton ⚙️ :
 *  - Axe X  : Client / Zone / Année / Société
 *  - Valeur : Bud (tous statuts) / CA gagné / Nombre projets
 *  - Statut : Tous / Obtenu / Perdu / Offre
 *
 * Architecture :
 *  - Stocke la config par chartId
 *  - Injecte le bouton ⚙️ dans le card parent
 *  - Re-render dynamique via un callback fourni à l'enregistrement
 *  - Compatible ChartFilterController.registerChart()
 *
 * Usage :
 *   ChartConfigManager.register('chart-montant', {
 *     axeX:    'Client',          // valeur initiale
 *     valeur:  'ca_etudie',
 *     statut:  'tous',
 *     onApply: (cfg) => ChartsEnrichis.createCAByCompanyChart(projects, 'chart-montant', cfg)
 *   });
 *   // Puis passer showConfigButton: true dans ChartFilterController.registerChart()
 */

// ── GUARD ANTI-REDÉCLARATION ─────────────────────────────────────────────────
if (!window.ChartConfigManager) {
window.ChartConfigManager = (() => {
  'use strict';

  // Map chartId → { config, onApply }
  const _registry = new Map();

  // Options disponibles
  const AXE_OPTIONS    = ['Client', 'Zone Géographique', '_annee', 'Société'];
  const VALEUR_OPTIONS = [
    { key: 'ca_etudie',   label: 'Budget total'  },
    { key: 'ca_gagne',    label: 'CA gagné'      },
    { key: 'count',       label: 'Nb projets'    },
    { key: 'pipeline',    label: 'Pipeline pond.'},
  ];
  const STATUT_OPTIONS = [
    { key: 'tous',    label: 'Tous'    },
    { key: 'obtenu',  label: 'Obtenus' },
    { key: 'perdu',   label: 'Perdus'  },
    { key: 'offre',   label: 'Offres'  },
  ];

  // ─────────────────────────────────────────────────────────
  // Enregistrement
  // ─────────────────────────────────────────────────────────
  /**
   * @param {string}   chartId
   * @param {Object}   options
   * @param {string}   [options.axeX='Client']
   * @param {string}   [options.valeur='ca_etudie']
   * @param {string}   [options.statut='tous']
   * @param {Function} options.onApply   Callback(config) appelé après modification
   */
  function register(chartId, options) {
    if (!chartId || typeof options.onApply !== 'function') {
      console.error('[ChartConfigManager] register() nécessite chartId et options.onApply');
      return;
    }

    _registry.set(chartId, {
      config: {
        axeX:   options.axeX   || 'Client',
        valeur: options.valeur || 'ca_etudie',
        statut: options.statut || 'tous',
      },
      onApply: options.onApply
    });
  }

  // ─────────────────────────────────────────────────────────
  // Injection du bouton ⚙️
  // ─────────────────────────────────────────────────────────
  function injectConfigButton(chartId, chartFilterConfig) {
    // Trouver le canvas
    const canvas = document.getElementById(chartId);
    if (!canvas) return;

    // Chercher le parent .chart-card ou remonter de 2 niveaux
    let card = canvas.closest('.chart-card, .chart-section, .card');
    if (!card) card = canvas.parentElement;
    if (!card) return;

    // Éviter les doublons
    if (card.querySelector(`.ccm-btn[data-chart="${chartId}"]`)) return;

    // Créer le bouton
    const btn = document.createElement('button');
    btn.className    = 'ccm-btn';
    btn.dataset.chart = chartId;
    btn.title        = 'Configurer ce graphique';
    btn.innerHTML    = '⚙️';
    btn.style.cssText = `
      position: absolute;
      top: 8px;
      right: 8px;
      z-index: 10;
      background: rgba(0,212,170,.12);
      border: 1px solid rgba(0,212,170,.3);
      border-radius: 6px;
      color: #00d4aa;
      font-size: .8rem;
      padding: .2rem .4rem;
      cursor: pointer;
      line-height: 1;
      transition: background .15s, border-color .15s, transform .15s;
    `;
    btn.addEventListener('mouseenter', () => {
      btn.style.background   = 'rgba(0,212,170,.25)';
      btn.style.borderColor  = 'rgba(0,212,170,.6)';
      btn.style.transform    = 'scale(1.1)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background   = 'rgba(0,212,170,.12)';
      btn.style.borderColor  = 'rgba(0,212,170,.3)';
      btn.style.transform    = 'scale(1)';
    });
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      _openModal(chartId);
    });

    // S'assurer que le card est en position relative
    if (window.getComputedStyle(card).position === 'static') {
      card.style.position = 'relative';
    }

    card.appendChild(btn);
    console.log(`[ChartConfigManager] Bouton ⚙️ injecté pour "${chartId}"`);
  }

  // ─────────────────────────────────────────────────────────
  // Modal de configuration
  // ─────────────────────────────────────────────────────────
  function _openModal(chartId) {
    const entry = _registry.get(chartId);
    if (!entry) {
      console.warn(`[ChartConfigManager] "${chartId}" non enregistré dans ChartConfigManager`);
      return;
    }

    // Fermer si déjà ouvert
    const existing = document.getElementById('ccm-modal-' + chartId);
    if (existing) { existing.remove(); return; }

    const { config } = entry;

    // Créer le modal
    const modal = document.createElement('div');
    modal.id          = 'ccm-modal-' + chartId;
    modal.className   = 'ccm-modal';
    modal.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 9999;
      background: #0f1723;
      border: 1px solid rgba(0,212,170,.3);
      border-radius: 12px;
      padding: 1.25rem 1.5rem;
      min-width: 320px;
      box-shadow: 0 12px 40px rgba(0,0,0,.7);
      font-family: system-ui, sans-serif;
    `;

    // Overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 9998;
      background: rgba(0,0,0,.5); backdrop-filter: blur(2px);
    `;
    overlay.addEventListener('click', () => { modal.remove(); overlay.remove(); });

    const _row = (label, content) => `
      <div style="margin-bottom:.9rem;">
        <label style="display:block;font-size:.68rem;color:#9fb3c8;text-transform:uppercase;letter-spacing:.06em;margin-bottom:.4rem;">${label}</label>
        ${content}
      </div>`;

    const _chips = (name, options, currentVal) =>
      options.map(opt => {
        const key   = typeof opt === 'object' ? opt.key   : opt;
        const label = typeof opt === 'object' ? opt.label : opt;
        const active = key === currentVal;
        return `<button
          type="button"
          class="ccm-chip"
          data-field="${name}"
          data-value="${key}"
          style="
            display:inline-block;
            padding:.25rem .7rem;
            margin:.15rem;
            border-radius:99px;
            font-size:.72rem;
            cursor:pointer;
            background:${active ? 'rgba(0,212,170,.2)' : 'rgba(255,255,255,.04)'};
            border:1px solid ${active ? 'rgba(0,212,170,.5)' : 'rgba(255,255,255,.08)'};
            color:${active ? '#00d4aa' : '#9fb3c8'};
            transition:all .15s;
          "
        >${label}</button>`;
      }).join('');

    modal.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;">
        <span style="font-size:.88rem;font-weight:700;color:#dce8f5;">⚙️ Configuration graphique</span>
        <button id="ccm-close-${chartId}" style="
          background:rgba(255,77,109,.12);border:1px solid rgba(255,77,109,.25);
          color:#ff4d6d;border-radius:6px;width:24px;height:24px;
          font-size:.72rem;cursor:pointer;line-height:1;
        ">✕</button>
      </div>
      ${_row('Axe X', _chips('axeX', AXE_OPTIONS, config.axeX))}
      ${_row('Valeur', _chips('valeur', VALEUR_OPTIONS, config.valeur))}
      ${_row('Statut', _chips('statut', STATUT_OPTIONS, config.statut))}
      <div style="text-align:right;margin-top:1rem;">
        <button id="ccm-apply-${chartId}" style="
          padding:.35rem .9rem;
          background:rgba(0,212,170,.18);border:1px solid rgba(0,212,170,.45);
          border-radius:8px;color:#00d4aa;font-size:.78rem;cursor:pointer;font-weight:600;
        ">✅ Appliquer</button>
      </div>
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(modal);

    // Fermer
    document.getElementById('ccm-close-' + chartId).addEventListener('click', () => {
      modal.remove(); overlay.remove();
    });

    // Chips interactifs
    modal.querySelectorAll('.ccm-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const field = chip.dataset.field;
        const value = chip.dataset.value;
        // Déselectionner les autres chips du même groupe
        modal.querySelectorAll(`.ccm-chip[data-field="${field}"]`).forEach(c => {
          c.style.background  = 'rgba(255,255,255,.04)';
          c.style.borderColor = 'rgba(255,255,255,.08)';
          c.style.color       = '#9fb3c8';
        });
        // Activer le chip cliqué
        chip.style.background  = 'rgba(0,212,170,.2)';
        chip.style.borderColor = 'rgba(0,212,170,.5)';
        chip.style.color       = '#00d4aa';
        // Mettre à jour la config locale du modal
        chip._selected = true;
      });
    });

    // Appliquer
    document.getElementById('ccm-apply-' + chartId).addEventListener('click', () => {
      // Lire les valeurs sélectionnées depuis les chips actifs
      ['axeX', 'valeur', 'statut'].forEach(field => {
        const activeChip = Array.from(modal.querySelectorAll(`.ccm-chip[data-field="${field}"]`))
          .find(c => c.style.color === 'rgb(0, 212, 170)');
        if (activeChip) config[field] = activeChip.dataset.value;
      });

      _registry.set(chartId, { config, onApply: entry.onApply });

      console.log(`[ChartConfigManager] Appliquer config pour "${chartId}":`, config);
      try {
        entry.onApply({ ...config });
      } catch (e) {
        console.error('[ChartConfigManager] Erreur dans onApply:', e);
      }

      modal.remove(); overlay.remove();
    });
  }

  // ─────────────────────────────────────────────────────────
  // Obtenir la config courante d'un graphique
  // ─────────────────────────────────────────────────────────
  function getConfig(chartId) {
    const entry = _registry.get(chartId);
    return entry ? { ...entry.config } : null;
  }

  // ─────────────────────────────────────────────────────────
  // Nettoyage — unregister (module 5 : pas de fuite mémoire)
  // ─────────────────────────────────────────────────────────
  /**
   * Supprime l'enregistrement ET le bouton ⚙️ du DOM.
   * À appeler avant destroy() d'un graphique.
   */
  function unregister(chartId) {
    _registry.delete(chartId);

    // Retirer le bouton ⚙️ du DOM
    const btn = document.querySelector(`.ccm-btn[data-chart="${chartId}"]`);
    if (btn) btn.remove();

    // Fermer le modal s'il est ouvert
    const modal   = document.getElementById('ccm-modal-' + chartId);
    const overlay = modal ? modal.previousElementSibling : null;
    if (modal)   modal.remove();
    if (overlay && overlay.style.position === 'fixed') overlay.remove();

    console.log(`[ChartConfigManager] unregister("${chartId}") — nettoyage complet`);
  }

  /**
   * Supprime tous les enregistrements et tous les boutons.
   * Utile avant un re-render complet.
   */
  function unregisterAll() {
    const ids = [..._registry.keys()];
    ids.forEach(id => unregister(id));
    console.log(`[ChartConfigManager] unregisterAll() — ${ids.length} graphiques nettoyés`);
  }

  // ─────────────────────────────────────────────────────────
  // Auto-register helper : enregistrer + injecter bouton en 1 appel
  // Compatible showConfigButton: true dans ChartFilterController
  // ─────────────────────────────────────────────────────────
  /**
   * Version tout-en-un : register() + injectConfigButton().
   * À appeler juste après la création du graphique.
   *
   * @param {string}   chartId
   * @param {Object}   options
   * @param {string}   [options.axeX='Client']
   * @param {string}   [options.valeur='ca_etudie']
   * @param {string}   [options.statut='tous']
   * @param {Function} options.onApply    Callback(config)
   * @param {boolean}  [options.showConfigButton=true]
   */
  function setup(chartId, options) {
    if (!chartId || typeof options.onApply !== 'function') {
      console.error('[ChartConfigManager] setup() nécessite chartId et options.onApply');
      return;
    }
    // Nettoyer d'abord si déjà enregistré (destroy propre)
    if (_registry.has(chartId)) unregister(chartId);

    register(chartId, options);

    if (options.showConfigButton !== false) {
      // Délai court pour laisser le canvas être dans le DOM
      const tryInject = (attempts) => {
        const canvas = document.getElementById(chartId);
        if (canvas) {
          injectConfigButton(chartId);
        } else if (attempts > 0) {
          setTimeout(() => tryInject(attempts - 1), 100);
        }
      };
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => tryInject(5));
      } else {
        setTimeout(() => tryInject(5), 50);
      }
    }
  }

  // ─────────────────────────────────────────────────────────
  // Injecter le CSS du module
  // ─────────────────────────────────────────────────────────
  function injectCSS() {
    if (document.getElementById('ccm-styles')) return;
    const style = document.createElement('style');
    style.id = 'ccm-styles';
    style.textContent = `
      .ccm-modal { animation: ccm-fade-in .18s ease; }
      @keyframes ccm-fade-in {
        from { opacity: 0; transform: translate(-50%, -52%); }
        to   { opacity: 1; transform: translate(-50%, -50%); }
      }
      .ccm-chip:hover {
        background: rgba(0,212,170,.12) !important;
        border-color: rgba(0,212,170,.35) !important;
        color: #b2f5e8 !important;
      }
    `;
    document.head.appendChild(style);
  }

  // Auto-inject CSS
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', injectCSS);
    } else {
      injectCSS();
    }
  }

  console.log('%c⚙️ ChartConfigManager v2.0 chargé — unregister + setup + showConfigButton', 'color:#00d4aa;font-weight:700');

  return {
    register,
    setup,
    injectConfigButton,
    getConfig,
    unregister,
    unregisterAll,
  };
})();
} // end guard !window.ChartConfigManager
