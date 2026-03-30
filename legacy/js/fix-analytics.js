/* =====================================================
   FIX-ANALYTICS.JS — Synchronisation Analytics
   
   Problème: Analytics affiche un nombre différent de projets
   Cause: LocalStorage cache vs Data.js différents
   Solution: Détection et correction automatique
   
   À charger AVANT app.js
===================================================== */

(function (global) {
  'use strict';

  const AnalyticsFix = {
    
    /**
     * Vérifier la cohérence des données
     */
    checkDataConsistency() {
      console.log('[AnalyticsFix] Vérification cohérence données...');

      const dataCount = window.DATA ? window.DATA.length : 0;
      const appCount = window.App && window.App.data && window.App.data.projects 
        ? window.App.data.projects.length 
        : 0;
      const analyticsFix = window.Analytics ? 'loaded' : 'missing';

      console.log(`  DATA.length: ${dataCount}`);
      console.log(`  App.data.projects.length: ${appCount}`);
      console.log(`  Analytics: ${analyticsFix}`);

      if (dataCount !== appCount) {
        console.warn(`⚠️  DÉSYNC: DATA(${dataCount}) ≠ App(${appCount})`);
        return false;
      }

      console.log('✅ Données cohérentes');
      return true;
    },

    /**
     * Recalculer les KPIs avec les bonnes données
     */
    recalculateKPIs(projects) {
      if (!projects || !Array.isArray(projects)) {
        console.error('[AnalyticsFix] Projets invalides');
        return;
      }

      console.log(`[AnalyticsFix] Recalcul KPIs pour ${projects.length} projets`);

      const stats = {
        total: projects.length,
        obtenu: 0,
        perdu: 0,
        offre: 0,
        totalPower: 0,
        totalMachines: 0,
        totalCA: 0
      };

      projects.forEach(p => {
        const status = ProjectUtils.getStatus(p);
        
        if (status === 'obtenu') stats.obtenu++;
        else if (status === 'perdu') stats.perdu++;
        else if (status === 'offre') stats.offre++;

        stats.totalPower += parseFloat(p.puissance_mw) || 0;
        stats.totalMachines += parseInt(p.nombre_machines, 10) || 0;
        stats.totalCA += ProjectUtils.parseMontant(p.montant) || 0;
      });

      console.log('[AnalyticsFix] KPIs recalculés:', stats);
      return stats;
    },

    /**
     * Fixer la désynchronisation
     */
    fixDesync() {
      console.warn('[AnalyticsFix] Tentative de correction...');

      if (!window.DATA || !window.App) {
        console.error('[AnalyticsFix] Dépendances manquantes');
        return false;
      }

      // Recharger depuis data.js dans app.js
      const oldProjects = window.App.data.projects;
      window.App.data.projects = window.DATA.map((d, i) => {
        const p = ProjectUtils.normalizeProject(d, i);
        return p;
      });

      console.log(`[AnalyticsFix] ✅ Projets reloadés: ${oldProjects.length} → ${window.App.data.projects.length}`);
      
      return true;
    },

    /**
     * Initialiser la vérification
     */
    init() {
      console.log('[AnalyticsFix] Initialisation...');

      // Attendre que tout soit chargé
      const checkInterval = setInterval(() => {
        if (window.DATA && window.App && window.ProjectUtils && window.Analytics) {
          clearInterval(checkInterval);
          
          const isConsistent = this.checkDataConsistency();
          
          if (!isConsistent) {
            this.fixDesync();
            
            // Vérifier à nouveau
            setTimeout(() => {
              this.checkDataConsistency();
            }, 100);
          }
        }
      }, 100);

      // Timeout de sécurité
      setTimeout(() => {
        clearInterval(checkInterval);
        console.log('[AnalyticsFix] Timeout - Vérification complétée');
      }, 5000);
    },

    /**
     * DEBUG: Afficher l'état actuel
     */
    debug() {
      console.group('[AnalyticsFix] DEBUG');
      
      console.log('DATA:', {
        length: window.DATA?.length || 0,
        sample: window.DATA?.[0]
      });

      console.log('App.data.projects:', {
        length: window.App?.data?.projects?.length || 0,
        sample: window.App?.data?.projects?.[0]
      });

      console.log('Analytics:', {
        available: typeof window.Analytics !== 'undefined',
        functions: Object.keys(window.Analytics || {}).slice(0, 5)
      });

      console.groupEnd();
    }
  };

  global.AnalyticsFix = AnalyticsFix;

  // Initialiser automatiquement
  window.addEventListener('load', () => {
    AnalyticsFix.init();
  });

})(window);
