/* =====================================================
   APP.JS — Namespace central & State réactif
   v1.0 — Architecture CAHORS Dashboard

   Rôle unique : être le point de coordination entre
   tous les modules sans introduire de couplage direct.

   ┌─────────────────────────────────────────────────┐
   │  data.js → projectUtils.js → APP.JS             │
   │                               ↓       ↓         │
   │                          script.js  trello-view  │
   └─────────────────────────────────────────────────┘

   Principes :
   • Aucune dépendance envers le DOM
   • Aucune logique métier (déléguée à ProjectUtils)
   • Source unique de vérité pour l'état UI
   • Backward-compatible : les alias window.ALL etc.
     continuent de fonctionner pendant la migration

   ⚠️  Doit être chargé APRÈS projectUtils.js
       et AVANT script.js + trello-view.js
===================================================== */

(function (global) {
  'use strict';

  /* ─────────────────────────────────────────────────
     CONSTANTES DE STOCKAGE
     (reprises depuis script.js pour centralisation)
  ───────────────────────────────────────────────── */

  const STORAGE_KEY            = 'cahors-data-v25';
  const COLUMNS_VISIBILITY_KEY = 'cahors-columns-v2';
  const CUSTOM_COLUMNS_KEY     = 'cahors-custom-cols-v1';
  const COLUMN_ORDER_KEY       = 'cahors-col-order-v1';

  /* ─────────────────────────────────────────────────
     COUCHE DONNÉES — chargement + persistance
  ───────────────────────────────────────────────── */

  // 'const DATA' dans data.js n'est pas automatiquement sur window dans certains contextes
  // On cherche dans plusieurs endroits pour être robuste
  const _rawData   = Array.isArray(global.DATA) ? global.DATA
                   : Array.isArray(global.window?.DATA) ? global.window.DATA
                   : [];
  const _saved     = _tryParse(localStorage.getItem(STORAGE_KEY));
  const _oldNotes  = _tryParse(localStorage.getItem('cahors-notes-v1')) || {};
  const _rawMontantIdx = {};
  _rawData.forEach(d => { if (d.ao && d.montant) _rawMontantIdx[d.ao] = d.montant; });

  // Tableau maître — sera exposé via App.data.projects
  let _projects;
  
  // ✨ CORRECTION: Vérifier la cohérence des données avec _rawData
  // Si _saved existe mais n'a pas le même nombre de projets que _rawData,
  // c'est qu'on a changé data.js → vider le cache et recharger
  const _savedValid = Array.isArray(_saved) && _saved.length > 0;
  const _savedCoherent = _savedValid && _rawData.length > 0 && _saved.length === _rawData.length;
  
  // Si localStorage est vide ou corrompu mais DATA existe, utiliser DATA
  const _sourceIsValid = (_savedCoherent || _savedValid) || _rawData.length > 0;

  // 🔥 LOGIC: 
  // - Si _saved et _rawData ont même taille → utiliser _saved (normal)
  // - Si différentes tailles → vider cache et utiliser _rawData (changement détecté)
  // - Si _saved est vide → utiliser _rawData (première fois)
  
  if (_savedCoherent) {
    // Cache valide et cohérent avec data.js
    console.log('[App] ✅ Chargement depuis localStorage (' + _saved.length + ' projets)');
    _projects = _saved.map(d => {
      const p = ProjectUtils.normalizeProject(d);
      if (!p.notes && _oldNotes[p.id])  p.notes = _oldNotes[p.id];
      if (!p.montant && _rawMontantIdx[p.ao]) {
        p.montant        = _rawMontantIdx[p.ao];
        p.montant_parsed = ProjectUtils.parseMontant(p.montant);
      }
      return p;
    });
  } else if (_savedValid && !_savedCoherent) {
    // ⚠️ DÉSYNCHRONISATION DÉTECTÉE!
    console.warn('[App] ⚠️  DÉSYNC: localStorage(' + _saved.length + ') ≠ data.js(' + _rawData.length + ')');
    console.warn('[App] → Nettoyage du cache et rechargement depuis data.js');
    
    // Vider complètement le cache
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('cahors-columns-v2');
    localStorage.removeItem('cahors-custom-cols-v1');
    localStorage.removeItem('cahors-col-order-v1');
    localStorage.removeItem('cahors-filters-v1');
    
    // Charger depuis data.js
    _projects = _rawData.map((d, i) => {
      const p = ProjectUtils.normalizeProject(d, i);
      if (!p.notes && _oldNotes[p.id]) p.notes = _oldNotes[p.id];
      return p;
    });
    
    console.log('[App] ✅ Rechargé depuis data.js (' + _projects.length + ' projets)');
  } else {
    // Première fois ou localStorage vide
    console.log('[App] 📥 Chargement initial depuis data.js (' + _rawData.length + ' projets)');
    if (!_savedValid && _saved !== null) {
      console.warn('[App] localStorage corrompu → suppression');
      localStorage.removeItem(STORAGE_KEY);
    }
    _projects = _rawData.map((d, i) => {
      const p = ProjectUtils.normalizeProject(d, i);
      if (!p.notes && _oldNotes[p.id]) p.notes = _oldNotes[p.id];
      return p;
    });
  }

  function _save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_projects));
    console.log('✅ Sauvegardé —', _projects.length, 'projets');
  }

  function _tryParse(str) {
    try { return str ? JSON.parse(str) : null; }
    catch { return null; }
  }

  /* ─────────────────────────────────────────────────
     COUCHE COLONNES
  ───────────────────────────────────────────────── */

  const SYSTEM_COLUMNS = [
    'annee','ao','societe','projet','statut',
    'zone_geo','consultation_cahors','creation','echeance',
    'montant','latitude','longitude','notes',
    // ✨ Nouvelles colonnes PHASE 1
    'nombre_machines','puissance_mw','type_offre','partenaire_gc','partenaire_terrassier',
    'statut','win_proba','ca_etudie','ca_gagne','marge_brute',
    'date_reception_ao','date_remise_offre','depose_remise_offre','date_ouverture_prix',
    'avertissement_prod','creation_code_chantier','passation_travaux','fin_prevue_chantier','commentaires'
  ];

  const SYSTEM_LABELS = {
    annee:'Année', ao:'AO', societe:'Société', projet:'Projet',
    statut: 'Statut', zone_geo:'Zone',
    consultation_cahors:'Consultation CAHORS',
    creation:'Création', echeance:'Échéance',
    montant:'Montant', latitude:'Lat', longitude:'Lng', notes:'Notes',
    // ✨ Labels pour nouvelles colonnes
    nombre_machines:'Machines', puissance_mw:'Puissance (MW)', type_offre:'Type Offre',
    partenaire_gc:'Partenaire GC', partenaire_terrassier:'Partenaire Terrassier',
    statut:'Statut Commercial', win_proba:'Win %', ca_etudie:'CA Étudié',
    ca_gagne:'CA Gagné', marge_brute:'Marge %',
    date_reception_ao:'Date Réc. AO', date_remise_offre:'Date Remise Offre',
    depose_remise_offre:'Déposé?', date_ouverture_prix:'Date Ouv. Prix',
    avertissement_prod:'Avertissement Prod', creation_code_chantier:'Code Chantier',
    passation_travaux:'Passation Travaux', fin_prevue_chantier:'Fin Prévue',
    commentaires:'Commentaires'
  };

  let _customColumns = _tryParse(localStorage.getItem(CUSTOM_COLUMNS_KEY)) || [];

  let _tableColumns = _tryParse(localStorage.getItem(COLUMN_ORDER_KEY))
    || [...SYSTEM_COLUMNS];

  let _visibleColumns = _tryParse(localStorage.getItem(COLUMNS_VISIBILITY_KEY))
    || {
        annee:true, ao:true, societe:true, projet:true,
        etat_correspondance_trello:true, zone_geo:true,
        consultation_cahors:true, creation:true, echeance:true,
        montant:true, latitude:false, longitude:false, notes:true,
        // ✨ Visibilité par défaut des nouvelles colonnes
        nombre_machines:true, puissance_mw:true, type_offre:true, partenaire_gc:false, partenaire_terrassier:false,
        statut:true, win_proba:true, ca_etudie:false, ca_gagne:false, marge_brute:false,
        date_reception_ao:false, date_remise_offre:false, depose_remise_offre:false, date_ouverture_prix:false,
        avertissement_prod:false, creation_code_chantier:false, passation_travaux:false, fin_prevue_chantier:false, commentaires:false
      };

  // Synchroniser l'ordre des colonnes avec les clés existantes
  (function syncColumnOrder() {
    const all = [...SYSTEM_COLUMNS, ..._customColumns.map(c => c.key)];
    all.forEach(k => { if (!_tableColumns.includes(k)) _tableColumns.push(k); });
    _tableColumns = _tableColumns.filter(k => all.includes(k));
    localStorage.setItem(COLUMN_ORDER_KEY, JSON.stringify(_tableColumns));
  })();

  /* ─────────────────────────────────────────────────
     STATE UI — source unique de vérité
     
     Toutes les variables UI autrefois éparpillées dans
     script.js sont maintenant ici, accessibles et
     modifiables via App.state.
  ───────────────────────────────────────────────── */

  /**
   * État UI centralisé.
   *
   * Convention : les modules LISENT App.state directement,
   * mais ÉCRIVENT via App.state.set() pour déclencher
   * les abonnements.
   */
  const _state = {
    // Filtres texte & checkbox
    searchQuery:      '',
    activeStatFilter: null,
    filterByMapBounds: false,
    chartFilter:      { active: false, type: null, societe: null },
    montantFilter:    { active: false, min: 0, max: Infinity },
    filters: {
      zone_geo:                    new Set(),
      societe:                     new Set(),
      etat_correspondance_trello:  new Set(),
      consultation_cahors:         new Set(),
    },

    // Filtres rapides
    quickFilters: {
      urgent: false,
      cahors: false,
      notes:  false,
      overdue: false,
    },

    // Tri tableau
    sortState: { col: null, dir: 'asc' },

    // Sélection courante
    selection: null,   // projet courant (référence objet)

    // Mode revue commerciale
    reviewMode: {
      active:   false,
      deadline: null,     // Date — filtre offres ≤ N jours
      index:    -1,       // index de navigation
      projects: [],       // liste triée pour la navigation
    },

    // Visibilité des colonnes (sauvegardée)
    _savedVisibleColumns: null,
  };

  /* ─────────────────────────────────────────────────
     BUS D'ÉVÉNEMENTS (publish / subscribe)
     
     Usage :
       App.on('change', () => refresh())
       App.on('selectionChange', (project) => showDetails(project))
       App.emit('change')
  ───────────────────────────────────────────────── */

  const _listeners = {};

  function _on(event, callback) {
    if (!_listeners[event]) _listeners[event] = [];
    _listeners[event].push(callback);
    // Retourne un unsubscribe
    return () => {
      _listeners[event] = _listeners[event].filter(cb => cb !== callback);
    };
  }

  function _emit(event, payload) {
    (_listeners[event] || []).forEach(cb => {
      try { cb(payload); }
      catch(e) { console.error(`[App.emit('${event}')] erreur :`, e); }
    });
  }

  /* ─────────────────────────────────────────────────
     API DONNÉES
  ───────────────────────────────────────────────── */

  const data = Object.freeze({
    /** Tableau maître. Ne jamais remplacer la référence — modifier en place. */
    get projects() { return _projects; },

    /**
     * Remplacer entièrement les projets (ex: import backup).
     * Déclenche 'dataReplaced' puis 'change'.
     */
    replace(newProjects) {
      _projects.length = 0;
      newProjects.forEach(p => _projects.push(p));
      _emit('dataReplaced', _projects);
      _emit('change');
    },

    save: _save,

    /**
     * Mettre à jour un champ sur un projet.
     * Gère la re-synchronisation du statut et de montant_parsed.
     */
    updateField(projectId, key, value) {
      const p = _projects.find(p => p.id === projectId);
      if (!p) return false;

      const isDate = key === 'creation' || key === 'echeance';
      const stored = isDate ? ProjectUtils.formatDateStorage(value) : value;
      p[key] = stored;

      if (key === 'statut') ProjectUtils.syncStatus(p);
      if (key === 'montant') p.montant_parsed = ProjectUtils.parseMontant(stored);

      _save();
      _emit('change');
      return true;
    },

    /** Ajouter un projet normalisé à la fin. */
    addProject(rawValues) {
      const newId = _projects.length
        ? Math.max(..._projects.map(p => p.id)) + 1
        : 1;
      const proj = ProjectUtils.normalizeProject({ ...rawValues, id: newId });
      _projects.push(proj);
      _save();
      _emit('projectAdded', proj);
      _emit('change');
      return proj;
    },

    /** Mettre à jour les notes d'un projet. */
    saveNote(projectId, note) {
      const p = _projects.find(p => p.id === projectId);
      if (!p) return false;
      p.notes = note;
      _save();
      _emit('change');
      return true;
    },
  });

  /* ─────────────────────────────────────────────────
     API COLONNES
  ───────────────────────────────────────────────── */

  const columns = Object.freeze({
    get system()  { return SYSTEM_COLUMNS; },
    get labels()  { return SYSTEM_LABELS; },
    get custom()  { return _customColumns; },
    get order()   { return _tableColumns; },
    get visible() { return _visibleColumns; },

    getAllKeys()  { return [...SYSTEM_COLUMNS, ..._customColumns.map(c => c.key)]; },
    getLabel(k)  { return SYSTEM_LABELS[k] || (_customColumns.find(c => c.key === k) || {}).label || k; },
    getType(k) {
      const c = _customColumns.find(c => c.key === k);
      if (c) return c.type;
      // Dates
      if (k === 'creation' || k === 'echeance' || k === 'date_reception_ao' || 
          k === 'date_remise_offre' || k === 'date_ouverture_prix' || k === 'fin_prevue_chantier') 
        return 'date';
      // Montants
      if (k === 'montant' || k === 'ca_etudie' || k === 'ca_gagne') return 'montant';
      // Coordonnées
      if (k === 'latitude' || k === 'longitude') return 'coord';
      // Pourcentages
      if (k === 'win_proba' || k === 'marge_brute') return 'percent';
      // Nombres
      if (k === 'nombre_machines' || k === 'puissance_mw') return 'number';
      // Booléens
      if (k === 'depose_remise_offre' || k === 'consultation_cahors') return 'boolean';
      return 'text';
    },
    isSystem(k) { return SYSTEM_COLUMNS.includes(k); },

    setVisible(key, visible) {
      _visibleColumns[key] = visible;
      localStorage.setItem(COLUMNS_VISIBILITY_KEY, JSON.stringify(_visibleColumns));
      _emit('columnsChanged');
    },

    setOrder(newOrder) {
      _tableColumns.length = 0;
      newOrder.forEach(k => _tableColumns.push(k));
      localStorage.setItem(COLUMN_ORDER_KEY, JSON.stringify(_tableColumns));
      _emit('columnsChanged');
    },

    addCustom(key, label, type) {
      if (!key || !label) return false;
      if (columns.getAllKeys().includes(key)) return false;
      _customColumns.push({ key, label, type: type || 'text' });
      localStorage.setItem(CUSTOM_COLUMNS_KEY, JSON.stringify(_customColumns));
      _tableColumns.push(key);
      _visibleColumns[key] = true;
      _projects.forEach(d => { if (d[key] === undefined) d[key] = ''; });
      _save();
      localStorage.setItem(COLUMN_ORDER_KEY, JSON.stringify(_tableColumns));
      localStorage.setItem(COLUMNS_VISIBILITY_KEY, JSON.stringify(_visibleColumns));
      _emit('columnsChanged');
      _emit('change');
      return true;
    },

    removeCustom(key) {
      if (SYSTEM_COLUMNS.includes(key)) return false;
      _customColumns = _customColumns.filter(c => c.key !== key);
      _tableColumns.splice(_tableColumns.indexOf(key), 1);
      delete _visibleColumns[key];
      _projects.forEach(d => delete d[key]);
      localStorage.setItem(CUSTOM_COLUMNS_KEY, JSON.stringify(_customColumns));
      localStorage.setItem(COLUMN_ORDER_KEY, JSON.stringify(_tableColumns));
      localStorage.setItem(COLUMNS_VISIBILITY_KEY, JSON.stringify(_visibleColumns));
      _save();
      _emit('columnsChanged');
      _emit('change');
      return true;
    },

    /** Sauvegarder l'état de visibilité actuel pour restauration ultérieure. */
    snapshotVisibility() {
      return { ..._visibleColumns };
    },

    /** Restaurer un snapshot de visibilité. */
    restoreVisibility(snapshot) {
      Object.assign(_visibleColumns, snapshot);
      localStorage.setItem(COLUMNS_VISIBILITY_KEY, JSON.stringify(_visibleColumns));
      _emit('columnsChanged');
    },
  });

  /* ─────────────────────────────────────────────────
     API FILTRAGE — critères + filtres calculés
  ───────────────────────────────────────────────── */

  const filters = Object.freeze({
    /**
     * Construire l'objet critères depuis l'état courant.
     * Consommé par ProjectUtils.filterProjects.
     */
    buildCriteria() {
      return {
        query:       _state.searchQuery,
        statut:      _state.activeStatFilter,
        chartFilter: _state.chartFilter,
        zones:       _state.filters.zone_geo,
        societes:    _state.filters.societe,
        statuses:    _state.filters.statut,
        cahors:      _state.filters.consultation_cahors,
        montant:     _state.montantFilter,
      };
    },

    /**
     * Appliquer les filtres rapides à un tableau déjà filtré.
     */
    applyQuickFilters(projects) {
      const qf = _state.quickFilters;
      let data = projects;
      if (qf.urgent)  data = data.filter(p => ProjectUtils.isUrgent(p));
      if (qf.cahors)  data = data.filter(p => ProjectUtils.isCahors(p));
      if (qf.notes)   data = data.filter(p => ProjectUtils.hasNotes(p));
      if (qf.overdue) data = data.filter(p => ProjectUtils.isOverdue(p));
      return data;
    },

    /**
     * Pipeline complet : critères + quickFilters + deadline revue.
     */
    getFiltered() {
      let data = ProjectUtils.filterProjects(_projects, filters.buildCriteria());
      data = filters.applyQuickFilters(data);
      if (_state.reviewMode.active && _state.reviewMode.deadline) {
        data = data.filter(p => {
          const dl = ProjectUtils.parseDate(p.echeance);
          return dl && dl <= _state.reviewMode.deadline;
        });
      }
      return data;
    },

    /**
     * Réinitialiser tous les filtres UI.
     */
    reset() {
      _state.searchQuery      = '';
      _state.activeStatFilter = null;
      _state.filterByMapBounds = false;
      _state.chartFilter      = { active: false, type: null, societe: null };
      _state.montantFilter    = { active: false, min: 0, max: Infinity };
      Object.values(_state.filters).forEach(s => s.clear());
      Object.keys(_state.quickFilters).forEach(k => (_state.quickFilters[k] = false));
      _emit('filtersReset');
      _emit('change');
    },
  });

  /* ─────────────────────────────────────────────────
     API BACKUP — import / export
  ───────────────────────────────────────────────── */

  const backup = Object.freeze({
    export() {
      return {
        version:          '3.0',
        timestamp:        new Date().toISOString(),
        data:             _projects,
        columnsVisibility: _visibleColumns,
        customColumns:    _customColumns,
        columnOrder:      _tableColumns,
      };
    },

    import(bk) {
      if (!bk?.data || !Array.isArray(bk.data)) throw new Error('Format invalide');
      data.replace(bk.data.map(d => ({ ...d, notes: d.notes || '' })));
      if (bk.columnsVisibility) columns.restoreVisibility(bk.columnsVisibility);
      if (bk.customColumns) {
        _customColumns.length = 0;
        bk.customColumns.forEach(c => _customColumns.push(c));
        localStorage.setItem(CUSTOM_COLUMNS_KEY, JSON.stringify(_customColumns));
      }
      if (bk.columnOrder) {
        columns.setOrder(bk.columnOrder);
      }
      _save();
      filters.reset();
      _emit('change');
    },
  });

  /* ─────────────────────────────────────────────────
     CONFIGURATION CARTE — couleurs + rayon marqueurs
  ───────────────────────────────────────────────── */

  const MAP_LEGEND_KEY = 'cahors-legend-prefs';

  const _mapConfig = (function loadMapConfig() {
    const saved = _tryParse(localStorage.getItem(MAP_LEGEND_KEY));
    return {
      markerRadius: saved?.radius || 6,
      statusColors: Object.assign(
        { obtenu: '#10b981', perdu: '#ef4444', offre: '#3b82f6', autre: '#f59e0b' },
        saved?.colors || {}
      ),
    };
  })();

  const mapConfig = {
    get markerRadius()  { return _mapConfig.markerRadius; },
    set markerRadius(v) { _mapConfig.markerRadius = v; },
    get statusColors()  { return _mapConfig.statusColors; },

    save() {
      localStorage.setItem(MAP_LEGEND_KEY, JSON.stringify({
        radius: _mapConfig.markerRadius,
        colors: { ..._mapConfig.statusColors },
      }));
    },

    reset() {
      Object.assign(_mapConfig.statusColors, {
        obtenu: '#10b981', perdu: '#ef4444', offre: '#3b82f6', autre: '#f59e0b'
      });
      _mapConfig.markerRadius = 6;
      localStorage.removeItem(MAP_LEGEND_KEY);
    },
  };

  /* ─────────────────────────────────────────────────
     NAMESPACE PUBLIC — window.App
  ───────────────────────────────────────────────── */

  const App = Object.freeze({
    /** Version de l'architecture */
    version: '3.0',

    /** État UI centralisé (lecture directe, écriture libre) */
    state: _state,

    /** Couche données */
    data,

    /** Gestion des colonnes */
    columns,

    /** Filtrage centralisé */
    filters,

    /** Import / Export backup */
    backup,

    /** Config carte */
    mapConfig,

    /** Bus d'événements */
    on:   _on,
    emit: _emit,
  });

  global.App = App;

  /* ─────────────────────────────────────────────────
     ALIASES BACKWARD-COMPATIBLE
     
     Ces aliases permettent à script.js et trello-view.js
     existants de continuer à fonctionner sans modification
     immédiate. Ils seront retirés progressivement.
     
     Note : ALL est exposé comme proxy — les modifications
     sur le tableau original sont reflétées.
  ───────────────────────────────────────────────── */

  // Proxy transparent sur le tableau maître
  // Triple safety net: si _projects est vide mais _rawData ne l'est pas,
  // c'est un problème de chargement — on force le rechargement depuis data.js
  if (_projects.length === 0 && _rawData.length > 0) {
    console.warn('[App] 🔄 _projects vide mais DATA disponible — rechargement forcé depuis data.js');
    localStorage.removeItem(STORAGE_KEY);
    _projects = _rawData.map((d, i) => {
      const p = ProjectUtils.normalizeProject(d, i);
      if (!p.notes && _oldNotes[p.id]) p.notes = _oldNotes[p.id];
      return p;
    });
  }

  global.ALL = _projects;

  // save() globale
  global.save = _save;

  if (_projects.length === 0) {
    console.error('[App] ⚠️ AUCUN PROJET CHARGÉ ! Vérifiez data.js et localStorage.');
    console.info('DATA disponible:', Array.isArray(globalThis.DATA), globalThis.DATA?.length || 0, 'projets');
  } else {
    console.info(
      `%c🏗️ App.js v${App.version} initialisé — ${_projects.length} projets chargés`,
      'color:#0d9488;font-weight:700;'
    );
  }

})(typeof globalThis !== 'undefined' ? globalThis : window);