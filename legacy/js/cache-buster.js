/* =====================================================
   CACHE-BUSTER.JS — Détection automatique des changements
   
   Solves:
   - Désynchronisation data ↔️ localStorage
   - Besoin de vider cookies manuellement
   - Analytics ne voit pas les mêmes projets
   
   À charger AVANT data.js et app.js
===================================================== */

(function (global) {
  'use strict';

  const CacheBuster = {
    
    // Clés localStorage
    STORAGE_KEYS: [
      'cahors-data-v25',
      'cahors-columns-v2',
      'cahors-custom-cols-v1',
      'cahors-col-order-v1',
      'cahors-notes-v1',
      'cahors-filters-v1',
      'cahors-data-version'  // Version control
    ],

    /**
     * Initialiser le système de cache-busting
     * Doit être appelé AVANT que data.js soit chargé
     */
    init() {
      console.log('[CacheBuster] Initialisation...');
      
      // Attendre que DATA soit disponible
      const checkData = setInterval(() => {
        if (window.DATA && Array.isArray(window.DATA)) {
          clearInterval(checkData);
          this.check();
        }
      }, 50);

      // Timeout de sécurité
      setTimeout(() => {
        if (!window.DATA) {
          console.warn('[CacheBuster] DATA pas chargé après 5s, skip check');
          clearInterval(checkData);
        }
      }, 5000);
    },

    /**
     * Vérifier la cohérence des données
     */
    check() {
      console.log('[CacheBuster] Vérification des données...');
      
      const dataCount = window.DATA.length;
      const savedVersion = this.getSavedVersion();
      const currentVersion = this.generateVersion();

      console.log(`  DATA.length: ${dataCount}`);
      console.log(`  Saved version: ${savedVersion}`);
      console.log(`  Current version: ${currentVersion}`);

      // Si versions différentes → vider le cache
      if (savedVersion !== currentVersion) {
        console.warn('[CacheBuster] ⚠️  Changement détecté!');
        console.log(`  Ancien: ${savedVersion}`);
        console.log(`  Nouveau: ${currentVersion}`);
        this.clearCache();
        this.saveVersion(currentVersion);
      } else {
        console.log('[CacheBuster] ✅ Cache cohérent');
      }
    },

    /**
     * Générer une version basée sur les données
     * Hash simple des données (nombre de projets + première/dernière clé)
     */
    generateVersion() {
      if (!window.DATA || !Array.isArray(window.DATA)) return null;
      
      const count = window.DATA.length;
      const first = window.DATA[0];
      const last = window.DATA[count - 1];
      
      // Créer un identifiant unique des données
      const hash = `${count}_${first?.id || 0}_${last?.id || count - 1}`;
      
      return hash;
    },

    /**
     * Récupérer la version sauvegardée
     */
    getSavedVersion() {
      try {
        const saved = localStorage.getItem('cahors-data-version');
        return saved || null;
      } catch (e) {
        return null;
      }
    },

    /**
     * Sauvegarder la version actuelle
     */
    saveVersion(version) {
      try {
        localStorage.setItem('cahors-data-version', version);
        console.log(`[CacheBuster] Version sauvegardée: ${version}`);
      } catch (e) {
        console.error('[CacheBuster] Erreur sauvegarde version:', e);
      }
    },

    /**
     * Vider complètement le localStorage
     */
    clearCache() {
      console.log('[CacheBuster] 🗑️  Nettoyage du cache...');
      
      this.STORAGE_KEYS.forEach(key => {
        try {
          if (localStorage.getItem(key)) {
            localStorage.removeItem(key);
            console.log(`  ✓ Supprimé: ${key}`);
          }
        } catch (e) {
          console.error(`  ✗ Erreur suppression ${key}:`, e);
        }
      });

      console.log('[CacheBuster] ✅ Cache vidé');
    },

    /**
     * Forcer le vidage du cache (pour développement)
     */
    forceClear() {
      console.warn('[CacheBuster] ⚠️  Forçage du vidage...');
      this.clearCache();
      this.saveVersion(this.generateVersion());
      console.log('[CacheBuster] Rechargez la page (F5)');
    },

    /**
     * Mode debug : afficher l'état actuel
     */
    debug() {
      console.group('[CacheBuster] DEBUG');
      console.log('DATA disponible:', !!window.DATA);
      if (window.DATA) {
        console.log('DATA.length:', window.DATA.length);
        console.log('Premier projet:', window.DATA[0]);
      }
      console.log('Version actuelle:', this.generateVersion());
      console.log('Version sauvegardée:', this.getSavedVersion());
      console.log('localStorage keys:');
      this.STORAGE_KEYS.forEach(key => {
        const exists = localStorage.getItem(key);
        console.log(`  ${key}: ${exists ? '✓' : '✗'}`);
      });
      console.groupEnd();
    }
  };

  // Exposer globalement
  global.CacheBuster = CacheBuster;

  // Initialiser automatiquement au chargement du DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => CacheBuster.init());
  } else {
    // DOM déjà chargé
    CacheBuster.init();
  }

})(window);
