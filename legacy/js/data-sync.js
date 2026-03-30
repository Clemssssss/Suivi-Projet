(function (global) {
  'use strict';

  const DataSync = {
    
    init() {
      console.log('[DataSync] Initialisation synchronisation des données...');
      
      if (!window.DATA || !Array.isArray(window.DATA)) {
        console.error('[DataSync] DATA non disponible');
        return false;
      }

      const count = window.DATA.length;
      console.log(`[DataSync] ✅ ${count} projets chargés depuis data.js`);

      this.validateData();
      return true;
    },

    validateData() {
      const data = window.DATA || [];
      let validCount = 0;
      let invalidCount = 0;

      data.forEach((p, i) => {
        if (!p.id) {
          console.warn(`[DataSync] Projet ${i} sans ID`);
          invalidCount++;
          return;
        }

        if (!p.societe || !p.projet) {
          console.warn(`[DataSync] Projet ${p.id} données incomplètes`);
          invalidCount++;
          return;
        }

        validCount++;
      });

      console.log(`[DataSync] Validation: ${validCount} valides, ${invalidCount} invalides`);
    },

    getProjectCount() {
      return (window.DATA || []).length;
    },

    getProjects() {
      return window.DATA || [];
    },

    getStatuses() {
      const projects = this.getProjects();
      const status = {
        total: projects.length,
        obtenu: 0,
        perdu: 0,
        offre: 0,
        autre: 0
      };

      projects.forEach(p => {
        const s = ProjectUtils.getStatus(p);
        if (status.hasOwnProperty(s)) {
          status[s]++;
        }
      });

      return status;
    },

    getTotalCA(caMode = 'ca_gagne') {
      const projects = this.getProjects();
      return projects.reduce((sum, p) => {
        const ca = ProjectUtils.parseMontant(p[caMode]) || 0;
        return sum + ca;
      }, 0);
    },

    debug() {
      console.group('[DataSync] DEBUG');
      console.log('Total projets:', this.getProjectCount());
      console.log('Statuts:', this.getStatuses());
      console.log('CA Gagné:', ProjectUtils.formatMontant(this.getTotalCA('ca_gagne')));
      console.log('CA Étudié:', ProjectUtils.formatMontant(this.getTotalCA('ca_etudie')));
      console.groupEnd();
    }
  };

  global.DataSync = DataSync;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => DataSync.init());
  } else {
    DataSync.init();
  }

})(window);
