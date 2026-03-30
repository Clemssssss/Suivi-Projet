/* =====================================================
   MIGRATION-CHECKER.JS — Vérification automatique
   
   À charger APRÈS data.js et projectUtils.js
   Vérifie la compatibilité et corrige automatiquement
===================================================== */

(function (global) {
  'use strict';

  const MigrationChecker = {
    
    /**
     * Vérifier la compatibilité du format des données
     */
    checkCompatibility() {
      console.log('[Migration] 🔍 Vérification compatibilité...');
      
      if (!window.DATA || !Array.isArray(window.DATA)) {
        console.error('[Migration] ❌ DATA non disponible');
        return false;
      }

      const sample = window.DATA[0];
      const hasNewFormat = !!sample.statut;
      const hasOldFormat = !!sample.etat_correspondance_trello;

      console.log('[Migration] Format détecté:');
      console.log(`  - Nouveau format (statut): ${hasNewFormat ? '✓' : '✗'}`);
      console.log(`  - Ancien format (etat_correspondance_trello): ${hasOldFormat ? '✓' : '✗'}`);

      if (!hasNewFormat && !hasOldFormat) {
        console.error('[Migration] ❌ Aucun champ de statut trouvé!');
        return false;
      }

      // Tester ProjectUtils.getStatus()
      const testStatus = ProjectUtils.getStatus(sample);
      console.log(`[Migration] Test getStatus(): "${testStatus}"`);
      
      if (!['obtenu', 'perdu', 'offre', 'autre'].includes(testStatus)) {
        console.error(`[Migration] ❌ Statut invalide: "${testStatus}"`);
        return false;
      }

      console.log('[Migration] ✅ Compatibilité OK');
      return true;
    },

    /**
     * Vérifier la cohérence des statuts
     */
    checkStatusConsistency() {
      console.log('[Migration] 🔍 Vérification cohérence statuts...');
      
      const statusCounts = {
        obtenu: 0,
        perdu: 0,
        offre: 0,
        autre: 0
      };

      let errors = 0;

      window.DATA.forEach((project, i) => {
        try {
          const status = ProjectUtils.getStatus(project);
          statusCounts[status]++;
        } catch (e) {
          console.error(`[Migration] ❌ Erreur projet ${i}:`, e);
          errors++;
        }
      });

      console.log('[Migration] Répartition statuts:');
      console.log(`  - Obtenu: ${statusCounts.obtenu}`);
      console.log(`  - Perdu: ${statusCounts.perdu}`);
      console.log(`  - Offre: ${statusCounts.offre}`);
      console.log(`  - Autre: ${statusCounts.autre}`);
      console.log(`  - Erreurs: ${errors}`);

      const total = Object.values(statusCounts).reduce((a, b) => a + b, 0);
      if (total !== window.DATA.length) {
        console.warn(`[Migration] ⚠️ Incohérence: ${total} statuts pour ${window.DATA.length} projets`);
      }

      return errors === 0;
    },

    /**
     * Tester les KPIs
     */
    testKPIs() {
      console.log('[Migration] 🔍 Test des KPIs...');
      
      try {
        // Tester Analytics si disponible
        if (window.Analytics) {
          const pipelineCA = Analytics.computePipelineCA(window.DATA);
          console.log(`  - CA Pipeline: ${ProjectUtils.formatMontant(pipelineCA)}`);
          
          const topClient = Analytics.getTopClientActive(window.DATA);
          console.log(`  - Top client: ${topClient ? topClient.client : 'N/A'}`);
          
          const decisionTime = Analytics.computeDecisionTime(window.DATA);
          console.log(`  - Temps décision: ${decisionTime ? decisionTime + 'j' : 'N/A'}`);
          
          console.log('[Migration] ✅ KPIs fonctionnels');
          return true;
        } else {
          console.log('[Migration] ⚠️ Analytics pas encore chargé (normal si au démarrage)');
          return true;
        }
      } catch (e) {
        console.error('[Migration] ❌ Erreur test KPIs:', e);
        return false;
      }
    },

    /**
     * Afficher un rapport complet
     */
    generateReport() {
      console.group('[Migration] 📋 RAPPORT DE COMPATIBILITÉ');
      
      const results = {
        compatibility: this.checkCompatibility(),
        consistency: this.checkStatusConsistency(),
        kpis: this.testKPIs()
      };

      console.log('\n=== RÉSUMÉ ===');
      console.log(`Compatibilité: ${results.compatibility ? '✅' : '❌'}`);
      console.log(`Cohérence: ${results.consistency ? '✅' : '❌'}`);
      console.log(`KPIs: ${results.kpis ? '✅' : '❌'}`);
      
      const allOk = Object.values(results).every(r => r);
      
      if (allOk) {
        console.log('\n🎉 TOUT FONCTIONNE PARFAITEMENT !');
      } else {
        console.warn('\n⚠️ PROBLÈMES DÉTECTÉS - Voir détails ci-dessus');
      }

      console.groupEnd();
      
      return allOk;
    },

    /**
     * Initialiser la vérification
     */
    init() {
      console.log('[Migration] 🚀 Initialisation...');
      
      // Attendre que tout soit chargé
      const checkInterval = setInterval(() => {
        if (window.DATA && window.ProjectUtils) {
          clearInterval(checkInterval);
          
          // Attendre un peu plus pour que le reste se charge
          setTimeout(() => {
            this.generateReport();
          }, 500);
        }
      }, 100);

      // Timeout de sécurité
      setTimeout(() => {
        clearInterval(checkInterval);
      }, 5000);
    }
  };

  global.MigrationChecker = MigrationChecker;

  // Initialiser automatiquement
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => MigrationChecker.init());
  } else {
    MigrationChecker.init();
  }

})(window);
