/* =====================================================
   PROJECT UTILS — Module logique métier centralisé (VERSION COMPLÈTE)
   
   ✨ COMPATIBLE avec le nouveau format de statut unifié
   
   Source unique de vérité pour :
   - Statuts (parsing, canonicalisation, couleurs)
   - Montants (parsing, formatage)
   - Dates (parsing, formatage, calculs)
   - Prédicats métier (urgent, en retard, CAHORS…)
   - Normalisation des projets à l'entrée
   - Filtrage / recherche
   - TRI DE DONNÉES ✨ NOUVEAU
   - CALCUL DES KPIs ✨ NOUVEAU
   - PIPELINE KPIs ✨ NOUVEAU
   
   ⚠️  Ce fichier DOIT être chargé avant script.js et trello-view.js
   ⚠️  Aucune dépendance envers le DOM ou d'autres modules
===================================================== */

(function (global) {
  'use strict';

  /* ---------------------------------------------------
     STATUTS — définitions canoniques
     
     ✨ NOUVEAU : Compatible avec le format unifié
     - Colonne "statut" : "Obtenu", "Perdu", "Offre"
     - Rétrocompatibilité avec ancien format
  --------------------------------------------------- */

  const STATUS_KEYS = Object.freeze({
    OBTENU: 'obtenu',
    PERDU:  'perdu',
    OFFRE:  'offre',
    AUTRE:  'autre'
  });

  /** Labels d'affichage par clé de statut */
  const STATUS_LABELS = Object.freeze({
    obtenu: 'Projet obtenu',
    perdu:  'Projet perdu',
    offre:  'Offre remise',
    autre:  'Autre'
  });

  /** Couleurs CSS associées */
  const STATUS_COLORS = Object.freeze({
    obtenu: '#10b981',
    perdu:  '#ef4444',
    offre:  '#3b82f6',
    autre:  '#f59e0b'
  });

  /** Classes CSS associées (pour les badges) */
  const STATUS_CSS = Object.freeze({
    obtenu: 'obtenu',
    perdu:  'perdu',
    offre:  'offre',
    autre:  'autre'
  });

  /**
   * ✨ NOUVEAU : Extraire la clé de statut depuis le format unifié
   * Compatible avec :
   * - Nouveau format : "Obtenu", "Perdu", "Offre"
   * - Ancien format : "Gagné", "PROJET obtenu", etc.
   *
   * @param {string|null|undefined} rawStatus
   * @returns {'obtenu'|'perdu'|'offre'|'autre'}
   */
  function parseStatusKey(rawStatus) {
    if (!rawStatus) return STATUS_KEYS.AUTRE;
    const s = String(rawStatus)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
    
    // Format data.js actuel
    if (s === 'gagne' || s === 'obtenu') return STATUS_KEYS.OBTENU;
    if (s === 'perdu') return STATUS_KEYS.PERDU;
    if (s === 'remis' || s === 'remise' || s === 'en etude' || s === 'avant projet' || s === 'non chiffre' || s === 'non chiffree') return STATUS_KEYS.OFFRE;
    if (s === 'abandonne' || s === 'abandone' || s === 'abandon') return STATUS_KEYS.PERDU;
    
    // Formats génériques
    if (s.includes('obtenu') || s.includes('gagn')) return STATUS_KEYS.OBTENU;
    if (s.includes('perdu')) return STATUS_KEYS.PERDU;
    if (s.includes('abandon')) return STATUS_KEYS.PERDU;
    if (s.includes('non chiffre') || s.includes('remis') || s.includes('remise') || s.includes('offre') || s.includes('etude') || s.includes('avant projet')) return STATUS_KEYS.OFFRE;
    
    return STATUS_KEYS.AUTRE;
  }

  /**
   * ✨ NOUVEAU : Retourner la clé de statut d'un projet
   * Compatible avec nouveau et ancien format
   *
   * @param {Object} project
   * @returns {'obtenu'|'perdu'|'offre'|'autre'}
   */
  function getStatus(project) {
    if (!project) return STATUS_KEYS.AUTRE;
    
    // Essayer d'abord la colonne "Statut" brute issue du CSV/import
    if (project['Statut']) {
      const primary = parseStatusKey(project['Statut']);
      if (primary !== STATUS_KEYS.AUTRE) return primary;
    }

    // Fallback utile quand le statut principal est ambigu mais qu'Odoo précise la situation
    if (project['MG Statut Odoo MG']) {
      const secondary = parseStatusKey(project['MG Statut Odoo MG']);
      if (secondary !== STATUS_KEYS.AUTRE) return secondary;
    }
    
    // Rétrocompatibilité : essayer le champ normalisé "status"
    if (project.status && STATUS_KEYS[project.status.toUpperCase()]) {
      return project.status;
    }

    return STATUS_KEYS.AUTRE;
  }

  /**
   * ✨ NOUVEAU : Valeur d'affichage du statut d'un projet
   * Compatible avec nouveau et ancien format
   *
   * @param {Object} project
   * @returns {string}
   */
  function getStatusLabel(project) {
    if (!project) return STATUS_LABELS.autre;
    
    // Utiliser la colonne statut si disponible
    if (project['Statut']) {
      const normalized = parseStatusKey(project['Statut']);
      return STATUS_LABELS[normalized] || project['Statut'];
    }
    
    // Rétrocompatibilité
    if (project['Statut']) {
      return String(project['Statut']).replace(/\s+/g, ' ').trim();
    }
    
    return STATUS_LABELS[getStatus(project)] || STATUS_LABELS.autre;
  }

  /* ---------------------------------------------------
     MONTANTS — parsing et formatage
  --------------------------------------------------- */

  /**
   * Extraire la valeur numérique d'un montant textuel.
   * Ex: "1 322 506 €" → 1322506
   *
   * @param {string|number|null|undefined} raw
   * @returns {number|null}  null si non parseable
   */
  function parseMontant(raw) {
    if (raw === null || raw === undefined || raw === '') return null;
    if (typeof raw === 'number') return isFinite(raw) ? raw : null;
    
    const str = String(raw).trim();
    if (!str) return null;
    
    // Supprimer espaces, devises et caractères parasites, garder virgule décimale
    const normalized = str
      .replace(/[\u20AC\u0080\$\u00A3\u00A0\u202F\s]/g, '')
      .replace(/[^\d,.\-]/g, '')
      .replace(/\.(?=\d{3})/g, '') // Supprimer points de milliers
      .replace(',', '.');           // Remplacer virgule décimale
    
    const num = parseFloat(normalized);
    return isFinite(num) ? num : null;
  }

  /**
   * Lire un montant métier avec filet de secours sur les autres champs
   * financiers disponibles dans le dataset.
   */
  function getProjectAmount(project) {
    if (!project) return 0;
    const keys = ['Bud', 'MB (€)', 'MB ()', 'CA win proba'];
    for (const key of keys) {
      const value = parseMontant(project[key]);
      if (value !== null && value > 0) return value;
    }
    return 0;
  }

  /**
   * Formater un montant numérique pour l'affichage.
   *
   * @param {number|string} value
   * @param {boolean} [compact=false]  true → "1.3M€", false → "1 322 506 €"
   * @returns {string}
   */
  function formatMontant(value, compact = false) {
    const num = parseMontant(value);
    if (num === null) return '—';
    
    if (compact) {
      if (num >= 1e6)  return (num / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M€';
      if (num >= 1000) return Math.round(num / 1000) + 'k€';
      return Math.round(num) + '€';
    }
    
    return Math.round(num).toLocaleString('fr-FR') + ' €';
  }

  /* ---------------------------------------------------
     DATES — parsing et formatage
  --------------------------------------------------- */

  /**
   * Parser une date depuis plusieurs formats possibles.
   * Accepte : "2025-07-17" (storage), "17/07/2025" (affichage)
   *
   * @param {string|Date|null|undefined} dateStr
   * @returns {Date|null}
   */
  function parseDate(dateStr) {
    if (!dateStr) return null;
    if (dateStr instanceof Date) return isNaN(dateStr.getTime()) ? null : dateStr;
    
    const s = String(dateStr).trim();
    if (!s || s === 'x' || s === 'X') return null;

    function isValidDateParts(year, month, day) {
      if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
      if (year < 1900 || year > 2100) return false;
      if (month < 1 || month > 12) return false;
      if (day < 1 || day > 31) return false;
      const d = new Date(year, month - 1, day);
      return d.getFullYear() === year && d.getMonth() === (month - 1) && d.getDate() === day;
    }

    function buildDate(year, month, day) {
      if (year < 100) year += 2000;
      if (!isValidDateParts(year, month, day)) return null;
      return new Date(year, month - 1, day);
    }
    
    // Excel serial date
    if (/^\d{5,6}$/.test(s)) {
      const serial = parseInt(s, 10);
      if (serial > 20000 && serial < 80000) {
        const excelEpoch = new Date(1899, 11, 30);
        const d = new Date(excelEpoch.getTime() + serial * 86400000);
        if (!isNaN(d.getTime())) return d;
      }
    }

    // Format YYYY-MM-DD, YYYY/MM/DD, YYYY.MM.DD avec heure optionnelle
    let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/);
    if (m) {
      const d = buildDate(parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10));
      if (d) return d;
    }

    // Format DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY avec heure optionnelle
    m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:[T\s].*)?$/);
    if (m) {
      const d = buildDate(parseInt(m[3], 10), parseInt(m[2], 10), parseInt(m[1], 10));
      if (d) return d;
    }

    // Formats texte ex: "17 juillet 2025", "17 Jul 2025"
    const normalized = s
      .toLowerCase()
      .replace(/é|è|ê/g, 'e')
      .replace(/à/g, 'a')
      .replace(/û|ù/g, 'u')
      .replace(/ô/g, 'o')
      .replace(/î|ï/g, 'i')
      .replace(/ç/g, 'c')
      .replace(/,/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const monthNames = {
      jan: 1, janvier: 1,
      fev: 2, fevr: 2, fevrier: 2, feb: 2, february: 2,
      mar: 3, mars: 3, march: 3,
      avr: 4, avril: 4, apr: 4, april: 4,
      mai: 5, may: 5,
      jun: 6, juin: 6, june: 6,
      jul: 7, juil: 7, juillet: 7, july: 7,
      aou: 8, aout: 8, aug: 8, august: 8,
      sep: 9, sept: 9, septembre: 9, september: 9,
      oct: 10, octobre: 10, october: 10,
      nov: 11, novembre: 11, november: 11,
      dec: 12, decembre: 12, december: 12
    };
    m = normalized.match(/^(\d{1,2})\s+([a-z]+)\s+(\d{2,4})(?:\s+.*)?$/);
    if (m) {
      const month = monthNames[m[2]];
      if (month) {
        const d = buildDate(parseInt(m[3], 10), month, parseInt(m[1], 10));
        if (d) return d;
      }
    }

    const native = new Date(s);
    if (!isNaN(native.getTime())) return native;

    return null;
  }

  /**
   * Formater une date stockage (YYYY-MM-DD) en affichage (JJ/MM/AA).
   *
   * @param {string|Date|null|undefined} dateStr
   * @returns {string}  "17/07/25"
   */
  function formatDateDisplay(dateStr) {
    const d = parseDate(dateStr);
    if (!d) {
      const raw = dateStr == null ? '' : String(dateStr).trim();
      return raw || '—';
    }
    
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = String(d.getFullYear()).slice(-2);
    return `${day}/${month}/${year}`;
  }

  /**
   * Formater une date en "JJ/MM/AAAA" complet.
   *
   * @param {string|Date|null|undefined} dateStr
   * @returns {string}
   */
  function formatDateFull(dateStr) {
    const d = parseDate(dateStr);
    if (!d) {
      const raw = dateStr == null ? '' : String(dateStr).trim();
      return raw || '—';
    }
    
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  }

  /**
   * Formater une date pour le stockage (YYYY-MM-DD).
   * Accepte date au format affichage ou Date object.
   *
   * @param {string|Date|null|undefined} dateStr
   * @returns {string}  "2025-07-17"
   */
  function formatDateStorage(dateStr) {
    const d = parseDate(dateStr);
    if (!d) return '';
    
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Parser une date d'affichage (JJ/MM/AA ou JJ/MM/AAAA) en storage (YYYY-MM-DD).
   *
   * @param {string} displayDate  "17/07/25" ou "17/07/2025"
   * @returns {string|null}  "2025-07-17" ou null si invalide
   */
  function parseDateToStorage(displayDate) {
    if (!displayDate || typeof displayDate !== 'string') return null;
    const parts = displayDate.split('/');
    if (parts.length !== 3) return null;
    let [day, month, year] = parts.map(s => parseInt(s, 10));
    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
    if (year < 100) year += 2000;
    if (year < 1900 || year > 2100) return null;
    if (month < 1 || month > 12) return null;
    if (day < 1 || day > 31) return null;
    const yyyy = String(year);
    const mm = String(month).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  /**
   * Nombre de jours depuis la date jusqu'à aujourd'hui.
   * Positif = date dans le futur, négatif = date passée.
   *
   * @param {string|Date|null|undefined} dateStr
   * @returns {number|null}
   */
  function daysUntil(dateStr) {
    if (!dateStr) return null;
    const target = parseDate(dateStr);
    if (!target) return null;
    
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);
    
    return Math.round((target - now) / (1000 * 60 * 60 * 24));
  }

  /**
   * Calculer le délai entre deux dates en jours.
   *
   * @param {string|Date} startDate
   * @param {string|Date} endDate
   * @returns {number|null}
   */
  function daysBetween(startDate, endDate) {
    if (!startDate || !endDate) return null;
    const start = parseDate(startDate);
    const end = parseDate(endDate);
    if (!start || !end) return null;
    
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    
    return Math.round((end - start) / (1000 * 60 * 60 * 24));
  }

  /* ---------------------------------------------------
     PRÉDICATS MÉTIER
  --------------------------------------------------- */

  /**
   * Un projet est-il "urgent" ? (échéance ≤ 7j ET statut = offre)
   *
   * @param {Object} project
   * @returns {boolean}
   */
  function isUrgent(project) {
    if (getStatus(project) !== STATUS_KEYS.OFFRE) return false;
    const days = daysUntil(project['Date de retour demandée']);
    return days !== null && days >= 0 && days <= 7;
  }

  /**
   * Un projet est-il "en retard" ? (échéance dépassée ET statut = offre)
   *
   * @param {Object} project
   * @returns {boolean}
   */
  function isOverdue(project) {
    if (getStatus(project) !== STATUS_KEYS.OFFRE) return false;
    const days = daysUntil(project['Date de retour demandée']);
    return days !== null && days < 0;
  }

  /**
   * Un projet est-il une consultation CAHORS ?
   *
   * @param {Object} project
   * @returns {boolean}
   */
  function isCahors(project) {
    return project?.['Consultation CAHORS'] === 'Oui';
  }

  /**
   * Un projet a-t-il des notes ?
   *
   * @param {Object} project
   * @returns {boolean}
   */
  function hasNotes(project) {
    return !!(project?.['Commentaires']?.trim()?.length);
  }

  /* ---------------------------------------------------
     TRI DE DONNÉES ✨ NOUVEAU
  --------------------------------------------------- */

  /**
   * Déterminer le type d'une colonne pour bien la trier.
   * Accepte une fonction getColumnType ou un type string.
   *
   * @param {string} col  Nom de colonne
   * @param {function|string} getColumnType  Fonction ou type par défaut
   * @returns {'number'|'date'|'string'}
   */
  function getColumnSortType(col, getColumnType) {
    if (!getColumnType) return 'string';
    if (typeof getColumnType === 'function') {
      return getColumnType(col) || 'string';
    }
    return String(getColumnType);
  }

  /**
   * Comparer deux valeurs pour le tri.
   *
   * @param {*} a
   * @param {*} b
   * @param {'number'|'date'|'string'} type
   * @param {'asc'|'desc'} dir
   * @returns {number}
   */
  function compareForSort(a, b, type = 'string', dir = 'asc') {
    let result = 0;

    if (type === 'number') {
      const numA = parseMontant(a) ?? -Infinity;
      const numB = parseMontant(b) ?? -Infinity;
      result = numA - numB;
    } else if (type === 'date') {
      const dateA = parseDate(a);
      const dateB = parseDate(b);
      const timeA = dateA ? dateA.getTime() : Infinity;
      const timeB = dateB ? dateB.getTime() : Infinity;
      result = timeA - timeB;
    } else {
      // string par défaut
      const strA = String(a || '').toLowerCase();
      const strB = String(b || '').toLowerCase();
      result = strA.localeCompare(strB, 'fr');
    }

    return dir === 'desc' ? -result : result;
  }

  /**
   * Trier un tableau de projets.
   *
   * @param {Object[]} projects
   * @param {string} col  Colonne de tri
   * @param {'asc'|'desc'} dir  Direction
   * @param {function} getColumnType  Fonction pour obtenir le type
   * @returns {Object[]}
   */
  function sortProjects(projects, col, dir = 'asc', getColumnType) {
    if (!Array.isArray(projects) || !col) return projects;

    const sorted = [...projects];
    const sortType = getColumnSortType(col, getColumnType);

    sorted.sort((a, b) => {
      const valA = a[col];
      const valB = b[col];
      return compareForSort(valA, valB, sortType, dir);
    });

    return sorted;
  }

  /* ---------------------------------------------------
     KPIs & STATISTIQUES ✨ NOUVEAU
  --------------------------------------------------- */

  /**
   * Calculer les KPIs principaux d'une liste de projets.
   *
   * @param {Object[]} projects
   * @returns {Object}  KPIs calculés
   */
  function computeKPIs(projects) {
    if (!Array.isArray(projects)) projects = [];

    const kpis = {
      total: projects.length,
      obtenu: 0,
      perdu: 0,
      offre: 0,
      caTotal: 0,
      caObtenu: 0,
      caAvg: null,
      tauxConversion: null,
      delaiMoyen: null,
      overdueCount: 0,
      totalMachines: 0,
      avgPower: null
    };

    if (kpis.total === 0) return kpis;

    let sumDelay = 0;
    let countDelay = 0;
    let sumPower = 0;
    let countObtenuWithPower = 0;

    projects.forEach(p => {
      const status = getStatus(p);

      // Compter par statut
      if (status === STATUS_KEYS.OBTENU) kpis.obtenu++;
      else if (status === STATUS_KEYS.PERDU) kpis.perdu++;
      else if (status === STATUS_KEYS.OFFRE) kpis.offre++;

      // CA
      const montant = getProjectAmount(p);
      if (montant !== null) {
        kpis.caTotal += montant;
        if (status === STATUS_KEYS.OBTENU) kpis.caObtenu += montant;
      }

      // Overdue
      if (isOverdue(p)) kpis.overdueCount++;

      // Délai (date création à échéance)
      if (p['Date réception'] && p['Date de retour demandée']) {
        const delai = daysBetween(p['Date réception'], p['Date de retour demandée']);
        if (delai !== null && delai >= 0) {
          sumDelay += delai;
          countDelay++;
        }
      }

      // Machines
      const machines = parseInt(0) || 0;
      if (machines > 0) kpis.totalMachines += machines;

      // Puissance (moyenne sur obtenus)
      const power = parseMontant(p['Puissance (MWc)']);
      if (power !== null && status === STATUS_KEYS.OBTENU) {
        sumPower += power;
        countObtenuWithPower++;
      }
    });

    // Taux de conversion
    if (kpis.obtenu + kpis.perdu > 0) {
      kpis.tauxConversion = Math.round((kpis.obtenu / (kpis.obtenu + kpis.perdu)) * 100);
    }

    // CA moyen obtenu
    if (kpis.obtenu > 0 && kpis.caObtenu > 0) {
      kpis.caAvg = Math.round(kpis.caObtenu / kpis.obtenu);
    }

    // Délai moyen
    if (countDelay > 0) {
      kpis.delaiMoyen = Math.round(sumDelay / countDelay);
    }

    // Puissance moyenne
    if (countObtenuWithPower > 0) {
      kpis.avgPower = (sumPower / countObtenuWithPower).toFixed(1);
    }

    return kpis;
  }

  /**
   * Calculer les KPIs de pipeline (prévisionnel).
   *
   * @param {Object[]} projects
   * @param {number} conversionRate  Taux de conversion (%)
   * @returns {Object}
   */
  function computePipelineKPIs(projects, conversionRate) {
    if (!Array.isArray(projects)) projects = [];

    const pipeline = {
      caPipeline: null,
      topClient: null,
      decisionTime: null,
      responseRate: null
    };

    if (projects.length === 0) return pipeline;

    // CA Pipeline = montant des offres × taux de conversion
    let offreMontant = 0;
    let totalOffres = 0;

    projects.forEach(p => {
      if (getStatus(p) === STATUS_KEYS.OFFRE) {
        totalOffres++;
        const montant = getProjectAmount(p);
        if (montant !== null) offreMontant += montant;
      }
    });

    if (offreMontant > 0 && conversionRate !== null && conversionRate > 0) {
      pipeline.caPipeline = Math.round(offreMontant * (conversionRate / 100));
    }

    // Top client (client avec le plus d'offres actives)
    const clientCounts = {};
    projects.forEach(p => {
      if (getStatus(p) === STATUS_KEYS.OFFRE && p['Client']) {
        clientCounts[p['Client']] = (clientCounts[p['Client']] || 0) + 1;
      }
    });

    if (Object.keys(clientCounts).length > 0) {
      pipeline.topClient = Object.keys(clientCounts).reduce((a, b) =>
        clientCounts[a] > clientCounts[b] ? a : b
      );
    }

    // Temps moyen de décision
    let sumDecisionTime = 0;
    let countDecisions = 0;

    projects.forEach(p => {
      const status = getStatus(p);
      if ((status === STATUS_KEYS.OBTENU || status === STATUS_KEYS.PERDU) && 
          p['Date réception'] && p['Décidé le ']) {
        const decisionTime = daysBetween(p['Date réception'], p['Décidé le ']);
        if (decisionTime !== null && decisionTime >= 0) {
          sumDecisionTime += decisionTime;
          countDecisions++;
        }
      }
    });

    if (countDecisions > 0) {
      pipeline.decisionTime = Math.round(sumDecisionTime / countDecisions);
    }

    // Taux de réponse
    if (totalOffres > 0) {
      const responseCount = projects.filter(p =>
        getStatus(p) === STATUS_KEYS.OFFRE && p['Date réception']
      ).length;
      pipeline.responseRate = Math.round((responseCount / totalOffres) * 100);
    }

    return pipeline;
  }

  /* ---------------------------------------------------
     NORMALISATION & RECHERCHE
  --------------------------------------------------- */

  /**
   * Normaliser un projet brut (data.js) en projet interne.
   *
   * @param {Object} raw
   * @param {number} [index=0]
   * @returns {Object}
   */
  function normalizeProject(raw, index = 0) {
    const normalized = { ...raw };

    if (!normalized.id) {
      normalized.id = index + 1;
    }

    normalized.status = getStatus(raw);

    // [CORRIGÉ v2] Calculer _annee via Analytics.getProjectYear() si disponible
    // Règle 4 : respecter activeDateField — aucune lecture directe de 'Date réception'
    if (!normalized._annee) {
      if (typeof Analytics !== 'undefined' && typeof Analytics.getProjectYear === 'function') {
        normalized._annee = Analytics.getProjectYear(normalized);
      } else {
        // Fallback minimal — uniquement si Analytics non chargé
        const dateStr = normalized['Date réception'];
        if (dateStr && dateStr !== 'x' && dateStr !== 'X') {
          const d = parseDate(dateStr);
          if (d) normalized._annee = String(d.getFullYear());
        }
      }
    }

    if (typeof normalized.ctrl === 'string') {
      normalized.ctrl = normalized.ctrl.toLowerCase() === 'true';
    } else if (typeof normalized.ctrl !== 'boolean') {
      normalized.ctrl = false;
    }

    return normalized;
  }

  /**
   * Un projet matche-t-il une recherche textuelle ?
   *
   * @param {Object} project
   * @param {string} searchText
   * @returns {boolean}
   */
  function matchesSearch(project, searchText) {
    if (!searchText) return true;
    const needle = searchText.toLowerCase();
    const haystack = [
      project.societe,
      project.projet,
      project.zone_geo,
      project['Commentaires'],
      project.type_offre,
      project.ao
    ]
      .filter(Boolean)
      .map(v => String(v).toLowerCase())
      .join(' ');
    return haystack.includes(needle);
  }

  /* ---------------------------------------------------
     FILTRAGE
  --------------------------------------------------- */

  /**
   * Filtrer un tableau de projets selon des critères.
   *
   * @param {Object[]} projects
   * @param {Object} filters
   * @returns {Object[]}
   */
  function filterProjects(projects, filters = {}) {
    let filtered = projects;

    if (filters.searchText) {
      filtered = filtered.filter(p => matchesSearch(p, filters.searchText));
    }

    if (filters['Zone Géographique']) {
      filtered = filtered.filter(p => p['Zone Géographique'] === filters['Zone Géographique']);
    }

    if (filters['Client']) {
      filtered = filtered.filter(p => p['Client'] === filters['Client']);
    }

    if (filters.status) {
      filtered = filtered.filter(p => getStatus(p) === filters.status);
    }

    if (filters.consultation_cahors !== undefined) {
      const target = filters.consultation_cahors ? 'Oui' : 'Non';
      filtered = filtered.filter(p => null === target);
    }

    if (filters.minPower) {
      filtered = filtered.filter(p =>
        (parseFloat(p['Puissance (MWc)']) || 0) >= filters.minPower
      );
    }

    if (filters.minCA) {
      filtered = filtered.filter(p =>
        getProjectAmount(p) >= filters.minCA
      );
    }

    return filtered;
  }

  /* ---------------------------------------------------
     EXPORT PUBLIC
  ================================================== */

  const ProjectUtils = Object.freeze({
    // Constants
    STATUS_KEYS,
    STATUS_LABELS,
    STATUS_COLORS,
    STATUS_CSS,

    // Statuts
    parseStatusKey,
    getStatus,
    getStatusLabel,

    // Montants
    parseMontant,
    getProjectAmount,
    formatMontant,

    // Dates
    parseDate,
    formatDateDisplay,
    formatDateFull,
    formatDateStorage,
    parseDateToStorage,
    daysUntil,
    daysBetween,

    // Prédicats métier
    isUrgent,
    isOverdue,
    isCahors,
    hasNotes,

    // Tri
    sortProjects,
    compareForSort,

    // KPIs & Statistiques
    computeKPIs,
    computePipelineKPIs,

    // Normalisation & Recherche
    normalizeProject,
    matchesSearch,
    filterProjects
  });

  global.ProjectUtils = ProjectUtils;

})(typeof window !== 'undefined' ? window : global);
