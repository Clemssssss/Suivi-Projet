/* =====================================================
   AMÉLIORATIONS PHASE 1 — AJOUTS SCRIPT.JS
   
   Ce fichier contient tous les ajouts à faire dans script.js
   Les points d'insertion sont clairement marqués avec ⚡
===================================================== */

/* ═══════════════════════════════════════════════════
   ⚡ INSERTION 1 — APRÈS LES VARIABLES GLOBALES
   Ajouter après : let montantFilter = { ... };
   ═══════════════════════════════════════════════════ */

// ✨ PHASE 1 : État des filtres rapides
let quickFiltersActive = {
  urgent: false,
  cahors: false,
  notes: false,
  overdue: false
};

// ✨ PHASE 1 : État du mode revue commerciale
let reviewModeActive = false;


/* ═══════════════════════════════════════════════════
   ⚡ INSERTION 2 — NOUVEAUX KPI (avant updateStats)
   Ajouter avant : function updateStats() { ... }
   ═══════════════════════════════════════════════════ */

/**
 * ✨ PHASE 1 : Calcule les KPI avancés (pipeline, top client, temps décision)
 */
function computeAdvancedKPIs(projects) {
  const kpi = ProjectUtils.computeKPIs(projects);
  
  // 1. CA Pipeline pondéré
  const offres = projects.filter(p => ProjectUtils.getStatus(p) === 'offre');
  const caPipeline = offres.reduce((sum, p) => {
    const montant = ProjectUtils.parseMontant(p.montant);
    const weighted = kpi.tauxConversion > 0 
      ? montant * (kpi.tauxConversion / 100)
      : montant * 0.5;
    return sum + weighted;
  }, 0);
  
  // 2. Top client actif
  const societeOffres = {};
  offres.forEach(p => {
    const s = p.societe || 'N/A';
    societeOffres[s] = (societeOffres[s] || 0) + 1;
  });
  const entries = Object.entries(societeOffres);
  const topClient = entries.length > 0 
    ? entries.sort(([,a], [,b]) => b - a)[0]
    : null;
  
  // 3. Temps moyen de décision
  const decided = projects.filter(p => {
    const st = ProjectUtils.getStatus(p);
    return (st === 'obtenu' || st === 'perdu') && p.creation && p.echeance;
  });
  const decisionTimes = decided.map(p => {
    const start = ProjectUtils.parseDate(p.creation);
    const end   = ProjectUtils.parseDate(p.echeance);
    if (!start || !end) return null;
    return Math.round((end - start) / 86400000);
  }).filter(d => d !== null && d > 0);
  
  const avgDecisionTime = decisionTimes.length > 0
    ? Math.round(decisionTimes.reduce((a,b) => a+b, 0) / decisionTimes.length)
    : null;
  
  return {
    ...kpi,
    caPipeline,
    topClient: topClient ? { societe: topClient[0], count: topClient[1] } : null,
    avgDecisionTime
  };
}

/**
 * ✨ PHASE 1 : Met à jour les nouveaux KPI dans le DOM
 */
function updateAdvancedKPIs(kpi) {
  const pipelineEl = document.getElementById('kpi-ca-pipeline');
  if (pipelineEl) {
    pipelineEl.textContent = kpi.caPipeline > 0
      ? ProjectUtils.formatMontant(kpi.caPipeline, true)
      : '—';
  }
  
  const topClientEl = document.getElementById('kpi-top-client');
  if (topClientEl) {
    if (kpi.topClient) {
      const name = kpi.topClient.societe.length > 18 
        ? kpi.topClient.societe.slice(0, 15) + '...'
        : kpi.topClient.societe;
      topClientEl.textContent = `${name} (${kpi.topClient.count})`;
      topClientEl.title = `${kpi.topClient.societe} — ${kpi.topClient.count} offres actives`;
    } else {
      topClientEl.textContent = '—';
      topClientEl.title = '';
    }
  }
  
  const decisionEl = document.getElementById('kpi-decision-time');
  if (decisionEl) {
    decisionEl.textContent = kpi.avgDecisionTime !== null
      ? kpi.avgDecisionTime + ' j'
      : '—';
  }
}


/* ═══════════════════════════════════════════════════
   ⚡ INSERTION 3 — MODIFIER updateStats()
   
   Remplacer la ligne :
     const kpi = ProjectUtils.computeKPIs(data);
   Par :
     const kpi = computeAdvancedKPIs(data);
   
   Puis AJOUTER à la fin de updateStats() (avant le closing }) :
   
     updateAdvancedKPIs(kpi);
   ═══════════════════════════════════════════════════ */


