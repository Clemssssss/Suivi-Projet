/* =====================================================
   TRELLO / KANBAN VIEW MODULE — v2 (App namespace)
   
   Module autonome pour afficher et gérer les projets
   en mode Trello / Kanban avec drag & drop.
   
   ARCHITECTURE v2 :
   - Consomme App.data.projects au lieu de ALL global
   - Persiste via App.data.save() au lieu de save()
   - S'abonne à App.on('change') pour se mettre à jour
   - Expose buildFilterCriteria via App.filters.buildCriteria()
   
   ALIASES BACKWARD-COMPAT maintenus (retirés en v3) :
   - ALL → App.data.projects
   - save() → App.data.save()
   - formatDateDisplay() → ProjectUtils.formatDateDisplay()
   - STATUS_COLORS → App.mapConfig.statusColors
   - getStatusKey() → ProjectUtils.parseStatusKey()
===================================================== */

(function() {
  'use strict';

  // Raccourcis vers le namespace App
  const _app     = window.App;
  const _appData = _app ? _app.data    : null;
  const _cols    = _app ? _app.columns : null;

  // =====================================================
  // ÉTAT LOCAL DU MODULE
  // =====================================================
  
  const trelloState = {
    active: false,
    filtered: [],
    search: "",
    sortBy: "echeance",      // echeance | creation | societe | projet
    sortOrder: "asc",        // asc | desc
    viewMode: "cards",       // cards | compact
    selected: new Set(),
    draggedCard: null,
    draggedFrom: null,
    quickFilter: null        // null | "urgent" | "cahors" | "notes"
  };

  // =====================================================
  // CONFIGURATION DES COLONNES
  // =====================================================
  
  const TRELLO_COLUMNS = [
    { key: "offre", label: "Offre remise", color: "#3b82f6" },
    { key: "obtenu", label: "Projets obtenus", color: "#10b981" },
    { key: "perdu", label: "Projets perdus", color: "#ef4444" },
    { key: "autre", label: "Autres", color: "#f59e0b" }
  ];

  // =====================================================
  // RÉFÉRENCES DOM
  // =====================================================
  
  let trelloContainer = null;
  let trelloHeader = null;
  let trelloBoard = null;
  let toggleButton = null;

  // =====================================================
  // UTILITAIRES — délèguent à ProjectUtils (projectUtils.js)
  // =====================================================

  /**
   * Guard : s'assurer que ProjectUtils est disponible
   */
  function validateUtils() {
    if (typeof ProjectUtils === 'undefined') {
      console.error('❌ Trello View: ProjectUtils n\'est pas disponible. Vérifiez que projectUtils.js est chargé avant trello-view.js.');
      return false;
    }
    return true;
  }

  /**
   * Vérifier si les données sont disponibles via App ou fallback ALL global
   */
  function validateData() {
    const projects = _appData ? _appData.projects : (typeof ALL !== 'undefined' ? ALL : null);
    if (!projects) {
      console.error('❌ Trello View: données non disponibles (App.data.projects ou ALL)');
      return false;
    }
    if (!Array.isArray(projects)) {
      console.error('❌ Trello View: les projets ne sont pas un array');
      return false;
    }
    return true;
  }

  /** Obtenir le tableau maître (App ou fallback) */
  function getProjects() {
    return _appData ? _appData.projects : ALL;
  }

  /** Sauvegarder (App ou fallback) */
  function persistSave() {
    if (_appData) _appData.save();
    else if (typeof save === 'function') save();
  }

  // Délégation directe à ProjectUtils (pas de redéfinition de logique)
  const getTrelloStatus       = (project) => ProjectUtils.getStatus(project);
  const isUrgent              = (project) => ProjectUtils.isUrgent(project);
  const isOverdue             = (project) => ProjectUtils.isOverdue(project);
  const hasNotes              = (project) => ProjectUtils.hasNotes(project);
  const isCahorsConsultation  = (project) => ProjectUtils.isCahors(project);

  // =====================================================
  // FILTRAGE ET TRI
  // =====================================================
  
  /**
   * Appliquer les filtres et le tri
   */
  // =====================================================
  // FILTRAGE ET TRI — séparation état UI / données (point 3)
  //
  // Règle : applyFiltersAndSort() NE MODIFIE PAS trelloState.
  // Elle lit l'état et produit un tableau filtré/trié.
  // Le résultat est stocké dans trelloState.filtered.
  // =====================================================

  /**
   * Construire les critères de filtrage depuis l'état local du Trello.
   * Pur — ne touche à aucun état.
   */
  function buildTrelloCriteria() {
    return {
      query: trelloState.search,
      // Les filtres rapides sont appliqués après (prédicats custom)
    };
  }

  /**
   * Appliquer les filtres et le tri — met à jour trelloState.filtered.
   * Seule fonction autorisée à écrire trelloState.filtered.
   */
  function applyFiltersAndSort() {
    if (!validateData()) {
      trelloState.filtered = [];
      return;
    }

    // 1. Filtre texte via ProjectUtils (logique partagée)
    let filtered = ProjectUtils.filterProjects(getProjects(), buildTrelloCriteria());

    // 2. Filtres rapides (prédicats métier via ProjectUtils)
    if (trelloState.quickFilter === 'urgent') {
      filtered = filtered.filter(p => ProjectUtils.isUrgent(p));
    } else if (trelloState.quickFilter === 'cahors') {
      filtered = filtered.filter(p => ProjectUtils.isCahors(p));
    } else if (trelloState.quickFilter === 'notes') {
      filtered = filtered.filter(p => ProjectUtils.hasNotes(p));
    }

    // 3. Tri via ProjectUtils
    const colTypeMap = {
      echeance: 'date', creation: 'date',
      societe:  'text', projet: 'text',
    };
    filtered = ProjectUtils.sortProjects(
      filtered,
      trelloState.sortBy,
      trelloState.sortOrder,
      col => colTypeMap[col] || 'text'
    );

    trelloState.filtered = filtered;
  }

  // =====================================================
  // RENDU DES CARTES
  // =====================================================
  
  /**
   * Créer une carte projet
   */
  function createCard(project) {
    const card = document.createElement('div');
    card.className = 'trello-card';
    card.dataset.projectId = project.id;
    card.draggable = true;

    // Classes conditionnelles
    if (isUrgent(project)) card.classList.add('urgent');
    if (isOverdue(project)) card.classList.add('overdue');
    if (trelloState.selected.has(project.id)) card.classList.add('selected');
    if (trelloState.viewMode === 'compact') card.classList.add('compact');

    // En-tête de la carte
    const header = document.createElement('div');
    header.className = 'trello-card-header';

    const title = document.createElement('div');
    title.className = 'trello-card-title';
    title.textContent = project.projet || 'Sans titre';
    title.title = project.projet || 'Sans titre';

    const indicators = document.createElement('div');
    indicators.className = 'trello-card-indicators';

    if (isUrgent(project)) {
      const urgentBadge = document.createElement('span');
      urgentBadge.className = 'indicator urgent';
      urgentBadge.textContent = '🔥';
      urgentBadge.title = 'Urgent';
      indicators.appendChild(urgentBadge);
    }

    if (isOverdue(project)) {
      const overdueBadge = document.createElement('span');
      overdueBadge.className = 'indicator overdue';
      overdueBadge.textContent = '⚠️';
      overdueBadge.title = 'En retard';
      indicators.appendChild(overdueBadge);
    }

    if (isCahorsConsultation(project)) {
      const cahorsBadge = document.createElement('span');
      cahorsBadge.className = 'indicator cahors';
      cahorsBadge.textContent = '⚡';
      cahorsBadge.title = 'Consultation CAHORS';
      indicators.appendChild(cahorsBadge);
    }

    if (hasNotes(project)) {
      const notesBadge = document.createElement('span');
      notesBadge.className = 'indicator notes';
      notesBadge.textContent = '📝';
      notesBadge.title = 'A des notes';
      indicators.appendChild(notesBadge);
    }

    header.appendChild(title);
    header.appendChild(indicators);

    // Bouton édition rapide
    const editBtn = document.createElement('button');
    editBtn.className = 'trello-card-edit-btn';
    editBtn.textContent = '✏️';
    editBtn.title = 'Modifier ce projet (ou double-clic)';
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openCardEditor(project);
    });
    header.appendChild(editBtn);

    // Corps de la carte
    const body = document.createElement('div');
    body.className = 'trello-card-body';

    const societe = document.createElement('div');
    societe.className = 'trello-card-societe';
    societe.textContent = project.societe || 'N/A';
    societe.title = project.societe || 'N/A';

    const meta = document.createElement('div');
    meta.className = 'trello-card-meta';

    if (project.ao) {
      const ao = document.createElement('span');
      ao.className = 'meta-item';
      ao.textContent = `AO ${project.ao}`;
      meta.appendChild(ao);
    }

    if (project.zone_geo) {
      const zone = document.createElement('span');
      zone.className = 'meta-item';
      zone.textContent = project.zone_geo;
      meta.appendChild(zone);
    }

    body.appendChild(societe);
    body.appendChild(meta);

    // Montant
    if (project.montant) {
      const montantEl = document.createElement('div');
      montantEl.className = 'trello-card-montant';
      montantEl.textContent = '💰 ' + project.montant;
      body.appendChild(montantEl);
    }

    // Pied de la carte
    const footer = document.createElement('div');
    footer.className = 'trello-card-footer';

    if (project.echeance) {
      const deadline = document.createElement('div');
      deadline.className = 'trello-card-deadline';
      
      // Utiliser la fonction globale de formatage si disponible
      const formattedDate = typeof formatDateDisplay === 'function' 
        ? formatDateDisplay(project.echeance)
        : project.echeance;
      
      deadline.textContent = `📅 ${formattedDate}`;
      footer.appendChild(deadline);
    }

    if (project.creation) {
      const created = document.createElement('div');
      created.className = 'trello-card-created';
      
      const formattedDate = typeof formatDateDisplay === 'function'
        ? formatDateDisplay(project.creation)
        : project.creation;
      
      created.textContent = `🆕 ${formattedDate}`;
      footer.appendChild(created);
    }

    // Assemblage
    card.appendChild(header);
    card.appendChild(body);
    if (footer.children.length > 0) {
      card.appendChild(footer);
    }

    // Événements
    setupCardEvents(card, project);

    return card;
  }

  /**
   * Toast de notification
   */
  function showToast(msg, type = "success") {
    let toast = document.getElementById("trello-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "trello-toast";
      document.body.appendChild(toast);
    }
    toast.className = `trello-toast trello-toast-${type}`;
    toast.textContent = msg;
    toast.style.opacity = "1";
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { toast.style.opacity = "0"; }, 2500);
  }

  /**
   * Ouvrir la modale d'édition inline d'une carte
   */
  function openCardEditor(project) {
    if (!validateData()) return;

    // Supprimer ancienne modale
    document.getElementById("trello-card-modal")?.remove();

    const modal = document.createElement("div");
    modal.id = "trello-card-modal";
    modal.className = "trello-modal-overlay";

    const STATUS_OPTIONS = [
      { value: "Offre remise",   label: "📨 Offre remise",   cls: "offre" },
      { value: "PROJET  obtenu", label: "✅ Projet obtenu",  cls: "obtenu" },
      { value: "PROJET  perdu",  label: "❌ Projet perdu",   cls: "perdu" },
    ];
    // Compléter avec valeurs existantes
    const extraStatuses = [...new Set(
      getProjects().map(p => p.etat_correspondance_trello).filter(Boolean)
          .filter(s => !STATUS_OPTIONS.find(o => o.value === s))
    )];

    const fmtDate = typeof formatDateDisplay === "function" ? formatDateDisplay : (s => s);

    modal.innerHTML = `
      <div class="trello-modal">
        <div class="trello-modal-header">
          <h2>✏️ Modifier le projet</h2>
          <button class="trello-modal-close" id="tmc-close">✕</button>
        </div>
        <div class="trello-modal-body">
          <div class="trello-field">
            <label>Projet</label>
            <input id="tme-projet" type="text" value="${(project.projet || "").replace(/"/g,"&quot;")}">
          </div>
          <div class="trello-field">
            <label>Société</label>
            <input id="tme-societe" type="text" value="${(project.societe || "").replace(/"/g,"&quot;")}">
          </div>
          <div class="trello-field-row">
            <div class="trello-field">
              <label>Zone géographique</label>
              <input id="tme-zone" type="text" value="${(project.zone_geo || "").replace(/"/g,"&quot;")}">
            </div>
            <div class="trello-field">
              <label>Montant (€)</label>
              <input id="tme-montant" type="text" value="${(project.montant || "").replace(/"/g,"&quot;")}">
            </div>
          </div>
          <div class="trello-field-row">
            <div class="trello-field">
              <label>Création</label>
              <input id="tme-creation" type="text" value="${project.creation ? fmtDate(project.creation) : ""}">
            </div>
            <div class="trello-field">
              <label>Échéance</label>
              <input id="tme-echeance" type="text" value="${project.echeance ? fmtDate(project.echeance) : ""}">
            </div>
          </div>
          <div class="trello-field">
            <label>Statut</label>
            <div class="trello-status-pills" id="tme-status-pills">
              ${STATUS_OPTIONS.map(o => `
                <button type="button" class="trello-status-pill ${o.cls}${project.etat_correspondance_trello === o.value ? " active" : ""}"
                  data-value="${o.value}">${o.label}</button>
              `).join("")}
              ${extraStatuses.map(s => `
                <button type="button" class="trello-status-pill autre${project.etat_correspondance_trello === s ? " active" : ""}"
                  data-value="${s}">${s}</button>
              `).join("")}
            </div>
          </div>
          <div class="trello-field">
            <label>Notes</label>
            <textarea id="tme-notes" rows="3">${project.notes || ""}</textarea>
          </div>
        </div>
        <div class="trello-modal-footer">
          <button class="trello-modal-save" id="tmc-save">💾 Enregistrer</button>
          <button class="trello-modal-cancel" id="tmc-cancel">Annuler</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Sélection statut
    let selectedStatus = project.etat_correspondance_trello || "";
    modal.querySelectorAll(".trello-status-pill").forEach(pill => {
      pill.addEventListener("click", () => {
        modal.querySelectorAll(".trello-status-pill").forEach(p => p.classList.remove("active"));
        pill.classList.add("active");
        selectedStatus = pill.dataset.value;
      });
    });

    // Fermeture
    const close = () => modal.remove();
    document.getElementById("tmc-close").onclick  = close;
    document.getElementById("tmc-cancel").onclick = close;
    modal.addEventListener("click", e => { if (e.target === modal) close(); });

    // Sauvegarde
    document.getElementById("tmc-save").onclick = () => {
      const fmtStorage = typeof ProjectUtils !== 'undefined'
        ? ProjectUtils.formatDateStorage
        : (typeof formatDateStorage === 'function' ? formatDateStorage : s => s);

      project.projet   = document.getElementById("tme-projet").value.trim();
      project.societe  = document.getElementById("tme-societe").value.trim();
      project.zone_geo = document.getElementById("tme-zone").value.trim();
      project.montant  = document.getElementById("tme-montant").value.trim() || null;
      project.creation = fmtStorage(document.getElementById("tme-creation").value.trim());
      project.echeance = fmtStorage(document.getElementById("tme-echeance").value.trim());
      project.etat_correspondance_trello = selectedStatus || project.etat_correspondance_trello;
      project.notes    = document.getElementById("tme-notes").value;

      // Synchroniser les champs dérivés via ProjectUtils
      if (typeof ProjectUtils !== 'undefined') {
        ProjectUtils.syncStatus(project);
        project.montant_parsed = ProjectUtils.parseMontant(project.montant);
      }

      // Synchroniser dans le tableau maître via App (ou fallback)
      const projects = getProjects();
      const idx = projects.findIndex(p => p.id === project.id);
      if (idx !== -1) Object.assign(projects[idx], project);

      persistSave();

      applyFiltersAndSort();
      renderBoard();
      renderHeader();
      close();
      showToast("✅ Projet mis à jour");
    };

    // Focus premier champ
    setTimeout(() => document.getElementById("tme-projet")?.focus(), 50);
  }

  /**
   * Configurer les événements de la carte
   */
  function setupCardEvents(card, project) {
    // Double-clic → édition inline
    card.addEventListener('dblclick', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openCardEditor(project);
    });

    // Survol → preview notes (tooltip natif enrichi)
    if (ProjectUtils.hasNotes(project)) {
      const notesTip = document.createElement('div');
      notesTip.className = 'trello-notes-preview';
      notesTip.textContent = project.notes.length > 180
        ? project.notes.slice(0, 177) + '…'
        : project.notes;
      card.appendChild(notesTip);

      card.addEventListener('mouseenter', () => {
        notesTip.classList.add('visible');
      });
      card.addEventListener('mouseleave', () => {
        notesTip.classList.remove('visible');
      });
    }

    // Click simple
    card.addEventListener('click', (e) => {
      if (e.target.closest('.trello-card-edit-btn')) return;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        toggleSelection(project.id);
      } else {
        clearSelection();
        trelloState.selected.add(project.id);
        renderBoard();
        renderHeader();
      }
    });

    // Drag and drop
    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.effectAllowed = 'move';
      trelloState.draggedCard = project.id;
      trelloState.draggedFrom = getTrelloStatus(project);
      card.classList.add('dragging');
      // Légère opacité sur toutes les colonnes sauf la source
      document.querySelectorAll('.trello-column').forEach(col => {
        if (col.dataset.status !== trelloState.draggedFrom) {
          col.classList.add('drop-eligible');
        }
      });
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      trelloState.draggedCard = null;
      trelloState.draggedFrom = null;
      document.querySelectorAll('.trello-column').forEach(col => {
        col.classList.remove('drop-eligible', 'drag-over');
      });
    });
  }

  /**
   * Basculer la sélection d'un projet
   */
  function toggleSelection(projectId) {
    if (trelloState.selected.has(projectId)) {
      trelloState.selected.delete(projectId);
    } else {
      trelloState.selected.add(projectId);
    }
    renderBoard();
  }

  /**
   * Effacer la sélection
   */
  function clearSelection() {
    trelloState.selected.clear();
  }

  // =====================================================
  // RENDU DU TABLEAU KANBAN
  // =====================================================
  
  /**
   * Créer une colonne Kanban
   */
  function createColumn(columnConfig) {
    const column = document.createElement('div');
    column.className = 'trello-column';
    column.dataset.status = columnConfig.key;

    // En-tête de colonne
    const header = document.createElement('div');
    header.className = 'trello-column-header';
    header.style.borderTopColor = columnConfig.color;

    const title = document.createElement('h3');
    title.textContent = columnConfig.label;

    const count = document.createElement('span');
    count.className = 'trello-column-count';
    count.textContent = '0';

    header.appendChild(title);
    header.appendChild(count);

    // Corps de colonne (zone de drop)
    const body = document.createElement('div');
    body.className = 'trello-column-body';

    // Événements drag & drop
    body.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      column.classList.add('drag-over');
    });

    body.addEventListener('dragleave', () => {
      column.classList.remove('drag-over');
    });

    body.addEventListener('drop', (e) => {
      e.preventDefault();
      column.classList.remove('drag-over');
      handleDrop(columnConfig.key);
    });

    column.appendChild(header);
    column.appendChild(body);

    return column;
  }

  /**
   * Gérer le drop d'une carte
   */
  function handleDrop(targetStatus) {
    if (!trelloState.draggedCard) return;
    if (!validateData()) return;

    const projectId = trelloState.draggedCard;
    const project = getProjects().find(p => p.id === projectId);
    
    if (!project) return;

    const currentStatus = getTrelloStatus(project);
    if (currentStatus === targetStatus) return;

    // Utiliser les valeurs canoniques (avec double espace de la data existante)
    // On cherche d'abord un statut existant dans les projets courants
    const existingStatuses = [...new Set(getProjects().map(p => p.etat_correspondance_trello).filter(Boolean))];
    let newStatus = null;

    if (targetStatus === "obtenu") {
      newStatus = existingStatuses.find(s => s.toLowerCase().replace(/\s+/g," ").includes("obtenu"))
               || "PROJET  obtenu";
    } else if (targetStatus === "perdu") {
      newStatus = existingStatuses.find(s => s.toLowerCase().replace(/\s+/g," ").includes("perdu"))
               || "PROJET  perdu";
    } else if (targetStatus === "offre") {
      newStatus = existingStatuses.find(s => s.toLowerCase().replace(/\s+/g," ").includes("offre"))
               || "Offre remise";
    } else {
      newStatus = null;
    }

    project.etat_correspondance_trello = newStatus;
    // Synchroniser le champ status canonique via ProjectUtils
    ProjectUtils.syncStatus(project);

    persistSave();

    applyFiltersAndSort();
    renderBoard();
    renderHeader();

    // UX : scroller jusqu'à la carte déplacée dans sa nouvelle colonne
    requestAnimationFrame(() => {
      const targetCard = document.querySelector(
        `.trello-column[data-status="${targetStatus}"] .trello-card[data-project-id="${projectId}"]`
      );
      if (targetCard) {
        targetCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        targetCard.classList.add('just-dropped');
        setTimeout(() => targetCard.classList.remove('just-dropped'), 1000);
      }
    });

    showToast(`✅ "${project.projet}" déplacé vers ${targetStatus}`);
  }

  /**
   * Rendre le tableau complet
   */
  function renderBoard() {
    if (!trelloBoard) return;
    if (!validateData()) {
      trelloBoard.innerHTML = '<div class="trello-empty">❌ Données non disponibles</div>';
      return;
    }

    trelloBoard.innerHTML = '';

    // Grouper les projets par colonne
    const projectsByStatus = {
      offre: [],
      obtenu: [],
      perdu: [],
      autre: []
    };

    trelloState.filtered.forEach(project => {
      const status = getTrelloStatus(project);
      projectsByStatus[status].push(project);
    });

    // Créer les colonnes
    TRELLO_COLUMNS.forEach(columnConfig => {
      const column = createColumn(columnConfig);
      const projects = projectsByStatus[columnConfig.key];
      const body = column.querySelector('.trello-column-body');
      const count = column.querySelector('.trello-column-count');

      count.textContent = projects.length;

      if (projects.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'trello-empty';
        empty.textContent = 'Aucun projet';
        body.appendChild(empty);
      } else {
        projects.forEach(project => {
          const card = createCard(project);
          body.appendChild(card);
        });
      }

      trelloBoard.appendChild(column);
    });
  }

  // =====================================================
  // RENDU DE L'EN-TÊTE
  // =====================================================
  
  /**
   * Rendre l'en-tête avec les contrôles
   */
  function renderHeader() {
    if (!trelloHeader) return;

    trelloHeader.innerHTML = '';

    // Section gauche : recherche
    const leftSection = document.createElement('div');
    leftSection.className = 'trello-header-section';

    const searchContainer = document.createElement('div');
    searchContainer.className = 'trello-search';

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = '🔎 Rechercher un projet...';
    searchInput.value = trelloState.search;
    searchInput.addEventListener('input', (e) => {
      trelloState.search = e.target.value;
      applyFiltersAndSort();
      renderBoard();
    });

    searchContainer.appendChild(searchInput);
    leftSection.appendChild(searchContainer);

    // Section centrale : filtres rapides
    const centerSection = document.createElement('div');
    centerSection.className = 'trello-header-section trello-filters';

    const makeQuickFilter = (label, filterKey) => {
      const btn = document.createElement('button');
      btn.className = 'trello-btn' + (trelloState.quickFilter === filterKey ? ' trello-btn-active' : '');
      btn.textContent = label;
      btn.addEventListener('click', () => {
        trelloState.quickFilter = trelloState.quickFilter === filterKey ? null : filterKey;
        applyFiltersAndSort();
        renderBoard();
        renderHeader();
      });
      return btn;
    };

    const urgentFilter  = makeQuickFilter('🔥 Urgent',    'urgent');
    const cahorsFilter  = makeQuickFilter('⚡ CAHORS',    'cahors');
    const notesFilter   = makeQuickFilter('📝 Avec notes','notes');

    const resetFilter = document.createElement('button');
    resetFilter.className = 'trello-btn';
    resetFilter.textContent = '🔄 Réinitialiser';
    resetFilter.addEventListener('click', () => {
      trelloState.quickFilter = null;
      trelloState.search = '';
      applyFiltersAndSort();
      renderBoard();
      renderHeader();
    });

    centerSection.appendChild(urgentFilter);
    centerSection.appendChild(cahorsFilter);
    centerSection.appendChild(notesFilter);
    centerSection.appendChild(resetFilter);

    // Section droite : tri et affichage
    const rightSection = document.createElement('div');
    rightSection.className = 'trello-header-section trello-controls';

    // Sélecteur de tri
    const sortSelect = document.createElement('select');
    sortSelect.className = 'trello-select';
    [
      { value: 'echeance', label: '📅 Échéance' },
      { value: 'creation', label: '🆕 Création' },
      { value: 'societe', label: '🏢 Société' },
      { value: 'projet', label: '📋 Projet' }
    ].forEach(option => {
      const opt = document.createElement('option');
      opt.value = option.value;
      opt.textContent = option.label;
      opt.selected = trelloState.sortBy === option.value;
      sortSelect.appendChild(opt);
    });
    sortSelect.addEventListener('change', (e) => {
      trelloState.sortBy = e.target.value;
      applyFiltersAndSort();
      renderBoard();
    });

    // Bouton d'ordre de tri
    const sortOrderBtn = document.createElement('button');
    sortOrderBtn.className = 'trello-btn';
    sortOrderBtn.textContent = trelloState.sortOrder === 'asc' ? '⬆️' : '⬇️';
    sortOrderBtn.title = trelloState.sortOrder === 'asc' ? 'Croissant' : 'Décroissant';
    sortOrderBtn.addEventListener('click', () => {
      trelloState.sortOrder = trelloState.sortOrder === 'asc' ? 'desc' : 'asc';
      sortOrderBtn.textContent = trelloState.sortOrder === 'asc' ? '⬆️' : '⬇️';
      sortOrderBtn.title = trelloState.sortOrder === 'asc' ? 'Croissant' : 'Décroissant';
      applyFiltersAndSort();
      renderBoard();
    });

    // Bouton mode d'affichage
    const viewModeBtn = document.createElement('button');
    viewModeBtn.className = 'trello-btn';
    viewModeBtn.textContent = trelloState.viewMode === 'cards' ? '📋 Cartes' : '📝 Compact';
    viewModeBtn.addEventListener('click', () => {
      trelloState.viewMode = trelloState.viewMode === 'cards' ? 'compact' : 'cards';
      viewModeBtn.textContent = trelloState.viewMode === 'cards' ? '📋 Cartes' : '📝 Compact';
      renderBoard();
    });

    // Info sélection
    const selectionInfo = document.createElement('div');
    selectionInfo.className = 'trello-selection-info';
    if (trelloState.selected.size > 0) {
      selectionInfo.textContent = `${trelloState.selected.size} sélectionné(s)`;
      
      const clearBtn = document.createElement('button');
      clearBtn.className = 'trello-btn-small';
      clearBtn.textContent = '✕';
      clearBtn.addEventListener('click', () => {
        clearSelection();
        renderBoard();
        renderHeader();
      });
      selectionInfo.appendChild(clearBtn);
    }

    rightSection.appendChild(sortSelect);
    rightSection.appendChild(sortOrderBtn);
    rightSection.appendChild(viewModeBtn);
    rightSection.appendChild(selectionInfo);

    // Assemblage
    trelloHeader.appendChild(leftSection);
    trelloHeader.appendChild(centerSection);
    trelloHeader.appendChild(rightSection);
  }

  /**
   * Créer un bouton de filtre
   */
  function createFilterButton(label, onClick) {
    const btn = document.createElement('button');
    btn.className = 'trello-btn';
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    return btn;
  }

  // =====================================================
  // CRÉATION DU CONTAINER
  // =====================================================
  
  /**
   * Créer le container principal du Trello
   */
  function createTrelloContainer() {
    const container = document.createElement('div');
    container.id = 'trello-view';
    container.className = 'trello-container';
    container.style.display = 'none'; // Caché par défaut

    // Barre de navigation supérieure avec bouton retour
    const navbar = document.createElement('div');
    navbar.className = 'trello-navbar';

    const backBtn = document.createElement('button');
    backBtn.className = 'trello-back-btn';
    backBtn.innerHTML = '← Retour à la carte';
    backBtn.title = 'Retourner à la vue principale (carte + tableau)';
    backBtn.addEventListener('click', () => toggleTrelloView());
    navbar.appendChild(backBtn);

    const navTitle = document.createElement('div');
    navTitle.className = 'trello-nav-title';
    navTitle.textContent = '📋 Vue Kanban — Suivi des consultations';
    navbar.appendChild(navTitle);

    const header = document.createElement('div');
    header.className = 'trello-header';

    const board = document.createElement('div');
    board.className = 'trello-board';

    container.appendChild(navbar);
    container.appendChild(header);
    container.appendChild(board);

    return { container, header, board };
  }

  /**
   * Injecter les styles CSS
   */
  function injectStyles() {
    // Vérifier si les styles sont déjà injectés
    if (document.getElementById('trello-view-styles')) return;

    const style = document.createElement('style');
    style.id = 'trello-view-styles';
    style.textContent = `
      /* Container principal */
      .trello-container {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: #f8fafc;
        z-index: 1000;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      /* Barre de navigation retour */
      .trello-navbar {
        background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
        padding: 0.6rem 1.5rem;
        display: flex;
        align-items: center;
        gap: 1.5rem;
        flex-shrink: 0;         /* ← ne se comprime jamais */
        box-shadow: 0 2px 8px rgba(0,0,0,0.25);
      }

      .trello-back-btn {
        background: rgba(255,255,255,0.12);
        color: white;
        border: 1.5px solid rgba(255,255,255,0.25);
        border-radius: 8px;
        padding: 0.45rem 1.1rem;
        font-size: 0.875rem;
        font-weight: 700;
        cursor: pointer;
        letter-spacing: 0.01em;
        transition: all 0.18s;
        white-space: nowrap;
      }

      .trello-back-btn:hover {
        background: rgba(255,255,255,0.22);
        border-color: rgba(255,255,255,0.5);
        transform: translateX(-2px);
      }

      .trello-nav-title {
        color: rgba(255,255,255,0.8);
        font-size: 0.95rem;
        font-weight: 600;
      }

      /* En-tête */
      .trello-header {
        background: white;
        border-bottom: 2px solid #e2e8f0;
        padding: 1rem 1.5rem;
        display: flex;
        gap: 1.5rem;
        align-items: center;
        flex-shrink: 0;         /* ← ne se comprime jamais */
      }

      .trello-header-section {
        display: flex;
        gap: 0.5rem;
        align-items: center;
      }

      .trello-header-section:first-child {
        flex: 1;
      }

      .trello-search {
        flex: 1;
        max-width: 400px;
      }

      .trello-search input {
        width: 100%;
        padding: 0.5rem 1rem;
        border: 2px solid #e2e8f0;
        border-radius: 8px;
        font-size: 0.95rem;
        transition: border-color 0.2s;
      }

      .trello-search input:focus {
        outline: none;
        border-color: #3b82f6;
      }

      .trello-filters {
        gap: 0.5rem;
      }

      .trello-btn, .trello-select {
        padding: 0.5rem 1rem;
        border: 2px solid #e2e8f0;
        border-radius: 8px;
        background: white;
        cursor: pointer;
        font-size: 0.9rem;
        transition: all 0.2s;
        white-space: nowrap;
      }

      .trello-btn:hover, .trello-select:hover {
        border-color: #3b82f6;
        background: #eff6ff;
      }

      .trello-btn-active, .trello-btn.trello-btn-active {
        background: #3b82f6 !important;
        color: white !important;
        border-color: #2563eb !important;
      }

      .trello-btn-small {
        padding: 0.25rem 0.5rem;
        border: 1px solid #e2e8f0;
        border-radius: 4px;
        background: white;
        cursor: pointer;
        font-size: 0.85rem;
        margin-left: 0.5rem;
      }

      .trello-selection-info {
        font-size: 0.9rem;
        color: #64748b;
        display: flex;
        align-items: center;
      }

      /* Board — occupe tout l'espace restant, scroll horizontal si besoin */
      .trello-board {
        flex: 1;
        min-height: 0;          /* ← clé : permet à flex:1 de s'arrêter à la fenêtre */
        overflow-x: auto;
        overflow-y: hidden;
        padding: 1.5rem;
        display: flex;
        gap: 1.5rem;
        align-items: stretch;   /* colonnes s'étirent sur toute la hauteur du board */
      }

      /* Colonnes — hauteur = hauteur du board, scroll interne */
      .trello-column {
        flex: 1;
        min-width: 300px;
        max-width: 400px;
        background: white;
        border-radius: 12px;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        display: flex;
        flex-direction: column;
        overflow: hidden;       /* ← nécessaire pour que border-radius + scroll interne fonctionnent */
        transition: box-shadow 0.2s, transform 0.2s;
      }

      .trello-column.drag-over {
        box-shadow: 0 0 0 3px #3b82f6;
        transform: scale(1.01);
      }

      .trello-column-header {
        padding: 1rem 1.25rem;
        border-top: 4px solid;
        border-top-left-radius: 12px;
        border-top-right-radius: 12px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: #f8fafc;
        flex-shrink: 0;         /* ← l'en-tête ne se compresse jamais */
      }

      .trello-column-header h3 {
        margin: 0;
        font-size: 1rem;
        font-weight: 600;
        color: #1e293b;
      }

      .trello-column-count {
        background: #e2e8f0;
        color: #475569;
        padding: 0.25rem 0.625rem;
        border-radius: 12px;
        font-size: 0.85rem;
        font-weight: 600;
      }

      /* Corps colonne — flex:1 + min-height:0 = scroll indépendant par colonne */
      .trello-column-body {
        flex: 1;
        min-height: 0;          /* ← clé : sans ça overflow-y:auto ne marche pas dans un flex */
        overflow-y: auto;
        overflow-x: hidden;
        padding: 1rem;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
      }

      /* Cartes */
      .trello-card {
        background: white;
        border: 2px solid #e2e8f0;
        border-radius: 8px;
        padding: 0.875rem;
        cursor: grab;
        transition: all 0.2s;
        display: flex;
        flex-direction: column;
        gap: 0.625rem;
      }

      .trello-card:hover {
        border-color: #3b82f6;
        box-shadow: 0 4px 12px rgba(59, 130, 246, 0.15);
        transform: translateY(-2px);
      }

      .trello-card.dragging {
        opacity: 0.5;
        cursor: grabbing;
      }

      .trello-card.selected {
        border-color: #3b82f6;
        background: #eff6ff;
      }

      .trello-card.urgent {
        border-left: 4px solid #f59e0b;
      }

      .trello-card.overdue {
        border-left: 4px solid #ef4444;
      }

      .trello-card.compact {
        padding: 0.5rem 0.75rem;
        gap: 0.3rem;
      }

      .trello-card-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 0.5rem;
      }

      .trello-card-title {
        font-weight: 600;
        font-size: 0.95rem;
        color: #1e293b;
        line-height: 1.3;
        overflow: hidden;
        text-overflow: ellipsis;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
      }

      .trello-card.compact .trello-card-title {
        font-size: 0.875rem;
        -webkit-line-clamp: 1;
      }

      .trello-card-indicators {
        display: flex;
        gap: 0.25rem;
        flex-shrink: 0;
      }

      .indicator {
        font-size: 0.875rem;
      }

      .trello-card-body {
        display: flex;
        flex-direction: column;
        gap: 0.375rem;
      }

      .trello-card-societe {
        font-size: 0.875rem;
        color: #64748b;
        font-weight: 500;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .trello-card.compact .trello-card-societe {
        font-size: 0.8rem;
      }

      .trello-card-meta {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
      }

      .meta-item {
        font-size: 0.8rem;
        color: #94a3b8;
        background: #f1f5f9;
        padding: 0.125rem 0.5rem;
        border-radius: 4px;
      }

      .trello-card-footer {
        display: flex;
        justify-content: space-between;
        gap: 0.5rem;
        padding-top: 0.375rem;
        border-top: 1px solid #f1f5f9;
        font-size: 0.8rem;
        color: #64748b;
      }

      /* Mode compact : footer réduit mais TOUJOURS visible */
      .trello-card.compact .trello-card-footer {
        font-size: 0.72rem;
        padding-top: 0.2rem;
      }

      /* Empty state */
      .trello-empty {
        text-align: center;
        padding: 2rem;
        color: #94a3b8;
        font-size: 0.9rem;
      }

      /* Scrollbar — visible et propre */
      .trello-column-body::-webkit-scrollbar {
        width: 6px;
      }

      .trello-column-body::-webkit-scrollbar-track {
        background: #f1f5f9;
        border-radius: 3px;
        margin: 4px;
      }

      .trello-column-body::-webkit-scrollbar-thumb {
        background: #cbd5e1;
        border-radius: 3px;
      }

      .trello-column-body::-webkit-scrollbar-thumb:hover {
        background: #94a3b8;
      }

      /* Board scrollbar horizontal */
      .trello-board::-webkit-scrollbar {
        height: 6px;
      }
      .trello-board::-webkit-scrollbar-track {
        background: #e2e8f0;
        border-radius: 3px;
      }
      .trello-board::-webkit-scrollbar-thumb {
        background: #94a3b8;
        border-radius: 3px;
      }
    `;

    document.head.appendChild(style);
  }

  // =====================================================
  // BASCULER LA VUE
  // =====================================================
  
  /**
   * Afficher/masquer la vue Trello
   * Masque le layout principal pour éviter la superposition
   */
  function toggleTrelloView() {
    if (!trelloContainer) return;

    trelloState.active = !trelloState.active;

    // Référence au layout principal (carte + tableau + sidebar)
    const mainLayout = document.querySelector('.layout');

    if (trelloState.active) {
      // Masquer le layout principal
      if (mainLayout) mainLayout.style.display = 'none';

      // Afficher le Trello
      trelloContainer.style.display = 'flex';
      if (toggleButton) {
        toggleButton.textContent = '✕ Fermer Trello';
        toggleButton.classList.add('active');
      }
      
      // Rafraîchir les données et afficher
      applyFiltersAndSort();
      renderHeader();
      renderBoard();
    } else {
      // Masquer le Trello
      trelloContainer.style.display = 'none';

      // Réafficher le layout principal
      if (mainLayout) mainLayout.style.display = '';

      if (toggleButton) {
        toggleButton.textContent = '📋 Vue Trello';
        toggleButton.classList.remove('active');
      }
    }
  }

  // =====================================================
  // INITIALISATION PUBLIQUE
  // =====================================================
  
  /**
   * Initialiser le module Trello
   * @param {string} buttonSelector - Sélecteur CSS du bouton de bascule (optionnel)
   */
  function initTrelloView(buttonSelector = '#toggle-trello') {
    console.log('🎯 Initialisation du module Trello View...');

    // Guard: éviter double initialisation
    if (trelloContainer) {
      console.log('ℹ️ Trello View déjà initialisé, skip.');
      return;
    }

    // Validation
    if (!validateData()) {
      console.error('❌ Trello View: Impossible d\'initialiser sans données valides');
      return;
    }

    // Vérifier les dépendances (App en priorité, fallback sur globales)
    if (!_appData && typeof save !== 'function') {
      console.warn('⚠️ Trello View: ni App.data.save() ni save() global disponible');
    }
    if (typeof formatDateDisplay !== 'function' && typeof ProjectUtils === 'undefined') {
      console.warn('⚠️ Trello View: formatDateDisplay() et ProjectUtils non disponibles');
    }

    // Injecter les styles
    injectStyles();

    // Créer le container
    const { container, header, board } = createTrelloContainer();
    trelloContainer = container;
    trelloHeader = header;
    trelloBoard = board;

    // Ajouter au DOM
    document.body.appendChild(trelloContainer);

    // Trouver ou créer le bouton de bascule
    toggleButton = document.querySelector(buttonSelector);
    
    if (!toggleButton) {
      // Créer un bouton par défaut dans la sidebar si non fourni
      const sidebar = document.querySelector('.sidebar');
      if (sidebar) {
        const actionsDiv = sidebar.querySelector('.sidebar-actions');
        if (actionsDiv) {
          toggleButton = document.createElement('button');
          toggleButton.id = 'toggle-trello';
          toggleButton.textContent = '📋 Vue Trello';
          actionsDiv.insertBefore(toggleButton, actionsDiv.firstChild);
        }
      }
    }

    // Configurer le bouton
    if (toggleButton) {
      toggleButton.addEventListener('click', toggleTrelloView);
      console.log('✅ Bouton de bascule configuré');
    } else {
      console.warn('⚠️ Trello View: Bouton de bascule non trouvé, utilisez toggleTrelloView() manuellement');
    }

    // Initialiser les données
    applyFiltersAndSort();

    console.log('✅ Module Trello View initialisé avec succès');
    console.log(`📊 ${trelloState.filtered.length} projets chargés`);
  }

  // =====================================================
  // EXPOSITION PUBLIQUE
  // =====================================================
  
  // Exposer la fonction d'initialisation
  window.initTrelloView = initTrelloView;
  
  // Exposer la fonction de bascule (pour usage manuel)
  window.toggleTrelloView = toggleTrelloView;

  // ── Abonnement au bus App ────────────────────────────
  // Le Trello se met à jour automatiquement quand les
  // données ou l'état global changent, sans couplage direct.
  if (window.App) {
    window.App.on('change', () => {
      // Ne rafraîchir que si la vue est active (performance)
      if (trelloState.active) {
        applyFiltersAndSort();
        renderBoard();
        renderHeader();
      }
    });

    window.App.on('dataReplaced', () => {
      // Après import backup : réinitialiser le state Trello
      trelloState.search   = '';
      trelloState.selected = new Set();
      if (trelloState.active) {
        applyFiltersAndSort();
        renderBoard();
        renderHeader();
      }
    });

    console.info('📋 Trello View: abonné à App.on("change")');
  }

})();
