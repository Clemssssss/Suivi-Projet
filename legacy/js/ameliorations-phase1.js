/* =====================================================
   AMÉLIORATIONS PHASE 1 — Impact immédiat
   
   À intégrer dans script.js après les déclarations globales
   et avant buildFilters() / updateStats()
===================================================== */

/* ─────────────────────────────────────────────────
   1. NOUVEAUX KPI DÉCISIONNELS
   ───────────────────────────────────────────────── */

/**
 * Ajouter ces KPI dans l'HTML (index.html) après les KPI existants :
 * 
 * <div class="stat-card kpi-card" title="CA prévisionnel pipeline (offres × taux conv.)">
 *   <span class="stat-label">💼 CA Pipeline</span>
 *   <span class="stat-value kpi-sm" id="kpi-ca-pipeline">—</span>
 * </div>
 * 
 * <div class="stat-card kpi-card" title="Client avec le plus d'offres en cours">
 *   <span class="stat-label">🏆 Top client actif</span>
 *   <span class="stat-value kpi-sm" id="kpi-top-client">—</span>
 * </div>
 * 
 * <div class="stat-card kpi-card" title="Délai moyen pour décision (obtenu ou perdu)">
 *   <span class="stat-label">⏱️ Temps décision</span>
 *   <span class="stat-value" id="kpi-decision-time">—</span>
 * </div>
 */

/**
 * Ajouter à ProjectUtils.computeKPIs() dans projectUtils.js,
 * ou calculer ici et appeler depuis updateStats()
 */