/* ═══════════════════════════════════════════════════
   ⚡ INSERTION 4 — FILTRES RAPIDES (avant getFiltered)
   Ajouter avant : function getFiltered() { ... }
   ═══════════════════════════════════════════════════ */

/**
 * ✨ PHASE 1 : Applique les filtres rapides
 */
function applyQuickFilters(data) {
  let filtered = data;
  
  if (quickFiltersActive.urgent) {
    filtered = filtered.filter(p => ProjectUtils.isUrgent(p));
  }
  
  if (quickFiltersActive.cahors) {
    filtered = filtered.filter(p => ProjectUtils.isCahors(p));
  }
  
  if (quickFiltersActive.notes) {
    filtered = filtered.filter(p => ProjectUtils.hasNotes(p));
  }
  
  if (quickFiltersActive.overdue) {
    filtered = filtered.filter(p => ProjectUtils.isOverdue(p));
  }
  
  return filtered;
}


/* ═══════════════════════════════════════════════════
   ⚡ INSERTION 5 — MODIFIER getFiltered()
   
   AVANT le return final de getFiltered(), ajouter :
   
     // ✨ PHASE 1 : Filtres rapides
     data = applyQuickFilters(data);
     
     // ✨ PHASE 1 : Mode revue commerciale (échéance < 30j)
     if (window.reviewModeDeadline) {
       data = data.filter(p => {
         const deadline = ProjectUtils.parseDate(p.echeance);
         return deadline && deadline <= window.reviewModeDeadline;
       });
     }
     
     return data;
   ═══════════════════════════════════════════════════ */


/* ═══════════════════════════════════════════════════
   ⚡ INSERTION 6 — FOCUS PROJET (avant setupMapClickHandlers)
   Ajouter cette fonction quelque part (après getFiltered par exemple)
   ═══════════════════════════════════════════════════ */

/**
 * ✨ PHASE 1 : Focus un projet dans le tableau (scroll + highlight)
 */
function focusProjectInTable(projectId) {
  const row = document.querySelector(`#table-body tr[data-id="${projectId}"]`);
  if (!row) return;
  
  row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  
  row.classList.add('highlight-focus');
  setTimeout(() => row.classList.remove('highlight-focus'), 2000);
}


/* ═══════════════════════════════════════════════════
   ⚡ INSERTION 7 — MODE REVUE COMMERCIALE
   Ajouter quelque part (après focusProjectInTable par exemple)
   ═══════════════════════════════════════════════════ */

/**
 * ✨ PHASE 1 : Active/désactive le mode revue commerciale
 */
function toggleReviewMode() {
  reviewModeActive = !reviewModeActive;
  const btn = document.getElementById('mode-review');
  if (!btn) return;
  
  if (reviewModeActive) {
    // Reset tout
    Object.keys(filters).forEach(k => filters[k].clear());
    searchQuery = '';
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = '';
    activeStatFilter = 'offre'; // Filtrer offres uniquement
    chartFilter = { active: false, type: null, societe: null };
    montantFilter = { active: false, min: 0, max: Infinity };
    
    // Reset quick filters
    Object.keys(quickFiltersActive).forEach(k => quickFiltersActive[k] = false);
    document.querySelectorAll('.quick-filter-btn').forEach(b => b.classList.remove('active'));
    
    // Filtre échéance < 30j
    const today = new Date();
    const in30days = new Date(today.getTime() + 30 * 86400000);
    window.reviewModeDeadline = in30days;
    
    // Tri par échéance croissante
    sortState.col = 'echeance';
    sortState.dir = 'asc';
    
    // UI
    btn.classList.add('active');
    btn.textContent = '✅ Mode Revue (actif)';
    
  } else {
    delete window.reviewModeDeadline;
    btn.classList.remove('active');
    btn.textContent = '📊 Mode Revue Commerciale';
  }
  
  updateStatCards();
  refresh();
}


/* ═══════════════════════════════════════════════════
   ⚡ INSERTION 8 — SETUP FILTRES RAPIDES
   Ajouter quelque part (après toggleReviewMode par exemple)
   ═══════════════════════════════════════════════════ */

/**
 * ✨ PHASE 1 : Initialise les boutons de filtres rapides
 */
function setupQuickFilters() {
  const buttons = {
    'qf-urgent': 'urgent',
    'qf-cahors': 'cahors',
    'qf-notes': 'notes',
    'qf-overdue': 'overdue'
  };
  
  Object.entries(buttons).forEach(([btnId, filterKey]) => {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    
    btn.addEventListener('click', () => {
      quickFiltersActive[filterKey] = !quickFiltersActive[filterKey];
      btn.classList.toggle('active', quickFiltersActive[filterKey]);
      
      if (quickFiltersActive[filterKey]) {
        activeStatFilter = null;
        updateStatCards();
      }
      
      refresh();
    });
  });
}

