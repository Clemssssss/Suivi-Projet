/**
 * ╔════════════════════════════════════════════════════════════════════════════╗
 * ║          SYSTÈME DE FILTRAGE INTERACTIF POUR GRAPHIQUES - VERSION COMPLÈTE║
 * ║  Cliquer sur un élément = Filtrer | Recliquer = Dé-filtrer | Auto-update ║
 * ║                     INTÉGRATION TOTALE AVEC VOTRE CODE                    ║
 * ╚════════════════════════════════════════════════════════════════════════════╝
 */

(function (global) {
  'use strict';

  // ════════════════════════════════════════════════════════════════════════════
  // 1. VÉRIFICATIONS PRÉALABLES - S'assurer que les dépendances existent
  // ════════════════════════════════════════════════════════════════════════════

  // Vérifier que ProjectUtils existe (depuis projectUtils.js)
  if (typeof ProjectUtils === 'undefined') {
    console.error('❌ InteractiveFiltering: ProjectUtils n\'est pas chargé!');
    console.warn('Assurez-vous que projectUtils.js est chargé AVANT interactive-filtering.js');
    return;
  }

  // Vérifier que ChartsEnrichis existe (depuis charts-enrichis.js)
  if (typeof ChartsEnrichis === 'undefined') {
    console.error('❌ InteractiveFiltering: ChartsEnrichis n\'est pas chargé!');
    console.warn('Assurez-vous que charts-enrichis.js est chargé AVANT interactive-filtering.js');
    return;
  }

  // Vérifier que Chart.js existe
  if (typeof Chart === 'undefined') {
    console.error('❌ InteractiveFiltering: Chart.js n\'est pas chargé!');
    return;
  }

  console.log('✅ InteractiveFiltering: Toutes les dépendances sont présentes');

  // ════════════════════════════════════════════════════════════════════════════
  // 2. DÉFINITION DU MODULE PRINCIPAL
  // ════════════════════════════════════════════════════════════════════════════

  const InteractiveFiltering = {
    // State management
    activeFilters: {}, // { filterType: [values] }
    originalData: null,
    filteredData: null,
    projects: null,

    // UI Elements
    filterBadge: null,
    clearButton: null,

    // Config
    config: {
      enableLogging: true,
      autoUpdateCharts: true,
      animationDuration: 300
    },

    /**
     * ════════════════════════════════════════════════════════════════════════
     * INITIALISATION
     * ════════════════════════════════════════════════════════════════════════
     */

    /**
     * Initialise le système de filtrage
     * @param {Array} projects - Tableau des projets original
     * @param {Object} options - Options de configuration
     */
    init(projects, options = {}) {
      if (!projects || !Array.isArray(projects)) {
        this.log('❌ Erreur: projects doit être un array', 'error');
        return false;
      }

      this.projects = projects;
      this.originalData = JSON.parse(JSON.stringify(projects));
      this.filteredData = JSON.parse(JSON.stringify(projects));

      // Fusionner les options
      Object.assign(this.config, options);

      this.setupUI();
      this.attachChartListeners();
      this.log(`✅ Système de filtrage initialisé (${projects.length} projets)`, 'success');

      // Callback optionnel après initialisation
      if (options.onInit) options.onInit();

      return true;
    },

    /**
     * ════════════════════════════════════════════════════════════════════════
     * GESTION DE L'INTERFACE
     * ════════════════════════════════════════════════════════════════════════
     */

    /**
     * Configure les éléments UI (badge + bouton réinitialiser)
     */
    setupUI() {
      // Badge des filtres actifs
      if (!document.getElementById('filter-badge')) {
        const badge = document.createElement('div');
        badge.id = 'filter-badge';
        badge.className = 'filter-badge';
        document.body.appendChild(badge);
        this.filterBadge = badge;
      } else {
        this.filterBadge = document.getElementById('filter-badge');
      }

      // Bouton réinitialiser filtres
      if (!document.getElementById('btn-clear-filters')) {
        const btn = document.createElement('button');
        btn.id = 'btn-clear-filters';
        btn.className = 'btn-clear-filters';
        btn.textContent = '✕ Réinitialiser les filtres';
        btn.onclick = () => this.clearAllFilters();
        document.body.appendChild(btn);
        this.clearButton = btn;
      } else {
        this.clearButton = document.getElementById('btn-clear-filters');
        this.clearButton.onclick = () => this.clearAllFilters();
      }

      this.log('✅ UI configurée', 'info');
    },

    /**
     * Met à jour l'UI (badge + bouton)
     */
    updateUI() {
      const filterCount = Object.keys(this.activeFilters).length;
      const hasActiveFilters = filterCount > 0;

      // Mettre à jour le badge
      if (hasActiveFilters) {
        const totalValues = Object.values(this.activeFilters).reduce(
          (sum, arr) => sum + arr.length,
          0
        );
        const text = `${totalValues} filtre${totalValues > 1 ? 's' : ''} actif${totalValues > 1 ? 's' : ''}`;
        this.filterBadge.textContent = text;
        this.filterBadge.style.display = 'block';
        this.log(`📊 ${text}`, 'info');
      } else {
        this.filterBadge.style.display = 'none';
      }

      // Mettre à jour le bouton
      if (hasActiveFilters) {
        this.clearButton.classList.add('show');
      } else {
        this.clearButton.classList.remove('show');
      }

      // Marquer les graphiques filtrés
      const canvases = document.querySelectorAll('canvas');
      canvases.forEach(canvas => {
        if (hasActiveFilters) {
          canvas.setAttribute('data-filter-active', 'true');
          canvas.classList.add('chart-highlighted');
        } else {
          canvas.setAttribute('data-filter-active', 'false');
          canvas.classList.remove('chart-highlighted');
        }
      });
    },

    /**
     * ════════════════════════════════════════════════════════════════════════
     * GESTION DES CLICS SUR LES GRAPHIQUES
     * ════════════════════════════════════════════════════════════════════════
     */

    /**
     * Attache les écouteurs de clic sur tous les graphiques
     */
    attachChartListeners() {
      const canvases = document.querySelectorAll('canvas[data-clickable="true"]');
      this.log(`🎯 ${canvases.length} graphiques cliquables trouvés`, 'info');

      canvases.forEach(canvas => {
        canvas.addEventListener('click', (e) => this.handleChartClick(e));
        canvas.style.cursor = 'pointer';
      });
    },

    /**
     * Gère le clic sur un graphique
     * @param {Event} event - Événement de clic
     */
    handleChartClick(event) {
      const canvas = event.target;
      const chartId = canvas.id;
      const chart = ChartsEnrichis.charts[chartId];

      if (!chart) {
        this.log(`⚠️ Graphique non trouvé: ${chartId}`, 'warn');
        return;
      }

      const elements = chart.getElementsAtEventForMode(
        event,
        'nearest',
        { intersect: true },
        true
      );

      if (elements.length === 0) return;

      const index = elements[0].index;
      const label = chart.data.labels[index];

      // Déterminer le type de filtre basé sur le graphique
      const filterType = this.getFilterTypeFromChart(chartId);

      if (filterType) {
        this.log(`🔍 Clic: ${filterType} = ${label}`, 'log');
        this.toggleFilter(filterType, label);
      }
    },

    /**
     * Détermine le type de filtre selon l'ID du graphique
     * @param {string} chartId - ID du canvas
     * @returns {string|null} Type de filtre
     */
    getFilterTypeFromChart(chartId) {
      const mapping = {
        'chart-perdu': 'societe',
        'chart-obtenu': 'societe',
        'chart-obtenu-zone': 'zone',
        'chart-ca-by-company': 'societe',
        'chart-ca-by-status': 'status',
        'chart-machines-by-zone': 'zone',
        'chart-offer-type': 'type_offre',
        'chart-partner': 'partenaire',
        'chart-power-by-status': 'status',
        'chart-ca-comparison': 'societe',
        'chart-ca-by-client': 'client',
        'chart-ca-by-zone': 'zone',
        'chart-ca-by-year': 'annee',
        'chart-status-by-zone': 'zone',
        'chart-win-rate': 'zone',
        'chart-handover': 'handover',
        'chart-avg-power': 'zone',
        'chart-response-rate': 'zone',
        'chart-density-region': 'region',
        'chart-decision-time': 'decision_time'
      };

      return mapping[chartId] || null;
    },

    /**
     * ════════════════════════════════════════════════════════════════════════
     * GESTION DES FILTRES
     * ════════════════════════════════════════════════════════════════════════
     */

    /**
     * Active ou désactive un filtre
     * @param {string} filterType - Type de filtre (societe, zone, status, etc.)
     * @param {string} value - Valeur à filtrer
     */
    toggleFilter(filterType, value) {
      if (!this.activeFilters[filterType]) {
        this.activeFilters[filterType] = [];
      }

      const index = this.activeFilters[filterType].indexOf(value);

      if (index > -1) {
        // Retirer le filtre (déclicker)
        this.activeFilters[filterType].splice(index, 1);
        if (this.activeFilters[filterType].length === 0) {
          delete this.activeFilters[filterType];
        }
        this.log(`📍 Filtre retiré: ${filterType} = ${value}`, 'log');
      } else {
        // Ajouter le filtre (cliquer)
        this.activeFilters[filterType].push(value);
        this.log(`📍 Filtre ajouté: ${filterType} = ${value}`, 'log');
      }

      this.applyFilters();
    },

    /**
     * Applique tous les filtres actifs et actualise les graphiques
     */
    applyFilters() {
      // Filtrer les données
      this.filteredData = this.originalData.filter(project => {
        for (let filterType in this.activeFilters) {
          const values = this.activeFilters[filterType];
          const projectValue = this.getProjectValue(project, filterType);

          // Si la valeur du projet ne correspond à aucune valeur filtrée, exclure
          if (!values.includes(projectValue)) {
            return false;
          }
        }
        return true;
      });

      this.log(`📊 Données filtrées: ${this.filteredData.length}/${this.originalData.length}`, 'info');

      // Mettre à jour l'UI
      this.updateUI();

      // Rafraîchir tous les graphiques
      if (this.config.autoUpdateCharts) {
        this.refreshAllCharts();
      }
    },

    /**
     * Obtient la valeur d'un projet pour un type de filtre
     * @param {Object} project - Projet
     * @param {string} filterType - Type de filtre
     * @returns {any} Valeur du projet
     */
    getProjectValue(project, filterType) {
      try {
        const mapping = {
          status: () => ProjectUtils.getStatus(project),
          societe: () => project.societe || 'Non spécifié',
          zone: () => project.zone || 'Non spécifié',
          client: () => project.client || 'Non spécifié',
          type_offre: () => project.type_offre || 'Non spécifié',
          partenaire: () => project.partenaire || 'Non spécifié',
          annee: () => project.annee || new Date().getFullYear(),
          handover: () => project.handover ? 'Oui' : 'Non',
          region: () => project.region || 'Non spécifié',
          decision_time: () => project.decision_time || 0
        };

        return mapping[filterType] ? mapping[filterType]() : project[filterType];
      } catch (err) {
        this.log(`⚠️ Erreur getProjectValue(${filterType}): ${err.message}`, 'warn');
        return null;
      }
    },

    /**
     * Réinitialise tous les filtres
     */
    clearAllFilters() {
      this.activeFilters = {};
      this.filteredData = JSON.parse(JSON.stringify(this.originalData));
      this.log('🔄 Tous les filtres réinitialisés', 'info');
      this.updateUI();
      this.refreshAllCharts();
    },

    /**
     * ════════════════════════════════════════════════════════════════════════
     * RAFRAÎCHISSEMENT DES GRAPHIQUES
     * ════════════════════════════════════════════════════════════════════════
     */

    /**
     * Rafraîchit tous les graphiques avec les données filtrées
     */
    refreshAllCharts() {
      const chartIds = Object.keys(ChartsEnrichis.charts);
      this.log(`🔄 Rafraîchissement de ${chartIds.length} graphiques...`, 'info');

      chartIds.forEach(chartId => {
        this.refreshChart(chartId);
      });
    },

    /**
     * Rafraîchit un graphique spécifique
     * @param {string} chartId - ID du graphique
     */
    refreshChart(chartId) {
      const chart = ChartsEnrichis.charts[chartId];
      if (!chart) return;

      // Recalculer les données pour ce graphique
      const newData = this.calculateChartData(chartId, this.filteredData);

      if (newData) {
        chart.data = newData;
        chart.update('none'); // Update sans animation pour fluidité
      }
    },

    /**
     * Recalcule les données d'un graphique basé sur les données filtrées
     * @param {string} chartId - ID du graphique
     * @param {Array} data - Données filtrées
     * @returns {Object|null} Nouvelle configuration de données
     */
    calculateChartData(chartId, data) {
      const calculators = {
        'chart-perdu': () => this.calcChartPerdu(data),
        'chart-obtenu': () => this.calcChartObtenu(data),
        'chart-obtenu-zone': () => this.calcChartObtenuZone(data),
        'chart-ca-by-company': () => this.calcCAByCompany(data),
        'chart-ca-by-status': () => this.calcCAByStatus(data),
        'chart-machines-by-zone': () => this.calcMachinesByZone(data),
        'chart-offer-type': () => this.calcOfferType(data),
        'chart-partner': () => this.calcPartner(data),
        'chart-power-by-status': () => this.calcPowerByStatus(data),
        'chart-ca-comparison': () => this.calcCAComparison(data),
        'chart-ca-by-client': () => this.calcCAByClient(data),
        'chart-ca-by-zone': () => this.calcCAByZone(data),
        'chart-ca-by-year': () => this.calcCAByYear(data),
        'chart-status-by-zone': () => this.calcStatusByZone(data),
        'chart-win-rate': () => this.calcWinRate(data),
        'chart-handover': () => this.calcHandover(data),
        'chart-avg-power': () => this.calcAvgPower(data),
        'chart-response-rate': () => this.calcResponseRate(data),
        'chart-density-region': () => this.calcDensityRegion(data),
        'chart-decision-time': () => this.calcDecisionTime(data)
      };

      const calculator = calculators[chartId];
      return calculator ? calculator() : null;
    },

    /**
     * ════════════════════════════════════════════════════════════════════════
     * CALCULATEURS DE DONNÉES POUR CHAQUE GRAPHIQUE
     * ════════════════════════════════════════════════════════════════════════
     */

    calcChartPerdu(projects) {
      const perdu = projects.filter(p => ProjectUtils.getStatus(p) === 'perdu');
      const clientData = {};

      perdu.forEach(p => {
        const client = p.societe || 'Non spécifié';
        clientData[client] = (clientData[client] || 0) + 1;
      });

      const sortedData = Object.entries(clientData)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

      return {
        labels: sortedData.map(([client]) => client.substring(0, 20)),
        datasets: [{
          label: 'Projets perdus',
          data: sortedData.map(([, count]) => count),
          backgroundColor: [
            'rgba(255, 77, 109, 0.8)',
            'rgba(255, 77, 109, 0.7)',
            'rgba(255, 77, 109, 0.6)',
            'rgba(255, 77, 109, 0.5)',
            'rgba(255, 77, 109, 0.4)',
            'rgba(255, 77, 109, 0.3)',
            'rgba(255, 77, 109, 0.25)',
            'rgba(255, 77, 109, 0.2)',
            'rgba(255, 77, 109, 0.15)',
            'rgba(255, 77, 109, 0.1)',
          ],
          borderColor: 'rgba(255, 77, 109, 1)',
          borderWidth: 2,
          borderRadius: 8,
          hoverBackgroundColor: 'rgba(255, 77, 109, 0.95)',
          hoverBorderColor: '#ff4d6d',
          hoverBorderWidth: 3
        }]
      };
    },

    calcChartObtenu(projects) {
      const obtenu = projects.filter(p => ProjectUtils.getStatus(p) === 'obtenu');
      const clientData = {};

      obtenu.forEach(p => {
        const client = p.societe || 'Non spécifié';
        clientData[client] = (clientData[client] || 0) + 1;
      });

      const sortedData = Object.entries(clientData)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

      return {
        labels: sortedData.map(([client]) => client.substring(0, 20)),
        datasets: [{
          label: 'Projets obtenus',
          data: sortedData.map(([, count]) => count),
          backgroundColor: [
            'rgba(0, 212, 170, 0.8)',
            'rgba(0, 212, 170, 0.7)',
            'rgba(0, 212, 170, 0.6)',
            'rgba(0, 212, 170, 0.5)',
            'rgba(0, 212, 170, 0.4)',
            'rgba(0, 212, 170, 0.3)',
            'rgba(0, 212, 170, 0.25)',
            'rgba(0, 212, 170, 0.2)',
            'rgba(0, 212, 170, 0.15)',
            'rgba(0, 212, 170, 0.1)',
          ],
          borderColor: 'rgba(0, 212, 170, 1)',
          borderWidth: 2,
          borderRadius: 8,
          hoverBackgroundColor: 'rgba(0, 212, 170, 0.95)',
          hoverBorderColor: '#00d4aa',
          hoverBorderWidth: 3
        }]
      };
    },

    calcChartObtenuZone(projects) {
      const obtenu = projects.filter(p => ProjectUtils.getStatus(p) === 'obtenu');
      const zoneData = {};

      obtenu.forEach(p => {
        const zone = p.zone || 'Non spécifié';
        zoneData[zone] = (zoneData[zone] || 0) + 1;
      });

      const sortedData = Object.entries(zoneData).sort((a, b) => b[1] - a[1]);
      const colors = ChartsEnrichis._generateGradientColors(sortedData.length);

      return {
        labels: sortedData.map(([zone]) => zone),
        datasets: [{
          label: 'Projets obtenus par zone',
          data: sortedData.map(([, count]) => count),
          backgroundColor: colors.map(c => c.fill),
          borderColor: colors.map(c => c.border),
          borderWidth: 2,
          borderRadius: 8,
          hoverBackgroundColor: colors.map(c => c.hover)
        }]
      };
    },

    calcCAByCompany(projects) {
      const companyData = {};

      projects.forEach(p => {
        const company = p.societe || 'Non spécifié';
        const ca = p.ca_etudie || 0;
        companyData[company] = (companyData[company] || 0) + ca;
      });

      const sortedData = Object.entries(companyData)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

      const colors = ChartsEnrichis._generateGradientColors(sortedData.length);

      return {
        labels: sortedData.map(([company]) => company.substring(0, 20)),
        datasets: [{
          label: 'CA par entreprise',
          data: sortedData.map(([, ca]) => ca),
          backgroundColor: colors.map(c => c.fill),
          borderColor: colors.map(c => c.border),
          borderWidth: 2,
          borderRadius: 8,
          hoverBackgroundColor: colors.map(c => c.hover)
        }]
      };
    },

    calcCAByStatus(projects) {
      const statusData = {};

      projects.forEach(p => {
        const status = ProjectUtils.getStatus(p);
        const ca = p.ca_etudie || 0;
        statusData[status] = (statusData[status] || 0) + ca;
      });

      const colors = ChartsEnrichis._generateGradientColors(Object.keys(statusData).length);

      return {
        labels: Object.keys(statusData),
        datasets: [{
          label: 'CA par statut',
          data: Object.values(statusData),
          backgroundColor: colors.map(c => c.fill),
          borderColor: colors.map(c => c.border),
          borderWidth: 2
        }]
      };
    },

    calcMachinesByZone(projects) {
      const zoneData = {};

      projects.forEach(p => {
        const zone = p.zone || 'Non spécifié';
        const nb_machines = p.nb_machines || 0;
        zoneData[zone] = (zoneData[zone] || 0) + nb_machines;
      });

      const sortedData = Object.entries(zoneData).sort((a, b) => b[1] - a[1]);
      const colors = ChartsEnrichis._generateGradientColors(sortedData.length);

      return {
        labels: sortedData.map(([zone]) => zone),
        datasets: [{
          label: 'Machines par zone',
          data: sortedData.map(([, count]) => count),
          backgroundColor: colors.map(c => c.fill),
          borderColor: colors.map(c => c.border),
          borderWidth: 2,
          borderRadius: 8
        }]
      };
    },

    calcOfferType(projects) {
      const typeData = {};

      projects.forEach(p => {
        const type = p.type_offre || 'Non spécifié';
        typeData[type] = (typeData[type] || 0) + 1;
      });

      const colors = ChartsEnrichis._generateGradientColors(Object.keys(typeData).length);

      return {
        labels: Object.keys(typeData),
        datasets: [{
          label: 'Types d\'offres',
          data: Object.values(typeData),
          backgroundColor: colors.map(c => c.fill),
          borderColor: colors.map(c => c.border),
          borderWidth: 2
        }]
      };
    },

    calcPartner(projects) {
      const partnerData = {};

      projects.forEach(p => {
        const partner = p.partenaire || 'Non spécifié';
        partnerData[partner] = (partnerData[partner] || 0) + 1;
      });

      const sortedData = Object.entries(partnerData)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);

      const colors = ChartsEnrichis._generateGradientColors(sortedData.length);

      return {
        labels: sortedData.map(([p]) => p.substring(0, 15)),
        datasets: [{
          label: 'Partenaires',
          data: sortedData.map(([, count]) => count),
          backgroundColor: colors.map(c => c.fill),
          borderColor: colors.map(c => c.border),
          borderWidth: 2
        }]
      };
    },

    calcPowerByStatus(projects) {
      const statusData = {};

      projects.forEach(p => {
        const status = ProjectUtils.getStatus(p);
        const power = p.puissance || 0;
        statusData[status] = (statusData[status] || 0) + power;
      });

      const colors = ChartsEnrichis._generateGradientColors(Object.keys(statusData).length);

      return {
        labels: Object.keys(statusData),
        datasets: [{
          label: 'Puissance par statut (kW)',
          data: Object.values(statusData),
          backgroundColor: colors.map(c => c.fill),
          borderColor: colors.map(c => c.border),
          borderWidth: 2
        }]
      };
    },

    calcCAComparison(projects) {
      const companyData = {};

      projects.forEach(p => {
        const company = p.societe || 'Non spécifié';
        const caEtudie = p.ca_etudie || 0;
        const caGagne = p.ca_gagne || 0;

        if (!companyData[company]) {
          companyData[company] = { etudie: 0, gagne: 0 };
        }
        companyData[company].etudie += caEtudie;
        companyData[company].gagne += caGagne;
      });

      const sortedCompanies = Object.entries(companyData)
        .sort((a, b) => (b[1].etudie + b[1].gagne) - (a[1].etudie + a[1].gagne))
        .slice(0, 8);

      return {
        labels: sortedCompanies.map(([c]) => c.substring(0, 20)),
        datasets: [
          {
            label: 'CA étudié',
            data: sortedCompanies.map(([, d]) => d.etudie),
            backgroundColor: 'rgba(0, 212, 170, 0.8)',
            borderColor: 'rgba(0, 212, 170, 1)',
            borderWidth: 2,
            borderRadius: 8
          },
          {
            label: 'CA gagné',
            data: sortedCompanies.map(([, d]) => d.gagne),
            backgroundColor: 'rgba(16, 185, 129, 0.8)',
            borderColor: 'rgba(16, 185, 129, 1)',
            borderWidth: 2,
            borderRadius: 8
          }
        ]
      };
    },

    calcCAByClient(projects) {
      const clientData = {};

      projects.forEach(p => {
        const client = p.client || 'Non spécifié';
        const ca = p.ca_etudie || 0;
        clientData[client] = (clientData[client] || 0) + ca;
      });

      const sortedData = Object.entries(clientData)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);

      const colors = ChartsEnrichis._generateGradientColors(sortedData.length);

      return {
        labels: sortedData.map(([c]) => c.substring(0, 20)),
        datasets: [{
          label: 'CA par client',
          data: sortedData.map(([, ca]) => ca),
          backgroundColor: colors.map(c => c.fill),
          borderColor: colors.map(c => c.border),
          borderWidth: 2,
          borderRadius: 8
        }]
      };
    },

    calcCAByZone(projects) {
      const zoneData = {};

      projects.forEach(p => {
        const zone = p.zone || 'Non spécifié';
        const ca = p.ca_etudie || 0;
        zoneData[zone] = (zoneData[zone] || 0) + ca;
      });

      const sortedData = Object.entries(zoneData).sort((a, b) => b[1] - a[1]);
      const colors = ChartsEnrichis._generateGradientColors(sortedData.length);

      return {
        labels: sortedData.map(([zone]) => zone),
        datasets: [{
          label: 'CA par zone',
          data: sortedData.map(([, ca]) => ca),
          backgroundColor: colors.map(c => c.fill),
          borderColor: colors.map(c => c.border),
          borderWidth: 2,
          borderRadius: 8
        }]
      };
    },

    calcCAByYear(projects) {
      const yearData = {};

      projects.forEach(p => {
        const year = p.annee || new Date().getFullYear();
        const ca = p.ca_etudie || 0;
        yearData[year] = (yearData[year] || 0) + ca;
      });

      const sortedData = Object.entries(yearData)
        .sort((a, b) => parseInt(a[0]) - parseInt(b[0]));

      return {
        labels: sortedData.map(([year]) => year.toString()),
        datasets: [{
          label: 'CA par année',
          data: sortedData.map(([, ca]) => ca),
          backgroundColor: 'rgba(0, 153, 255, 0.8)',
          borderColor: 'rgba(0, 153, 255, 1)',
          borderWidth: 2,
          borderRadius: 8,
          fill: true
        }]
      };
    },

    calcStatusByZone(projects) {
      const zoneStatusData = {};

      projects.forEach(p => {
        const zone = p.zone || 'Non spécifié';
        const status = ProjectUtils.getStatus(p);

        if (!zoneStatusData[zone]) {
          zoneStatusData[zone] = {};
        }
        zoneStatusData[zone][status] = (zoneStatusData[zone][status] || 0) + 1;
      });

      const zones = Object.keys(zoneStatusData);
      const statuses = [...new Set(projects.map(p => ProjectUtils.getStatus(p)))];
      const colors = ChartsEnrichis._generateGradientColors(statuses.length);

      return {
        labels: zones,
        datasets: statuses.map((status, idx) => ({
          label: status,
          data: zones.map(zone => zoneStatusData[zone][status] || 0),
          backgroundColor: colors[idx].fill,
          borderColor: colors[idx].border,
          borderWidth: 2
        }))
      };
    },

    calcWinRate(projects) {
      const zoneData = {};

      projects.forEach(p => {
        const zone = p.zone || 'Non spécifié';
        if (!zoneData[zone]) {
          zoneData[zone] = { obtenu: 0, total: 0 };
        }
        zoneData[zone].total += 1;
        if (ProjectUtils.getStatus(p) === 'obtenu') {
          zoneData[zone].obtenu += 1;
        }
      });

      const sortedData = Object.entries(zoneData)
        .map(([zone, data]) => [zone, (data.obtenu / data.total * 100).toFixed(1)])
        .sort((a, b) => parseFloat(b[1]) - parseFloat(a[1]));

      return {
        labels: sortedData.map(([zone]) => zone),
        datasets: [{
          label: 'Taux de réussite (%)',
          data: sortedData.map(([, rate]) => parseFloat(rate)),
          backgroundColor: 'rgba(245, 183, 64, 0.8)',
          borderColor: 'rgba(245, 183, 64, 1)',
          borderWidth: 2,
          borderRadius: 8
        }]
      };
    },

    calcHandover(projects) {
      const handoverData = {
        'Oui': projects.filter(p => p.handover).length,
        'Non': projects.filter(p => !p.handover).length
      };

      return {
        labels: Object.keys(handoverData),
        datasets: [{
          label: 'Reprise',
          data: Object.values(handoverData),
          backgroundColor: ['rgba(139, 120, 248, 0.8)', 'rgba(239, 68, 68, 0.8)'],
          borderColor: ['rgba(139, 120, 248, 1)', 'rgba(239, 68, 68, 1)'],
          borderWidth: 2
        }]
      };
    },

    calcAvgPower(projects) {
      const zoneData = {};

      projects.forEach(p => {
        const zone = p.zone || 'Non spécifié';
        const power = p.puissance || 0;

        if (!zoneData[zone]) {
          zoneData[zone] = { total: 0, count: 0 };
        }
        zoneData[zone].total += power;
        zoneData[zone].count += 1;
      });

      const sortedData = Object.entries(zoneData)
        .map(([zone, data]) => [zone, (data.total / data.count).toFixed(1)])
        .sort((a, b) => parseFloat(b[1]) - parseFloat(a[1]));

      return {
        labels: sortedData.map(([zone]) => zone),
        datasets: [{
          label: 'Puissance moyenne (kW)',
          data: sortedData.map(([, power]) => parseFloat(power)),
          backgroundColor: 'rgba(20, 184, 166, 0.8)',
          borderColor: 'rgba(20, 184, 166, 1)',
          borderWidth: 2,
          borderRadius: 8
        }]
      };
    },

    calcResponseRate(projects) {
      const zoneData = {};

      projects.forEach(p => {
        const zone = p.zone || 'Non spécifié';
        if (!zoneData[zone]) {
          zoneData[zone] = { responded: 0, total: 0 };
        }
        zoneData[zone].total += 1;
        if (p.date_reponse) {
          zoneData[zone].responded += 1;
        }
      });

      const sortedData = Object.entries(zoneData)
        .map(([zone, data]) => [zone, (data.responded / data.total * 100).toFixed(1)])
        .sort((a, b) => parseFloat(b[1]) - parseFloat(a[1]));

      return {
        labels: sortedData.map(([zone]) => zone),
        datasets: [{
          label: 'Taux de réponse (%)',
          data: sortedData.map(([, rate]) => parseFloat(rate)),
          backgroundColor: 'rgba(168, 85, 247, 0.8)',
          borderColor: 'rgba(168, 85, 247, 1)',
          borderWidth: 2,
          borderRadius: 8
        }]
      };
    },

    calcDensityRegion(projects) {
      const regionData = {};

      projects.forEach(p => {
        const region = p.region || 'Non spécifié';
        regionData[region] = (regionData[region] || 0) + 1;
      });

      const sortedData = Object.entries(regionData)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

      const colors = ChartsEnrichis._generateGradientColors(sortedData.length);

      return {
        labels: sortedData.map(([region]) => region.substring(0, 15)),
        datasets: [{
          label: 'Densité par région',
          data: sortedData.map(([, count]) => count),
          backgroundColor: colors.map(c => c.fill),
          borderColor: colors.map(c => c.border),
          borderWidth: 2,
          borderRadius: 8
        }]
      };
    },

    calcDecisionTime(projects) {
      const timeData = {};

      projects.forEach(p => {
        const time = p.decision_time || 0;
        const bucket = Math.floor(time / 30) * 30;
        timeData[bucket] = (timeData[bucket] || 0) + 1;
      });

      const sortedData = Object.entries(timeData)
        .sort((a, b) => parseInt(a[0]) - parseInt(b[0]));

      return {
        labels: sortedData.map(([bucket]) => `${bucket}-${parseInt(bucket) + 30}j`),
        datasets: [{
          label: 'Temps de décision (jours)',
          data: sortedData.map(([, count]) => count),
          backgroundColor: 'rgba(236, 72, 153, 0.8)',
          borderColor: 'rgba(236, 72, 153, 1)',
          borderWidth: 2,
          borderRadius: 8
        }]
      };
    },

    /**
     * ════════════════════════════════════════════════════════════════════════
     * API PUBLIQUE
     * ════════════════════════════════════════════════════════════════════════
     */

    /**
     * Obtient les filtres actifs (utile pour debug/logging)
     */
    getActiveFilters() {
      return JSON.parse(JSON.stringify(this.activeFilters));
    },

    /**
     * Obtient les données filtrées
     */
    getFilteredData() {
      return this.filteredData;
    },

    /**
     * Logger interne
     */
    log(message, level = 'log') {
      if (!this.config.enableLogging) return;
      
      const styles = {
        success: 'color: #00d4aa; font-weight: bold;',
        error: 'color: #ff4d6d; font-weight: bold;',
        warn: 'color: #f5b740; font-weight: bold;',
        info: 'color: #0099ff; font-weight: bold;',
        log: 'color: #9fb3c8;'
      };

      console.log(`%c${message}`, styles[level] || styles.log);
    }
  };

  // ════════════════════════════════════════════════════════════════════════════
  // 3. EXPORT DU MODULE
  // ════════════════════════════════════════════════════════════════════════════

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = InteractiveFiltering;
  } else {
    global.InteractiveFiltering = InteractiveFiltering;
  }

  console.log('%c✅ InteractiveFiltering chargé avec succès', 'color: #00d4aa; font-weight: bold; font-size: 14px;');

})(typeof window !== 'undefined' ? window : global);