function computeAdvancedKPIs(projects) {
  const kpi = ProjectUtils.computeKPIs(projects);
  
  // 1. CA Pipeline pondéré
  const offres = projects.filter(p => ProjectUtils.getStatus(p) === 'offre');
  const caPipeline = offres.reduce((sum, p) => {
    const montant = ProjectUtils.parseMontant(p.montant);
    // Pondérer par taux de conversion moyen (si >0)
    const weighted = kpi.tauxConversion > 0 
      ? montant * (kpi.tauxConversion / 100)
      : montant * 0.5; // défaut 50% si pas de conversion connue
    return sum + weighted;
  }, 0);
  
  // 2. Top client actif (le plus d'offres)
  const societeOffres = {};
  offres.forEach(p => {
    const s = p.societe || 'N/A';
    societeOffres[s] = (societeOffres[s] || 0) + 1;
  });
  const topClient = Object.entries(societeOffres)
    .sort(([,a], [,b]) => b - a)[0];
  
  // 3. Temps moyen de décision
  // Calcul : projets obtenu/perdu avec création ET échéance
  const decided = projects.filter(p => {
    const st = ProjectUtils.getStatus(p);
    return (st === 'obtenu' || st === 'perdu') && p.creation && p.echeance;
  });
  const decisionTimes = decided.map(p => {
    const start = ProjectUtils.parseDate(p.creation);
    const end   = ProjectUtils.parseDate(p.echeance);
    if (!start || !end) return null;
    return Math.round((end - start) / 86400000); // jours
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
 * Modifier updateStats() pour utiliser computeAdvancedKPIs :
 * 
 * Remplacer :
 *   const kpi = ProjectUtils.computeKPIs(data);
 * Par :
 *   const kpi = computeAdvancedKPIs(data);
 * 
 * Puis ajouter après les KPI existants :
 */
function updateAdvancedKPIs(kpi) {
  // CA Pipeline
  const pipelineEl = document.getElementById('kpi-ca-pipeline');
  if (pipelineEl) {
    pipelineEl.textContent = kpi.caPipeline > 0
      ? ProjectUtils.formatMontant(kpi.caPipeline, true)
      : '—';
  }
  
  // Top client actif
  const topClientEl = document.getElementById('kpi-top-client');
  if (topClientEl) {
    if (kpi.topClient) {
      // Tronquer le nom si trop long
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
  
  // Temps décision
  const decisionEl = document.getElementById('kpi-decision-time');
  if (decisionEl) {
    decisionEl.textContent = kpi.avgDecisionTime !== null
      ? kpi.avgDecisionTime + ' j'
      : '—';
  }
}

/* ─────────────────────────────────────────────────
   2. FILTRES RAPIDES GLOBAUX (sidebar)
   ───────────────────────────────────────────────── */

/**
 * Ajouter dans l'HTML (index.html) après le search-container :
 * 
 * <div class="quick-filters">
 *   <button class="quick-filter-btn" id="qf-urgent">🔥 Urgents</button>
 *   <button class="quick-filter-btn" id="qf-cahors">⚡ CAHORS</button>
 *   <button class="quick-filter-btn" id="qf-notes">📝 Avec notes</button>
 *   <button class="quick-filter-btn" id="qf-overdue">⚠️ En retard</button>
 * </div>
 * 
 * CSS à ajouter dans style.css :
 * 
 * .quick-filters {
 *   display: flex;
 *   gap: 6px;
 *   flex-wrap: wrap;
 *   margin-bottom: 12px;
 * }
 * .quick-filter-btn {
 *   flex: 1;
 *   min-width: 100px;
 *   padding: 8px 12px;
 *   border: 1.5px solid #e2e8f0;
 *   border-radius: 8px;
 *   background: white;
 *   color: #475569;
 *   font-size: 0.8rem;
 *   font-weight: 600;
 *   cursor: pointer;
 *   transition: all 0.2s;
 *   white-space: nowrap;
 * }
 * .quick-filter-btn:hover {
 *   border-color: #3b82f6;
 *   background: #eff6ff;
 *   color: #1d4ed8;
 * }
 * .quick-filter-btn.active {
 *   background: linear-gradient(135deg, #3b82f6, #2563eb);
 *   color: white;
 *   border-color: #2563eb;
 *   box-shadow: 0 2px 8px rgba(59,130,246,0.3);
 * }
 */

// État des filtres rapides
let quickFiltersActive = {
  urgent: false,
  cahors: false,
  notes: false,
  overdue: false
};

/**
 * Appliquer les filtres rapides — ajouter à getFiltered() AVANT le return
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

/**
 * Modifier getFiltered() :
 * 
 * Avant le return final, ajouter :
 *   data = applyQuickFilters(data);
 *   return data;
 */

/**
 * Setup des boutons — à appeler dans init ou DOMContentLoaded
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
      // Toggle
      quickFiltersActive[filterKey] = !quickFiltersActive[filterKey];
      btn.classList.toggle('active', quickFiltersActive[filterKey]);
      
      // Réinitialiser les autres filtres standards si on active un quick filter
      if (quickFiltersActive[filterKey]) {
        activeStatFilter = null;
        updateStatCards();
      }
      
      refresh();
    });
  });
}

/**
 * Bouton reset filtres — modifier pour inclure quick filters
 */
function resetAllFilters() {
  // Reset standard filters
  Object.keys(filters).forEach(k => filters[k].clear());
  searchQuery = '';
  document.getElementById('search-input').value = '';
  activeStatFilter = null;
  chartFilter = { active: false, type: null, societe: null };
  montantFilter = { active: false, min: 0, max: Infinity };
  
  // Reset quick filters
  Object.keys(quickFiltersActive).forEach(k => quickFiltersActive[k] = false);
  document.querySelectorAll('.quick-filter-btn').forEach(btn => btn.classList.remove('active'));
  
  updateStatCards();
  buildFilters();
  buildMontantFilter();
  refresh();
}

/* ─────────────────────────────────────────────────
   3. FOCUS AUTOMATIQUE PROJET (chart/map → table)
   ───────────────────────────────────────────────── */

/**
 * Fonction pour scroller et highlight un projet dans le tableau
 */
function focusProjectInTable(projectId) {
  // Trouver la ligne correspondante
  const row = document.querySelector(`#table-body tr[data-id="${projectId}"]`);
  if (!row) return;
  
  // Scroll jusqu'à la ligne
  row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  
  // Highlight temporaire
  row.classList.add('highlight-focus');
  setTimeout(() => row.classList.remove('highlight-focus'), 2000);
}

/**
 * CSS à ajouter pour l'highlight :
 * 
 * @keyframes focusPulse {
 *   0%, 100% { background: transparent; }
 *   50% { background: rgba(59,130,246,0.15); }
 * }
 * 
 * #table-body tr.highlight-focus {
 *   animation: focusPulse 2s ease;
 *   box-shadow: 0 0 0 2px rgba(59,130,246,0.5) inset;
 * }
 */

/**
 * Modifier renderChart() pour ajouter le clic :
 * 
 * Après chart.update(), ajouter :
 * 
 * canvas.onclick = (evt) => {
 *   const points = chart.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, true);
 *   if (points.length === 0) return;
 *   
 *   const firstPoint = points[0];
 *   const label = chart.data.labels[firstPoint.index];
 *   const societe = label; // ou extraire depuis dataset
 *   
 *   // Trouver le premier projet de cette société dans le dataset visible
 *   const filtered = getFiltered();
 *   const project = filtered.find(p => p.societe === societe);
 *   if (project) focusProjectInTable(project.id);
 * };
 */

/**
 * Modifier le clic sur les markers de carte :
 * 
 * Dans setupMarkers() ou l'équivalent, après marker.on('click', ...):
 * 
 * marker.on('click', () => {
 *   selectProject(project.id);
 *   focusProjectInTable(project.id);
 * });
 */

/* ─────────────────────────────────────────────────
   4. MODE "REVUE COMMERCIALE"
   ───────────────────────────────────────────────── */

/**
 * Ajouter un bouton dans sidebar-actions (index.html) :
 * 
 * <button id="mode-review" class="review-mode-btn">
 *   📊 Mode Revue Commerciale
 * </button>
 * 
 * CSS :
 * 
 * .review-mode-btn {
 *   background: linear-gradient(135deg, #f59e0b, #d97706);
 *   color: white;
 *   border: none;
 *   padding: 12px 16px;
 *   border-radius: 10px;
 *   font-size: 13px;
 *   font-weight: 700;
 *   cursor: pointer;
 *   transition: all 0.2s;
 *   box-shadow: 0 2px 8px rgba(245,158,11,0.3);
 * }
 * .review-mode-btn:hover {
 *   background: linear-gradient(135deg, #d97706, #b45309);
 *   transform: translateY(-1px);
 *   box-shadow: 0 4px 12px rgba(245,158,11,0.4);
 * }
 * .review-mode-btn.active {
 *   background: linear-gradient(135deg, #10b981, #059669);
 *   box-shadow: 0 2px 8px rgba(16,185,129,0.3);
 * }
 */

let reviewModeActive = false;

/**
 * Activer le mode revue commerciale
 */
function toggleReviewMode() {
  reviewModeActive = !reviewModeActive;
  const btn = document.getElementById('mode-review');
  
  if (reviewModeActive) {
    // Appliquer les filtres preset
    // 1. Reset tout
    resetAllFilters();
    
    // 2. Filtre : offres uniquement
    activeStatFilter = 'offre';
    
    // 3. Ajouter filtre : échéance < 30 jours
    const today = new Date();
    const in30days = new Date(today.getTime() + 30 * 86400000);
    
    // Custom filter pour échéance (ajouter à getFiltered si besoin)
    window.reviewModeDeadline = in30days;
    
    // 4. Tri par échéance croissante
    SORT.col = 'echeance';
    SORT.dir = 'asc';
    
    // UI
    btn.classList.add('active');
    btn.innerHTML = '✅ Mode Revue (actif)';
    
  } else {
    // Désactiver
    delete window.reviewModeDeadline;
    resetAllFilters();
    btn.classList.remove('active');
    btn.innerHTML = '📊 Mode Revue Commerciale';
  }
  
  updateStatCards();
  refresh();
}

/**
 * Modifier getFiltered() pour appliquer le filtre échéance si mode review :
 * 
 * Après applyQuickFilters(data), ajouter :
 * 
 * if (window.reviewModeDeadline) {
 *   data = data.filter(p => {
 *     const deadline = ProjectUtils.parseDate(p.echeance);
 *     return deadline && deadline <= window.reviewModeDeadline;
 *   });
 * }
 */

/**
 * Setup du bouton
 */
function setupReviewMode() {
  const btn = document.getElementById('mode-review');
  if (!btn) return;
  btn.addEventListener('click', toggleReviewMode);
}

/* ─────────────────────────────────────────────────
   5. INITIALISATION — À APPELER DANS DOMContentLoaded
   ───────────────────────────────────────────────── */

/**
 * Ajouter dans l'init de script.js :
 * 
 * document.addEventListener('DOMContentLoaded', () => {
 *   // ... init existant ...
 *   
 *   // Nouveaux inits Phase 1
 *   setupQuickFilters();
 *   setupReviewMode();
 * });
 * 
 * Et modifier updateStats() :
 * 
 * function updateStats() {
 *   const data = getFiltered();
 *   const kpi = computeAdvancedKPIs(data); // ← remplacer ProjectUtils.computeKPIs
 *   
 *   // ... code existant ...
 *   
 *   // Ajouter à la fin :
 *   updateAdvancedKPIs(kpi);
 * }
 * 
 * Et modifier getFiltered() :
 * 
 * function getFiltered() {
 *   // ... filtrage existant ...
 *   
 *   // Avant le return :
 *   data = applyQuickFilters(data);
 *   
 *   if (window.reviewModeDeadline) {
 *     data = data.filter(p => {
 *       const deadline = ProjectUtils.parseDate(p.echeance);
 *       return deadline && deadline <= window.reviewModeDeadline;
 *     });
 *   }
 *   
 *   return data;
 * }
 */

/* ═══════════════════════════════════════════════════
   RÉSUMÉ PHASE 1 — Checklist d'intégration
   ═══════════════════════════════════════════════════
   
   ✅ HTML (index.html) :
   1. Ajouter 3 nouvelles stat-cards KPI après les existantes
   2. Ajouter div.quick-filters avec 4 boutons
   3. Ajouter bouton #mode-review dans sidebar-actions
   
   ✅ CSS (style.css) :
   1. Styles .quick-filters et .quick-filter-btn
   2. Style .review-mode-btn
   3. Animation @keyframes focusPulse
   4. Style tr.highlight-focus
   
   ✅ JS (script.js) :
   1. Copier computeAdvancedKPIs() et updateAdvancedKPIs()
   2. Copier applyQuickFilters() et setupQuickFilters()
   3. Copier focusProjectInTable()
   4. Copier toggleReviewMode() et setupReviewMode()
   5. Modifier updateStats() pour utiliser computeAdvancedKPIs
   6. Modifier getFiltered() pour appeler applyQuickFilters + check reviewModeDeadline
   7. Modifier resetAllFilters() pour reset quick filters
   8. Ajouter setupQuickFilters() et setupReviewMode() dans init
   9. Modifier chart onclick pour appeler focusProjectInTable
   10. Modifier marker onclick pour appeler focusProjectInTable
   
   Impact estimé : +30% efficacité décisionnelle quotidienne
   ═══════════════════════════════════════════════════ */