/**
 * ✨ PHASE 1 : Initialise le bouton mode revue
 */
function setupReviewMode() {
  const btn = document.getElementById('mode-review');
  if (!btn) return;
  btn.addEventListener('click', toggleReviewMode);
}


/* ═══════════════════════════════════════════════════
   ⚡ INSERTION 9 — MODIFIER resetAllFilters() / reset button
   
   Si vous avez une fonction reset globale, modifier pour ajouter :
   
     // ✨ PHASE 1 : Reset quick filters
     Object.keys(quickFiltersActive).forEach(k => quickFiltersActive[k] = false);
     document.querySelectorAll('.quick-filter-btn').forEach(b => b.classList.remove('active'));
     
     // ✨ PHASE 1 : Reset review mode
     if (reviewModeActive) toggleReviewMode();
   
   Sinon, trouvez le listener du bouton #reset et ajoutez ces lignes
   ═══════════════════════════════════════════════════ */


/* ═══════════════════════════════════════════════════
   ⚡ INSERTION 10 — MODIFIER renderChart()
   
   Dans la fonction renderChart(), APRÈS chart.update(), ajouter :
   
     // ✨ PHASE 1 : Clic sur chart → focus projet
     canvas.onclick = (evt) => {
       const points = chart.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, true);
       if (points.length === 0) return;
       
       const firstPoint = points[0];
       const datasetIndex = firstPoint.datasetIndex;
       const index = firstPoint.index;
       const label = chart.data.labels[index];
       
       // Trouver le premier projet correspondant
       const filtered = getFiltered();
       let project = null;
       
       if (type === 'montant') {
         // Chart montant : label = société
         project = filtered.find(p => p.societe === label);
       } else {
         // Charts obtenu/perdu/zone : label = société ou zone
         const status = type; // 'obtenu', 'perdu', ou chercher dans dataset
         project = filtered.find(p => {
           const match = type === 'obtenu-zone' 
             ? p.zone_geo === label && ProjectUtils.getStatus(p) === 'obtenu'
             : p.societe === label && ProjectUtils.getStatus(p) === type;
           return match;
         });
       }
       
       if (project) focusProjectInTable(project.id);
     };
   ═══════════════════════════════════════════════════ */


/* ═══════════════════════════════════════════════════
   ⚡ INSERTION 11 — MODIFIER setupMapClickHandlers() ou marker click
   
   Dans la fonction qui gère le clic sur les markers de carte,
   AJOUTER après selectProject(project.id) :
   
     focusProjectInTable(project.id);
   
   Exemple de pattern à chercher :
     marker.on('click', () => {
       selectProject(project.id);
       focusProjectInTable(project.id); // ← AJOUTER CETTE LIGNE
     });
   ═══════════════════════════════════════════════════ */


/* ═══════════════════════════════════════════════════
   ⚡ INSERTION 12 — INITIALISATION (DOMContentLoaded)
   
   Dans votre bloc DOMContentLoaded (à la fin du fichier), AJOUTER :
   
     // ✨ PHASE 1 : Initialiser les améliorations
     setupQuickFilters();
     setupReviewMode();
   ═══════════════════════════════════════════════════ */


/* ═══════════════════════════════════════════════════
   RÉSUMÉ DES MODIFICATIONS — CHECKLIST
   ═══════════════════════════════════════════════════
   
   ✅ Variables globales (après montantFilter) :
      - quickFiltersActive
      - reviewModeActive
   
   ✅ Nouvelles fonctions (ajouter avant updateStats) :
      - computeAdvancedKPIs()
      - updateAdvancedKPIs()
      - applyQuickFilters()
      - focusProjectInTable()
      - toggleReviewMode()
      - setupQuickFilters()
      - setupReviewMode()
   
   ✅ Modifications fonctions existantes :
      - updateStats() : utiliser computeAdvancedKPIs + appeler updateAdvancedKPIs
      - getFiltered() : appeler applyQuickFilters + check reviewModeDeadline
      - reset handler : reset quick filters + review mode
      - renderChart() : ajouter onclick avec focusProjectInTable
      - marker click : ajouter focusProjectInTable
   
   ✅ Initialisation (DOMContentLoaded) :
      - setupQuickFilters()
      - setupReviewMode()
   
   ═══════════════════════════════════════════════════ */
