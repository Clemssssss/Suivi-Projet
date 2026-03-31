/**
 * ============================================================
 * ANALYTICS.JS — Couche analytique centralisée v3.0
 * ============================================================
 *
 * SOURCE UNIQUE DE VÉRITÉ pour tous les calculs analytiques.
 * v3.0 : Intelligence décisionnelle, comparaison de périodes,
 *        projection fin d'année, pipeline pondéré individuel,
 *        diagnostics stratégiques automatiques, score composite.
 *
 * Architecture :
 *   ProjectUtils  →  logique bas niveau (dates, montants, statuts)
 *   Analytics     →  calculs agrégés + insights + diagnostics
 *   Charts*       →  rendu visuel uniquement
 *
 * Dépendances :
 *   - projectUtils.js (doit être chargé avant)
 *
 * ============================================================
 */

(function (global) {
  'use strict';

  /* ──────────────────────────────────────────────────────
     CONFIG GLOBALE (centralisée)
  ────────────────────────────────────────────────────── */

  /**
   * Configuration globale d'Analytics.
   * Modifiable via Analytics.config.dateField = '...'
   */
  const _config = {
    dateField: 'creation',          // champ date par défaut pour les filtres temporels
    fallbackDateField: 'date_remise_offre', // fallback si dateField absent
    activeDateField: 'Date réception',  // ← NOUVEAU : champ date actif global (sélecteur UI)
    concentrationAlertThreshold: 0.40, // % client unique déclenchant alerte concentration
    pipelineMinObjectif: 500000,    // CA pipeline minimum attendu (configurable)
    conversionAlertMin: 25,         // seuil bas taux conversion (%)
    conversionAlertHigh: 60,        // seuil haut (force)
    overdueAlertThreshold: 3,       // nb offres en retard avant alerte
  };

  /* ──────────────────────────────────────────────────────
     SYSTÈME GLOBAL DE DATE — Source unique de vérité
     Tous les graphiques, KPI, et progressions utilisent
     ces fonctions. Aucune lecture directe de 'Date réception'
     ailleurs dans le code.
  ────────────────────────────────────────────────────── */

  /** Champs date autorisés pour le sélecteur global */
  const _ALLOWED_DATE_FIELDS = [
    'Date réception',
    'Date de retour demandée',
    'Décidé le ',                              // ← espace final présent dans data.js
    'Date de démarrage VRD prévisionnelle',
    'Date de démarrage GE prévisionnelle',
    'Date de MSI prévisionnelle'
  ];

  /**
   * Changer le champ date actif (appelé par le sélecteur UI).
   * v2.0 — Impact total : tous les graphiques, KPIs, barres de progression.
   *  ① Recalcule _annee sur window.DATA
   *  ② Synchronise DataFilterEngine.setRawData()
   *  ③ Met à jour AE (AnalyticsEngine)
   *  ④ Déclenche update() global pour re-render complet
   */
  function setActiveDateField(fieldName) {
    // Accepter aussi "Décidé le" sans espace pour tolérance UI
    const normalized = fieldName === 'Décidé le' ? 'Décidé le ' : fieldName;
    if (!_ALLOWED_DATE_FIELDS.includes(normalized)) {
      console.warn('[Analytics] setActiveDateField: champ non autorisé :', fieldName);
      return;
    }
    const previous = _config.activeDateField;
    if (previous === normalized) return; // Pas de changement
    _config.activeDateField = normalized;
    console.log('[Analytics] activeDateField →', normalized, '(était :', previous, ')');

    // ① Recalculer _annee sur window.DATA (source de vérité)
    if (typeof window !== 'undefined' && Array.isArray(window.DATA)) {
      window.DATA.forEach(p => {
        p._annee = _computeAnneeFromField(p, normalized);
      });
      console.log('[Analytics] _annee recalculé pour', window.DATA.length, 'projets');
    }

    // ② Synchroniser DataFilterEngine (sans re-subscribe FilterManager)
    if (typeof DataFilterEngine !== 'undefined' && DataFilterEngine.setRawData) {
      DataFilterEngine.setRawData(window.DATA || []);
    }

    // ③ Mettre à jour AE.raw
    if (typeof AE !== 'undefined' && AE.init) {
      AE.init(window.DATA || []);
    }

    // ④ Re-render complet : KPIs + graphiques + barres objectifs
    //    Utiliser setTimeout pour laisser les moteurs se stabiliser
    setTimeout(function() {
      if (typeof update === 'function') {
        update();
      }
      if (typeof window.renderObjectiveBars === 'function') {
        window.renderObjectiveBars();
      }
      if (typeof window.StrategicKPIs !== 'undefined' && window.StrategicKPIs.render) {
        const data = (typeof AE !== 'undefined') ? AE.getFiltered() : (window.DATA || []);
        window.StrategicKPIs.render(data);
      }
      if (typeof ChartsNouveaux !== 'undefined') {
        const data = (typeof AE !== 'undefined') ? AE.getFiltered() : (window.DATA || []);
        ChartsNouveaux.renderAll(data);
      }
      // ── CORRECTION 7 : synchroniser FloatingFilterBar ───────────
      // Éviter toute désynchronisation UI lors d'un changement de champ date.
      if (typeof FloatingFilterBar !== 'undefined' && FloatingFilterBar.render) {
        FloatingFilterBar.render();
        console.log('[Analytics] FloatingFilterBar.render() déclenché après setActiveDateField');
      }
      // Notifier le changement dans l'UI
      if (typeof notify === 'function') {
        notify('Champ date actif', normalized, 'info', 2000);
      }
    }, 50);
  }

  /**
   * Extraire l'année d'un projet depuis un champ date donné.
   * @param {Object} project
   * @param {string} [field]  optionnel — utilise _config.activeDateField par défaut
   * @returns {string|null}
   */
  function _computeAnneeFromField(project, field) {
    const f = field || _config.activeDateField;
    const raw = project[f];
    if (!raw || raw === 'x' || raw === 'X') return null;
    const d = ProjectUtils.parseDate(raw);
    return d ? String(d.getFullYear()) : null;
  }

  /**
   * Obtenir la date active d'un projet (objet Date).
   * Fonction centrale — utilisée par tous les calculs temporels.
   */
  function getProjectDate(project) {
    const raw = project[_config.activeDateField];
    if (!raw || raw === 'x' || raw === 'X') return null;
    return ProjectUtils.parseDate(raw);
  }

  /**
   * Obtenir l'année active d'un projet (string ex: "2024").
   * Priorité : _annee (pré-calculé par DataFilterEngine) → recalcul live.
   */
  function getProjectYear(project) {
    // _annee est pré-calculé lors du setRawData de DataFilterEngine
    if (project._annee !== undefined && project._annee !== null
        && String(project._annee).trim() !== '') {
      return String(project._annee).trim();
    }
    return _computeAnneeFromField(project);
  }

  /**
   * CA Gagné par année (basé sur champ date actif + Bud/statut obtenu).
   * Fonction centrale pour la barre de progression annuelle.
   */
  function getCAGagneByYear(projects) {
    const map = {};
    projects.forEach(p => {
      const year = getProjectYear(p);
      if (!year) return;
      if (ProjectUtils.getStatus(p) === 'obtenu') {
        const bud = ProjectUtils.parseMontant(p['Bud']) || 0;
        map[year] = (map[year] || 0) + bud;
      }
    });
    return map;
  }

  /* ──────────────────────────────────────────────────────
     HELPERS INTERNES
  ────────────────────────────────────────────────────── */

  /**
   * Résoudre la date d'un projet — utilise le champ date actif global.
   * TOUTES les fonctions temporelles doivent passer par ici.
   */
  function _getDate(project) {
    return getProjectDate(project);
  }

  /**
   * Résoudre l'année finale d'un projet.
   * Priorité : annee_manuel > annee > date création.
   * Retourne un string (ex: "2024") ou null.
   * Le champ annee_finale (calculé) est aussi exposé via exportWithAnneefinale().
   */
  function _getAnneeFinale(project) {
    // Délègue à getProjectYear qui respecte activeDateField
    return getProjectYear(project);
  }

  /**
   * Appliquer les filtres du FilterManager si disponible,
   * sinon retourner le tableau tel quel.
   * Accepte aussi un objet legacy { zone_geo, societe, status, … }
   */
  function _applyFilters(projects, filters) {
    if (!filters || Object.keys(filters).length === 0) return projects;
    let out = projects;

    if (filters['Zone Géographique'])    out = out.filter(p => p['Zone Géographique'] === filters['Zone Géographique']);
    if (filters['Client'])     out = out.filter(p => p['Client']  === filters['Client']);
    if (filters.status)      out = out.filter(p => ProjectUtils.getStatus(p) === filters.status);
    if (filters._annee)       out = out.filter(p => String(p._annee) === String(filters._annee));
    // [CORRIGÉ v2] _annee_facturation : champ facturation absent de data.js
    // Ce filtre est désactivé — les projets n'ont pas de clé facturation/ca_facture_YYYY
    /* if (filters._annee_facturation) { ... } */
    if (filters['Type de projet (Activité)'])  out = out.filter(p => p['Type de projet (Activité)'] === filters['Type de projet (Activité)']);
    if (filters.consultation_cahors !== undefined) {
      out = out.filter(p => p.consultation_cahors === (filters.consultation_cahors ? 'Oui' : 'Non'));
    }
    if (filters.minPower) {
      out = out.filter(p => (parseFloat(p['Puissance (MWc)']) || 0) >= filters.minPower);
    }
    if (filters.minCA) {
      out = out.filter(p => (ProjectUtils.parseMontant(p['Bud']) || 0) >= filters.minCA);
    }
    return out;
  }

  /** Parse montant robuste — délègue à ProjectUtils */
  /** Lire le Bud d'un projet (toujours la source de vérité) */
  function _ca(project, mode) {
    // Toujours lire Bud — les modes historiques sont abandonnés
    const v = ProjectUtils.parseMontant(project['Bud']);
    return (v !== null && v > 0) ? v : 0;
  }

  /* ──────────────────────────────────────────────────────
     HELPERS MÉTIER CENTRALISÉS — Source unique de vérité
     Tous les graphiques/KPI utilisent ces fonctions.
     Aucune lecture directe de ca_etudie / ca_facture / facturation.
  ────────────────────────────────────────────────────── */

  /** CA Étudié = Bud brut du projet */
  function getCAEtudie(project) {
    return ProjectUtils.parseMontant(project['Bud']) || 0;
  }

  /** CA Gagné = Bud si statut obtenu, sinon 0 */
  function getCAGagne(project) {
    return ProjectUtils.getStatus(project) === 'obtenu'
      ? (ProjectUtils.parseMontant(project['Bud']) || 0)
      : 0;
  }

  /**
   * CA Win Proba — logique centralisée :
   *  obtenu → Bud
   *  offre  → Bud × Win proba (colonne data.js)
   *  perdu  → 0
   * @param {Object} project
   * @param {number} [globalRate]  fallback taux global 0–100
   */
  function getCAWinProba(project, globalRate) {
    const status = ProjectUtils.getStatus(project);
    const bud    = ProjectUtils.parseMontant(project['Bud']) || 0;
    if (status === 'obtenu') return bud;
    if (status === 'perdu')  return 0;
    // offre en cours
    const raw = project['Win proba'];
    if (raw !== null && raw !== undefined && raw !== '') {
      const n = parseFloat(String(raw).replace('%', '').trim());
      if (!isNaN(n) && n >= 0) return Math.round(bud * (n / 100));
    }
    // fallback : taux global ou conservateur
    const rate = (globalRate !== undefined && globalRate !== null) ? globalRate : 30;
    return Math.round(bud * (rate / 100));
  }

  /**
   * Top société — score composite :
   *   score = total + (obtenu × 2) + (ca_gagne / 1_000_000)
   * Retourne un tableau trié décroissant.
   */
  function topSocieteScore(projects, filters = {}, limit = 10) {
    const data = _applyFilters(projects, filters);
    const map = {};
    data.forEach(p => {
      const key = (p['Client'] || '').trim();
      if (!key) return;
      if (!map[key]) map[key] = { total: 0, obtenu: 0, ca_gagne: 0 };
      map[key].total++;
      if (ProjectUtils.getStatus(p) === 'obtenu') {
        map[key].obtenu++;
        map[key].ca_gagne += ProjectUtils.parseMontant(p['Bud']) || 0;
      }
    });
    return Object.entries(map)
      .map(([client, d]) => ({
        client,
        total:    d.total,
        obtenu:   d.obtenu,
        ca_gagne: d.ca_gagne,
        score:    d.total + (d.obtenu * 2) + (d.ca_gagne / 1_000_000)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /* ──────────────────────────────────────────────────────
     1. STATISTIQUES DE BASE
  ────────────────────────────────────────────────────── */

  /**
   * Compter les projets par statut.
   * @returns {{ total, obtenu, perdu, offre, autre }}
   */
  function countByStatus(projects, filters = {}) {
    const data = _applyFilters(projects, filters);
    const counts = { total: data.length, obtenu: 0, perdu: 0, offre: 0, autre: 0 };
    data.forEach(p => {
      const s = ProjectUtils.getStatus(p);
      if (counts.hasOwnProperty(s)) counts[s]++; else counts.autre++;
    });
    return counts;
  }

  /**
   * Taux de conversion : obtenu / (obtenu + perdu) × 100.
   * @returns {number|null}  null si pas de données décidées
   */
  function conversionRate(projects, filters = {}) {
    const c = countByStatus(projects, filters);
    const decided = c.obtenu + c.perdu;
    return decided > 0 ? Math.round((c.obtenu / decided) * 100) : null;
  }

  /* ──────────────────────────────────────────────────────
     2. CA & MONTANTS
  ────────────────────────────────────────────────────── */

  /**
   * CA total selon le mode et le statut optionnel.
   * @param {string} caMode        'Bud' | 'Bud'
   * @param {string} [statusFilter] 'obtenu'|'perdu'|'offre'|null
   *                               ⚠️ Quand caMode === 'Bud', statusFilter est
   *                               TOUJOURS forcé à 'obtenu' : seul le CA des projets
   *                               obtenus est pris en compte (barre objectif incluse).
   */
  function totalCA(projects, filters = {}, caMode = 'Bud', statusFilter = null, opts = {}) {
    let data = _applyFilters(projects, filters);
    // Force filtre statut=obtenu pour ca_gagne — aucun autre statut ne doit contribuer
    const effectiveStatus = caMode === 'Bud' ? 'obtenu' : statusFilter;
    if (effectiveStatus) data = data.filter(p => ProjectUtils.getStatus(p) === effectiveStatus);
    return data.reduce((sum, p) => sum + _ca(p, caMode), 0);
  }

  /**
   * CA par statut (obtenu / perdu / offre).
   * @returns {{ obtenu, perdu, offre }}
   */
  function caByStatus(projects, filters = {}, caMode = 'Bud') {
    const data = _applyFilters(projects, filters);
    const result = { obtenu: 0, perdu: 0, offre: 0 };
    data.forEach(p => {
      const s = ProjectUtils.getStatus(p);
      if (result.hasOwnProperty(s)) result[s] += _ca(p, caMode);
    });
    return result;
  }

  /**
   * CA par société — top N.
   * @returns {{ [societe]: number }}
   */
  function caByClient(projects, filters = {}, caMode = 'Bud', limit = 8) {
    const data = _applyFilters(projects, filters);
    const map = {};
    data.forEach(p => {
      const key = (p['Client'] || 'Non spécifié').trim();
      map[key] = (map[key] || 0) + _ca(p, caMode);
    });
    return Object.fromEntries(
      Object.entries(map)
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
    );
  }

  /**
   * CA par zone géographique.
   * @returns {{ [zone]: number }}
   */
  function caByZone(projects, filters = {}, caMode = 'Bud') {
    const data = _applyFilters(projects, filters);
    const map = {};
    data.forEach(p => {
      const key = (p['Zone Géographique'] || 'Non défini').trim();
      map[key] = (map[key] || 0) + _ca(p, caMode);
    });
    return map;
  }

  /**
   * CA par année (pour graphique linéaire comparatif).
   * Utilise annee_manuel en priorité, sinon annee, sinon date création.
   * @returns {{ [annee]: { etudie: number, gagne: number, count: number } }}
   */
  function caByYear(projects, filters = {}) {
    const data = _applyFilters(projects, filters);
    const map = {};

    data.forEach(p => {
      // Priorité : annee_manuel > annee > creation (via _getAnneeFinale)
      const year = _getAnneeFinale(p);
      if (!year) return;

      if (!map[year]) map[year] = { etudie: 0, gagne: 0, count: 0 };
      map[year].etudie += _ca(p, 'Bud');
      // Pour gagne : uniquement les projets OBTENUS
      if (ProjectUtils.getStatus(p) === 'obtenu') {
        map[year].gagne += _ca(p, 'Bud');
      }
      map[year].count++;
    });

    // Trier par année
    return Object.fromEntries(
      Object.entries(map).sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
    );
  }

  /* ──────────────────────────────────────────────────────
     CA PAR ANNÉE — 3 MODES + DELTA — v8.0
     ─────────────────────────────────────────────────────
     Source unique pour createCAByYearChart().
     Retourne toutes les années connues (union année
     commerciale + années fiscales de facturation) avec
     les trois agrégats indépendants :
       • etudie  → année commerciale (_getAnneeFinale)
       • gagne   → année commerciale, projets obtenu
       • facture → année FISCALE (clé facturation[yr])
     Ainsi qu'un delta % vs N-1 pour chaque série.
  ────────────────────────────────────────────────────── */

  /**
   * Agrège les 3 modes CA par année en un seul passage.
   *
   * @param  {Array}  projects
   * @param  {Object} filters   filtres AE standards
   * @returns {Array<{
   *   year:           string,
   *   etudie:         number,
   *   gagne:          number,
   *   facture:        number,
   *   countAll:       number,
   *   countObtenu:    number,
   *   deltaEtudie:    number|null,
   *   deltaGagne:     number|null,
   *   deltaFacture:   number|null,
   *   tauxRealisation:number|null,
   * }>}
   */
/**
 * CA PAR ANNÉE — 3 MODES + DELTA — v8.1 (corrigé)
 * 
 * CORRECTION : Filtrage des années vides (0 projets)
 * Évite l'affichage de lignes vides dans les graphiques
 */
function caByYearAllModes(projects, filters = {}) {
  const data = _applyFilters(projects, filters);

  // ── Série 1 & 2 : étudié + gagné indexés sur année commerciale ──
  const mapComm = {};
  data.forEach(p => {
    const year = _getAnneeFinale(p);
    if (!year) return;
    if (!mapComm[year]) mapComm[year] = { etudie: 0, gagne: 0, countAll: 0, countObtenu: 0 };
    mapComm[year].etudie  += _ca(p, 'Bud');
    mapComm[year].countAll++;
    if (ProjectUtils.getStatus(p) === 'obtenu') {
      mapComm[year].gagne += _ca(p, 'Bud');
      mapComm[year].countObtenu++;
    }
  });

  // ── Série 3 : facturé (non disponible dans les données actuelles) ──
  const mapFact = {};

  // ── Union de toutes les années connues, triée asc ──
  const allYears = [
    ...new Set([...Object.keys(mapComm)])
  ].sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

  // ✅ CORRECTION : Filtrer les années vides (countAll === 0)
  const validYears = allYears.filter(year => 
    mapComm[year] && mapComm[year].countAll > 0
  );

  if (validYears.length === 0) {
    console.warn('[Analytics] caByYearAllModes : aucune année avec des projets');
    return [];
  }

  // ── Construction des lignes + dérivées ──
  const rows = validYears.map(year => ({
    year,
    etudie:          mapComm[year] ? mapComm[year].etudie      : 0,
    gagne:           mapComm[year] ? mapComm[year].gagne       : 0,
    facture:         mapFact[year] || 0,
    countAll:        mapComm[year] ? mapComm[year].countAll    : 0,
    countObtenu:     mapComm[year] ? mapComm[year].countObtenu : 0,
    deltaEtudie:     null,
    deltaGagne:      null,
    deltaFacture:    null,
    tauxRealisation: null,
  }));

  rows.forEach((row, i) => {
    row.tauxRealisation = row.etudie > 0
      ? Math.round((row.gagne / row.etudie) * 100)
      : null;
    if (i > 0) {
      const prev = rows[i - 1];
      const pct  = (a, b) => b > 0 ? Math.round(((a - b) / b) * 100) : null;
      row.deltaEtudie  = pct(row.etudie,  prev.etudie);
      row.deltaGagne   = pct(row.gagne,   prev.gagne);
      row.deltaFacture = pct(row.facture, prev.facture);
    }
  });

  console.log(`[Analytics] caByYearAllModes : ${rows.length} années valides`);
  return rows;
}

  /**
   * CA moyen des projets obtenus.
   * @returns {number}
   */
  function avgCAWon(projects, filters = {}, caMode = 'Bud') {
    const data = _applyFilters(projects, filters);
    const won = data.filter(p => ProjectUtils.getStatus(p) === 'obtenu');
    if (won.length === 0) return 0;
    const total = won.reduce((s, p) => s + _ca(p, caMode), 0);
    return Math.round(total / won.length);
  }

  /**
   * CA pipeline prévisionnel = CA offres en cours × taux de conversion.
   */
  function pipelineCA(projects, filters = {}, caMode = 'Bud') {
    const data = _applyFilters(projects, filters);
    const rate = conversionRate(data) / 100 || 0;
    const offers = data.filter(p => ProjectUtils.getStatus(p) === 'offre');
    const totalOffersCA = offers.reduce((s, p) => s + _ca(p, caMode), 0);
    return Math.round(totalOffersCA * rate);
  }

  /* ──────────────────────────────────────────────────────
     3. DISTRIBUTION ET COMPTAGE
  ────────────────────────────────────────────────────── */

  /**
   * Projets par statut par société — pour funnel.
   * @returns {{ [societe]: { obtenu, perdu, offre, total } }}
   */
  function countByClientStatus(projects, filters = {}) {
    const data = _applyFilters(projects, filters);
    const map = {};
    data.forEach(p => {
      const key = (p['Client'] || 'Non spécifié').trim();
      if (!map[key]) map[key] = { obtenu: 0, perdu: 0, offre: 0, total: 0 };
      const s = ProjectUtils.getStatus(p);
      if (map[key].hasOwnProperty(s)) map[key][s]++;
      map[key].total++;
    });
    return map;
  }

  /**
   * Projets obtenus par zone.
   * @returns {{ [zone]: number }}
   */
  function wonByZone(projects, filters = {}) {
    const data = _applyFilters(projects, filters);
    const map = {};
    data
      .filter(p => ProjectUtils.getStatus(p) === 'obtenu')
      .forEach(p => {
        const key = (p['Zone Géographique'] || 'Non défini').trim();
        map[key] = (map[key] || 0) + 1;
      });
    return map;
  }

  /**
   * Projets perdus par société — top N.
   * @returns {Array<[string, number]>}
   */
  function lostByClient(projects, filters = {}, limit = 10) {
    const data = _applyFilters(projects, filters);
    const map = {};
    data
      .filter(p => ProjectUtils.getStatus(p) === 'perdu')
      .forEach(p => {
        const key = (p['Client'] || 'Non spécifié').trim();
        map[key] = (map[key] || 0) + 1;
      });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);
  }

  /**
   * Projets obtenus par société — top N.
   * @returns {Array<[string, number]>}
   */
  function wonByClient(projects, filters = {}, limit = 10) {
    const data = _applyFilters(projects, filters);
    const map = {};
    data
      .filter(p => ProjectUtils.getStatus(p) === 'obtenu')
      .forEach(p => {
        const key = (p['Client'] || 'Non spécifié').trim();
        map[key] = (map[key] || 0) + 1;
      });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);
  }

  /**
   * Distribution par type d'offre.
   * @returns {{ [type]: number }}
   */
  function countByOfferType(projects, filters = {}) {
    const data = _applyFilters(projects, filters);
    const map = {};
    data.forEach(p => {
      const key = (p['Type de projet (Activité)'] || 'Non spécifié').trim();
      map[key] = (map[key] || 0) + 1;
    });
    return map;
  }

  /**
   * Distribution par partenaire GC.
   * @returns {{ [partner]: number }}
   */
  function countByPartner(projects, filters = {}) {
    const data = _applyFilters(projects, filters);
    const map = {};
    data.forEach(p => {
      if (!p.partenaire_gc) return;
      const key = p.partenaire_gc.trim();
      map[key] = (map[key] || 0) + 1;
    });
    return map;
  }

  /* ──────────────────────────────────────────────────────
     4. TAUX DE CONVERSION
  ────────────────────────────────────────────────────── */

  /**
   * Taux de conversion par client (pour chart scatter/bar).
   * @returns {{ [societe]: { won, lost, offers, winRate, totalDecided } }}
   */
  function winRateByClient(projects, filters = {}, minDecided = 1) {
    const data = _applyFilters(projects, filters);
    const map = {};

    data.forEach(p => {
      const key = (p['Client'] || 'Non spécifié').trim();
      const s = ProjectUtils.getStatus(p);
      if (!map[key]) map[key] = { won: 0, lost: 0, offers: 0 };
      if (s === 'obtenu') map[key].won++;
      else if (s === 'perdu') map[key].lost++;
      else if (s === 'offre') map[key].offers++;
    });

    const result = {};
    for (const [client, stats] of Object.entries(map)) {
      const decided = stats.won + stats.lost;
      if (decided < minDecided) continue;
      result[client] = {
        ...stats,
        totalDecided: decided,
        winRate: decided > 0 ? Math.round((stats.won / decided) * 100) : 0
      };
    }
    return result;
  }

  /**
   * Taux de conversion par zone géographique.
   * @returns {{ [zone]: { won, lost, winRate } }}
   */
  function winRateByZone(projects, filters = {}) {
    const data = _applyFilters(projects, filters);
    const map = {};
    data.forEach(p => {
      const key = (p['Zone Géographique'] || 'Non défini').trim();
      const s = ProjectUtils.getStatus(p);
      if (!map[key]) map[key] = { won: 0, lost: 0 };
      if (s === 'obtenu') map[key].won++;
      else if (s === 'perdu') map[key].lost++;
    });
    for (const zone of Object.keys(map)) {
      const { won, lost } = map[zone];
      const decided = won + lost;
      map[zone].winRate = decided > 0 ? Math.round((won / decided) * 100) : 0;
      map[zone].totalDecided = decided;
    }
    return map;
  }

  /* ──────────────────────────────────────────────────────
     5. DÉLAIS ET TEMPOREL
  ────────────────────────────────────────────────────── */

  /**
   * Délai moyen par statut (en jours) entre création et échéance.
   * @returns {{ obtenu: number|null, perdu: number|null, offre: number|null }}
   */
  function avgDelayByStatus(projects, filters = {}) {
    const data = _applyFilters(projects, filters);
    const buckets = { obtenu: [], perdu: [], offre: [] };

    data.forEach(p => {
      const s = ProjectUtils.getStatus(p);
      if (!buckets.hasOwnProperty(s)) return;
      const start = ProjectUtils.parseDate(p['Date réception']);
      const end   = ProjectUtils.parseDate(p['Date de retour demandée']);
      if (!start || !end) return;
      const days = Math.max(0, Math.round((end - start) / 86400000));
      if (days > 0 && days < 1000) buckets[s].push(days); // sanity check
    });

    const avg = {};
    for (const [s, arr] of Object.entries(buckets)) {
      avg[s] = arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
    }
    return avg;
  }

  /**
   * Temps moyen de décision (création → échéance pour obtenu/perdu).
   * @returns {number|null}  jours
   */
  function avgDecisionTime(projects, filters = {}) {
    const data = _applyFilters(projects, filters);
    const decided = data.filter(p => {
      const s = ProjectUtils.getStatus(p);
      return (s === 'obtenu' || s === 'perdu') && p['Date réception'] && p['Date de retour demandée'];
    });
    if (decided.length === 0) return null;
    const totalDays = decided.reduce((sum, p) => {
      const start = ProjectUtils.parseDate(p['Date réception']);
      const end = ProjectUtils.parseDate(p['Date de retour demandée']);
      if (!start || !end) return sum;
      const days = Math.max(0, (end - start) / 86400000);
      return sum + days;
    }, 0);
    return Math.round(totalDays / decided.length);
  }

  /**
   * Projets en retard (offres dépassées).
   * @returns {Array}
   */
  function overdueOffers(projects, filters = {}) {
    const data = _applyFilters(projects, filters);
    return data.filter(p => ProjectUtils.isOverdue(p));
  }

  /**
   * Offres urgentes (échéance ≤ 7 jours).
   * @returns {Array}
   */
  function urgentOffers(projects, filters = {}) {
    const data = _applyFilters(projects, filters);
    return data.filter(p => ProjectUtils.isUrgent(p));
  }

  /* ──────────────────────────────────────────────────────
     6. PUISSANCE ET MACHINES
  ────────────────────────────────────────────────────── */

  /**
   * Puissance moyenne des projets obtenus.
   * @returns {number}
   */
  function avgPowerWon(projects, filters = {}) {
    const data = _applyFilters(projects, filters);
    const won = data.filter(p =>
      ProjectUtils.getStatus(p) === 'obtenu' && parseFloat(p['Puissance (MWc)']) > 0
    );
    if (won.length === 0) return 0;
    return won.reduce((s, p) => s + (parseFloat(p['Puissance (MWc)']) || 0), 0) / won.length;
  }

  /**
   * Total des machines.
   * @returns {number}
   */
  function totalMachines(projects, filters = {}) {
    const data = _applyFilters(projects, filters);
    return data.reduce((s, p) => s + (parseInt(0, 10) || 0), 0);
  }

  /**
   * Données scatter : Puissance MW vs CA pour graphique bubble/scatter.
   * @returns {Array<{ x, y, r, label, status }>}
   */
  function scatterPowerVsCA(projects, filters = {}, caMode = 'Bud') {
    const data = _applyFilters(projects, filters);
    return data
      .map(p => {
        const power = parseFloat(p['Puissance (MWc)']);
        const ca    = _ca(p, caMode);
        if (!power || !ca) return null;
        return {
          x:      parseFloat(power.toFixed(2)),
          y:      Math.round(ca),
          r:      Math.min(20, Math.max(4, Math.sqrt(ca / 50000))),
          label:  (p['Client'] || 'N/A').trim() || 'N/A',
          status: ProjectUtils.getStatus(p),
          projet: (p.projet || p['Projet'] || p['Nom Projet'] || '').trim()
        };
      })
      .filter(Boolean);
  }

  /* ──────────────────────────────────────────────────────
     7. FUNNEL COMMERCIAL
  ────────────────────────────────────────────────────── */

  /**
   * Données pour le funnel commercial.
   * @returns {{ stages: Array<{label, count, ca, color}>, conversionRate }}
   */
  function commercialFunnel(projects, filters = {}, caMode = 'Bud') {
    const data = _applyFilters(projects, filters);
    const total = data.length;
    const offers = data.filter(p => ProjectUtils.getStatus(p) === 'offre');
    const deposees = offers.filter(p => p.depose_remise_offre === 'Oui');
    const won = data.filter(p => ProjectUtils.getStatus(p) === 'obtenu');
    const lost = data.filter(p => ProjectUtils.getStatus(p) === 'perdu');

    const stages = [
      {
        label: 'Consultations reçues',
        count: total,
        ca: data.reduce((s, p) => s + _ca(p, caMode), 0),
        color: '#0099ff'
      },
      {
        label: 'Offres en cours',
        count: offers.length,
        ca: offers.reduce((s, p) => s + _ca(p, caMode), 0),
        color: '#8b78f8'
      },
      {
        label: 'Offres déposées',
        count: deposees.length,
        ca: deposees.reduce((s, p) => s + _ca(p, caMode), 0),
        color: '#f5b740'
      },
      {
        label: 'Projets obtenus',
        count: won.length,
        ca: won.reduce((s, p) => s + _ca(p, 'Bud'), 0),
        color: '#00d4aa'
      }
    ];

    return {
      stages,
      conversionRate: conversionRate(data),
      responseRate: offers.length > 0 ? Math.round((deposees.length / offers.length) * 100) : 0,
      winFromDeposees: deposees.length > 0 ? Math.round((won.length / deposees.length) * 100) : 0
    };
  }

  /* ──────────────────────────────────────────────────────
     8. TOP CLIENT ACTIF
  ────────────────────────────────────────────────────── */

  /**
   * Client avec le plus d'offres actives.
   * @returns {{ client: string, count: number }|null}
   */
  function topActiveClient(projects, filters = {}) {
    const data = _applyFilters(projects, filters);
    const offers = data.filter(p => ProjectUtils.getStatus(p) === 'offre');
    const map = {};
    offers.forEach(p => {
      const key = (p['Client'] || '').trim();
      if (key) map[key] = (map[key] || 0) + 1;
    });
    const entries = Object.entries(map).sort((a, b) => b[1] - a[1]);
    return entries.length > 0 ? { client: entries[0][0], count: entries[0][1] } : null;
  }

  /**
   * Taux de réponse = offres déposées / total offres.
   * @returns {number}  0–100
   */
  function responseRate(projects, filters = {}) {
    const data = _applyFilters(projects, filters);
    const offers = data.filter(p => ProjectUtils.getStatus(p) === 'offre');
    if (offers.length === 0) return 0;
    const deposees = offers.filter(p => p.depose_remise_offre === 'Oui').length;
    return Math.round((deposees / offers.length) * 100);
  }

  /* ──────────────────────────────────────────────────────
     9. KPIs COMPLETS (all-in-one pour updateStats)
  ────────────────────────────────────────────────────── */

  /**
   * Calculer TOUS les KPIs en un seul appel.
   * C'est la fonction principale que updateStats() doit appeler.
   *
   * @param {Array}  projects  tableau des projets (déjà filtrés par l'app)
   * @param {Object} filters   filtres supplémentaires optionnels
   * @param {string} caMode    'Bud' | 'Bud'
   * @returns {Object}         tous les KPIs
   */
  function computeAllKPIs(projects, filters = {}, caMode = 'Bud') {
    const data = _applyFilters(projects, filters);

    const statusCounts = countByStatus(data);
    const rate = conversionRate(data);

    const won    = data.filter(p => ProjectUtils.getStatus(p) === 'obtenu');
    const lost   = data.filter(p => ProjectUtils.getStatus(p) === 'perdu');
    const offers = data.filter(p => ProjectUtils.getStatus(p) === 'offre');

    // CA
    const caWon   = won.reduce((s, p) => s + _ca(p, caMode), 0);
    const caTotal = data.reduce((s, p) => s + _ca(p, caMode), 0);
    const caAvg   = won.length > 0 ? Math.round(caWon / won.length) : 0;

    // Pipeline
    const offersCA = offers.reduce((s, p) => s + _ca(p, 'Bud'), 0);
    const pipeline = rate !== null ? Math.round(offersCA * (rate / 100)) : 0;

    // Top client actif
    const topClient = topActiveClient(data);

    // Délai moyen décision
    const decisionTime = avgDecisionTime(data);

    // Délai moyen création→échéance (tous projets)
    const delayProjects = data.filter(p => p['Date réception'] && p['Date de retour demandée']);
    let avgDelay = null;
    if (delayProjects.length > 0) {
      const totalDays = delayProjects.reduce((s, p) => {
        const start = ProjectUtils.parseDate(p['Date réception']);
        const end = ProjectUtils.parseDate(p['Date de retour demandée']);
        if (!start || !end) return s;
        const days = Math.max(0, (end - start) / 86400000);
        return s + days;
      }, 0);
      avgDelay = Math.round(totalDays / delayProjects.length);
    }

    // Puissance moyenne
    const wonWithPower = won.filter(p => parseFloat(p['Puissance (MWc)']) > 0);
    const avgPower = wonWithPower.length > 0
      ? (wonWithPower.reduce((s, p) => s + (parseFloat(p['Puissance (MWc)']) || 0), 0) / wonWithPower.length).toFixed(1)
      : null;

    // Machines
    const machines = totalMachines(data);

    // Taux de réponse
    const respRate = responseRate(data);

    // Projets en retard
    const overdue = overdueOffers(data);

    return {
      // Comptes
      total:   statusCounts.total,
      obtenu:  statusCounts.obtenu,
      perdu:   statusCounts.perdu,
      offre:   statusCounts.offre,
      autre:   statusCounts.autre,

      // Taux
      tauxConversion: rate,
      tauxReponse:    respRate,

      // CA
      caTotal,
      caObtenu:   caWon,
      caAvg,
      caPipeline: pipeline,

      // Pipeline
      topClient,
      decisionTime,
      avgDelay,
      avgPower,
      totalMachines: machines,

      // Offres critiques
      overdueCount:  overdue.length,
      overdueOffers: overdue,
      urgentCount:   urgentOffers(data).length,
    };
  }

  /* ──────────────────────────────────────────────────────
     10. AnalyticsInsights — Génération automatique de textes
  ────────────────────────────────────────────────────── */

  const AnalyticsInsights = {

    /**
     * Générer un résumé automatique textuel pour un graphique.
     * @param {string} chartType  identifiant du graphique
     * @param {Array}  projects   données filtrées
     * @param {string} caMode
     * @returns {string}  HTML du résumé
     */
    summaryFor(chartType, projects, caMode = 'Bud') {
      try {
        const generators = {
          'funnel':           () => this._summaryFunnel(projects),
          'status':           () => this._summaryStatus(projects),
          'ca-year':          () => this._summaryCAYear(projects, caMode),
          'ca-client':        () => this._summaryCAClient(projects, caMode),
          'ca-zone':          () => this._summaryCAZone(projects, caMode),
          'win-rate':         () => this._summaryWinRate(projects),
          'scatter-power-ca': () => this._summaryScatter(projects, caMode),
          'delay-status':     () => this._summaryDelayStatus(projects),
          'perdu':            () => this._summaryPerdu(projects),
          'obtenu':           () => this._summaryObtenu(projects),
        };
        const gen = generators[chartType];
        return gen ? gen() : '';
      } catch (e) {
        return '';
      }
    },

    /** Analyse des tendances multi-périodes. */
    trendAnalysis(projects) {
      const byYear = caByYear(projects);
      const years = Object.keys(byYear).sort();
      if (years.length < 2) return null;

      const lastYear  = byYear[years[years.length - 1]];
      const prevYear  = byYear[years[years.length - 2]];
      const gainDelta = lastYear.gagne - prevYear.gagne;
      const etudDelta = lastYear.etudie - prevYear.etudie;

      const pct = (delta, base) =>
        base > 0 ? `${delta >= 0 ? '+' : ''}${Math.round((delta / base) * 100)}%` : 'N/A';

      return {
        caGagneTrend:  pct(gainDelta, prevYear.gagne),
        caEtudieTrend: pct(etudDelta, prevYear.etudie),
        direction:     gainDelta >= 0 ? 'hausse' : 'baisse',
        years:         { last: years[years.length - 1], prev: years[years.length - 2] }
      };
    },

    /** Détection automatique d'anomalies. */
    detectAnomalies(projects) {
      const anomalies = [];
      const kpis = computeAllKPIs(projects);

      // Trop d'offres en retard
      if (kpis.overdueCount > 3) {
        anomalies.push({
          type:     'warning',
          title:    'Offres en retard',
          message:  `${kpis.overdueCount} offre${kpis.overdueCount > 1 ? 's' : ''} dépassée${kpis.overdueCount > 1 ? 's' : ''} — action requise`,
          icon:     '⚠️'
        });
      }

      // Faible taux de conversion
      if (kpis.tauxConversion !== null && kpis.tauxConversion < 25) {
        anomalies.push({
          type:     'alert',
          title:    'Faible conversion',
          message:  `Taux de conversion de ${kpis.tauxConversion}% — en dessous du seuil recommandé (25%)`,
          icon:     '📉'
        });
      }

      // Faible taux de réponse
      if (kpis.tauxReponse < 50 && kpis.offre > 5) {
        anomalies.push({
          type:     'warning',
          title:    'Taux de réponse faible',
          message:  `Seulement ${kpis.tauxReponse}% des offres déposées`,
          icon:     '📮'
        });
      }

      // Concentration client (risque)
      const winRates = winRateByClient(projects);
      const topClients = Object.entries(winRates)
        .sort((a, b) => b[1].totalDecided - a[1].totalDecided)
        .slice(0, 3);
      const topTotal = topClients.reduce((s, [, v]) => s + v.totalDecided, 0);
      const grandTotal = Object.values(winRates).reduce((s, v) => s + v.totalDecided, 0);
      if (grandTotal > 0 && topTotal / grandTotal > 0.6) {
        anomalies.push({
          type:     'info',
          title:    'Concentration clients',
          message:  `Top 3 clients = ${Math.round((topTotal / grandTotal) * 100)}% des projets décidés — diversification conseillée`,
          icon:     '🏦'
        });
      }

      return anomalies;
    },

    /** Indicateurs de performance clés (pour dashboard top). */
    healthScore(projects) {
      const kpis = computeAllKPIs(projects);
      let score = 100;
      const issues = [];

      if (kpis.tauxConversion !== null) {
        if (kpis.tauxConversion < 20)       { score -= 20; issues.push('conv_very_low'); }
        else if (kpis.tauxConversion < 35)  { score -= 10; issues.push('conv_low'); }
      }
      if (kpis.overdueCount > 0)            { score -= Math.min(15, kpis.overdueCount * 3); }
      if (kpis.tauxReponse < 50)            { score -= 10; issues.push('response_low'); }
      if (kpis.offre === 0)                 { score -= 15; issues.push('no_pipeline'); }

      score = Math.max(0, Math.min(100, score));

      let label, color;
      if (score >= 75)       { label = 'Excellente'; color = '#00d4aa'; }
      else if (score >= 50)  { label = 'Bonne';      color = '#10b981'; }
      else if (score >= 30)  { label = 'À surveiller'; color = '#f5b740'; }
      else                   { label = 'Critique';   color = '#ff4d6d'; }

      return { score, label, color, issues };
    },

    // ── Générateurs privés ──

    _summaryFunnel(projects) {
      const f = commercialFunnel(projects);
      return `${f.stages[0].count} consultations → ${f.conversionRate ?? '?'}% de conversion`;
    },

    _summaryStatus(projects) {
      const c = countByStatus(projects);
      const r = conversionRate(projects);
      return `${c.total} projets — ${c.obtenu} obtenus, ${c.offre} en cours${r !== null ? ` (conv. ${r}%)` : ''}`;
    },

    _summaryCAYear(projects, caMode) {
      try {
        const rows = caByYearAllModes(projects);
        if (rows.length < 2) return 'Données insuffisantes pour analyser les tendances.';

        const last = rows[rows.length - 1];
        const prev = rows[rows.length - 2];

        // Choisir la série pertinente selon le mode actif
        const mode = caMode || 'Bud';
        let delta, valLabel, serieLabel;
        if (mode === 'Bud') {
          delta      = last.deltaGagne;
          valLabel   = ProjectUtils.formatMontant(last.gagne, true);
          serieLabel = 'CA gagné';
        } else {
          delta      = last.deltaEtudie;
          valLabel   = ProjectUtils.formatMontant(last.etudie, true);
          serieLabel = 'CA étudié';
        }

        const sign  = delta !== null && delta >= 0 ? '+' : '';
        const color = delta !== null && delta >= 0 ? '#00d4aa' : '#ff4d6d';
        const trend = delta !== null
          ? ` — <strong style="color:${color}">${sign}${delta}%</strong> vs ${prev.year}`
          : '';

        return `${serieLabel} ${last.year} : <strong>${valLabel}</strong>${trend}`;
      } catch (e) {
        return '';
      }
    },

    _summaryCAClient(projects, caMode) {
      const top = Object.entries(caByClient(projects, {}, caMode, 3));
      if (!top.length) return '';
      return `Top client : <strong>${top[0][0]}</strong> — ${ProjectUtils.formatMontant(top[0][1], true)}`;
    },

    _summaryCAZone(projects, caMode) {
      const zones = caByZone(projects, {}, caMode);
      const top = Object.entries(zones).sort((a, b) => b[1] - a[1])[0];
      if (!top) return '';
      return `Zone leader : <strong>${top[0]}</strong> — ${ProjectUtils.formatMontant(top[1], true)}`;
    },

    _summaryWinRate(projects) {
      const wr = winRateByClient(projects, {}, 3);
      const best = Object.entries(wr)
        .filter(([, v]) => v.totalDecided >= 3)
        .sort((a, b) => b[1].winRate - a[1].winRate)[0];
      if (!best) return 'Au moins 3 projets décidés requis pour comparaison.';
      return `Meilleur taux : <strong>${best[0]}</strong> — ${best[1].winRate}%`;
    },

    _summaryScatter(projects, caMode) {
      const pts = scatterPowerVsCA(projects, {}, caMode);
      if (!pts.length) return 'Aucune donnée puissance/CA disponible.';
      const maxCA = pts.reduce((a, b) => a.y > b.y ? a : b);
      return `Projet à plus fort CA : <strong>${maxCA.label}</strong> — ${ProjectUtils.formatMontant(maxCA.y, true)}`;
    },

    _summaryDelayStatus(projects) {
      const delays = avgDelayByStatus(projects);
      const parts = [];
      if (delays.obtenu) parts.push(`Obtenu: ${delays.obtenu}j`);
      if (delays.perdu)  parts.push(`Perdu: ${delays.perdu}j`);
      if (delays.offre)  parts.push(`Offre: ${delays.offre}j`);
      return parts.length ? `Délais moyens — ${parts.join(' · ')}` : '';
    },

    _summaryPerdu(projects) {
      const data = lostByClient(projects, {}, 1);
      if (!data.length) return 'Aucun projet perdu.';
      return `${data.reduce((s, [, n]) => s + n, 0)} projets perdus — <strong>${data[0][0]}</strong> en tête`;
    },

    _summaryObtenu(projects) {
      const data = wonByClient(projects, {}, 1);
      if (!data.length) return 'Aucun projet obtenu.';
      return `${data.reduce((s, [, n]) => s + n, 0)} projets obtenus — top client : <strong>${data[0][0]}</strong>`;
    },

    // ── Nouveaux générateurs ──
    summaryCAMonth(projects) {
      const insight = autoInsights(projects);
      const parts = [];
      if (insight.trend) parts.push(`${insight.trend.icon} ${insight.trend.label}`);
      if (insight.peakMonth) parts.push(`Pic exceptionnel en <strong>${insight.peakMonth.label}</strong>`);
      if (insight.recordMonth) parts.push(`Mois record : <strong>${insight.recordMonth.label}</strong> — ${ProjectUtils.formatMontant(insight.recordMonth.etudie, true)}`);
      return parts.slice(0, 2).join(' · ');
    },

    summaryPipelineStage(projects) {
      const st = pipelineByStage(projects);
      const total = st.chaud + st.tiede + st.froid;
      if (!total) return 'Aucune offre en cours.';
      return `🔥 ${st.chaud} offre${st.chaud > 1 ? 's' : ''} chaude${st.chaud > 1 ? 's' : ''} (>70%) · ${total} offres actives au total`;
    },

    summaryHistogram(projects) {
      const hist = caHistogram(projects);
      const best = hist.reduce((a, b) => a.total > b.total ? a : b);
      if (!best.total) return '';
      const winPct = best.total > 0 ? Math.round((best.obtenu / best.total) * 100) : 0;
      return `Tranche dominante : <strong>${best.label}</strong> — ${best.total} projet${best.total > 1 ? 's' : ''} · ${winPct}% convertis`;
    },

    summaryAutoInsights(projects) {
      const insight = autoInsights(projects);
      const parts = [];
      if (insight.bestClient) parts.push(`🏆 Top client : <strong>${insight.bestClient[0]}</strong> — ${ProjectUtils.formatMontant(insight.bestClient[1], true)}`);
      if (insight.bestZone)   parts.push(`🌍 Zone leader : <strong>${insight.bestZone[0]}</strong>`);
      return parts.join(' · ');
    }

  };

  /* ──────────────────────────────────────────────────────
     11. NOUVEAUX CALCULS — Graphiques avancés
  ────────────────────────────────────────────────────── */

  /**
   * CA mensuel (étudié + gagné) avec variation mois/mois.
   * Utilise date_remise_offre ou creation.
   * @returns {Array<{ month, label, etudie, gagne, countEtudie, countGagne, varEtudie, varGagne }>}
   */
  function caByMonth(projects, filters = {}) {
    const data = _applyFilters(projects, filters);
    const map = {};

    data.forEach(p => {
      const raw = p['Date réception'] || p['Date réception'];
      if (!raw) return;
      const d = ProjectUtils.parseDate(raw);
      if (!d) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!map[key]) map[key] = { etudie: 0, gagne: 0, countEtudie: 0, countGagne: 0 };
      map[key].etudie += _ca(p, 'Bud');
      map[key].countEtudie++;
      const st = ProjectUtils.getStatus(p);
      if (st === 'obtenu') {
        map[key].gagne += _ca(p, 'Bud');
        map[key].countGagne++;
      }
    });

    const sorted = Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));

    return sorted.map(([key, vals], i) => {
      const [year, month] = key.split('-');
      const monthNames = ['Jan','Fév','Mar','Avr','Mai','Jui','Jul','Aoû','Sep','Oct','Nov','Déc'];
      const prev = i > 0 ? sorted[i - 1][1] : null;
      const varEtudie = prev && prev.etudie > 0
        ? Math.round(((vals.etudie - prev.etudie) / prev.etudie) * 100)
        : null;
      const varGagne = prev && prev.gagne > 0
        ? Math.round(((vals.gagne - prev.gagne) / prev.gagne) * 100)
        : null;
      return {
        month: key,
        label: `${monthNames[parseInt(month, 10) - 1]} ${year}`,
        shortLabel: monthNames[parseInt(month, 10) - 1],
        year,
        ...vals,
        varEtudie,
        varGagne
      };
    });
  }

  /**
   * Histogramme des montants par tranche de CA.
   * Tranches : <200k / 200k-400k / 400k-600k / 600k+
   * @returns {Array<{ label, obtenu, perdu, offre, total }>}
   */
  function caHistogram(projects, filters = {}) {
    const data = _applyFilters(projects, filters);
    const tranches = [
      { label: '< 200k€',     min: 0,      max: 200000  },
      { label: '200–400k€',  min: 200000, max: 400000  },
      { label: '400–600k€',  min: 400000, max: 600000  },
      { label: '600k€+',     min: 600000, max: Infinity }
    ];

    const result = tranches.map(t => ({ ...t, obtenu: 0, perdu: 0, offre: 0, total: 0 }));

    data.forEach(p => {
      const ca = _ca(p, 'Bud');
      if (!ca) return;
      const st = ProjectUtils.getStatus(p);
      const bucket = result.find(t => ca >= t.min && ca < t.max);
      if (!bucket) return;
      if (st === 'obtenu' || st === 'perdu' || st === 'offre') bucket[st]++;
      bucket.total++;
    });

    return result;
  }

  /**
   * Pipeline par étape : offres froides (<30%), tièdes (30-70%), chaudes (>70%), obtenu, perdu.
   */
  function pipelineByStage(projects, filters = {}) {
    const data = _applyFilters(projects, filters);
    const result = { chaud: 0, tiede: 0, froid: 0, obtenu: 0, perdu: 0,
                     caChaud: 0, caTiede: 0, caFroid: 0, caObtenu: 0, caPerdu: 0 };

    data.forEach(p => {
      const st = ProjectUtils.getStatus(p);
      const ca  = _ca(p, 'Bud');
      if (st === 'obtenu') { result.obtenu++; result.caObtenu += ca; return; }
      if (st === 'perdu')  { result.perdu++;  result.caPerdu  += ca; return; }
      if (st !== 'offre')  return;

      const rawProba = p['Win proba'];
      let proba = 50;
      if (rawProba) {
        const n = parseFloat(String(rawProba).replace('%', '').trim());
        if (!isNaN(n)) proba = n;
      }

      if (proba >= 70)      { result.chaud++;  result.caChaud  += ca; }
      else if (proba >= 30) { result.tiede++;  result.caTiede  += ca; }
      else                  { result.froid++;  result.caFroid  += ca; }
    });

    return result;
  }

  /**
   * Carte thermique temporelle : Mois × Statut (nombre de projets).
   * @returns {Array<{ month, label, obtenu, perdu, offre, total }>}
   */
  function temporalHeatmap(projects, filters = {}) {
    const data = _applyFilters(projects, filters);
    const map = {};

    data.forEach(p => {
      const raw = p['Date réception'] || p['Date réception'];
      if (!raw) return;
      const d = ProjectUtils.parseDate(raw);
      if (!d) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!map[key]) map[key] = { obtenu: 0, perdu: 0, offre: 0, autre: 0 };
      const st = ProjectUtils.getStatus(p);
      if (map[key].hasOwnProperty(st)) map[key][st]++;
      else map[key].autre++;
    });

    const sorted = Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]));
    const monthNames = ['Jan','Fév','Mar','Avr','Mai','Jui','Jul','Aoû','Sep','Oct','Nov','Déc'];

    return sorted.map(([key, vals]) => {
      const [year, month] = key.split('-');
      return {
        month: key,
        label: `${monthNames[parseInt(month, 10) - 1]} ${year.slice(2)}`,
        total: vals.obtenu + vals.perdu + vals.offre + vals.autre,
        ...vals
      };
    });
  }

  /**
   * Filtrage par plage de dates.
   * @param {string} start   'YYYY-MM-DD'
   * @param {string} end     'YYYY-MM-DD'
   * @param {string} field   champ date à utiliser
   */
  function filterByDateRange(projects, start, end, field = 'creation') {
    if (!start && !end) return projects;
    const startD = start ? new Date(start) : null;
    const endD   = end   ? new Date(end + 'T23:59:59') : null;

    return projects.filter(p => {
      const raw = p[field] || p['Date réception'] || p['Date réception'];
      if (!raw) return false;
      const d = ProjectUtils.parseDate(raw);
      if (!d) return false;
      if (startD && d < startD) return false;
      if (endD   && d > endD)   return false;
      return true;
    });
  }

  /**
   * Insights automatiques avancés — détection d'événements remarquables.
   */
  function autoInsights(projects, filters = {}) {
    const data = _applyFilters(projects, filters);
    const monthly = caByMonth(data);

    const recordMonth = monthly.length
      ? monthly.reduce((a, b) => a.etudie > b.etudie ? a : b)
      : null;

    let trend = null;
    if (monthly.length >= 3) {
      const last3 = monthly.slice(-3);
      const growths = last3.slice(1).map((m, i) => m.etudie - last3[i].etudie);
      const allUp   = growths.every(g => g > 0);
      const allDown = growths.every(g => g < 0);
      if (allUp)            trend = { direction: 'hausse', label: 'Croissance continue sur 3 mois', icon: '📈' };
      else if (allDown)     trend = { direction: 'baisse', label: 'Ralentissement sur 3 derniers mois', icon: '📉' };
      else                  trend = { direction: 'stable', label: 'Tendance instable', icon: '〰️' };
    }

    let peakMonth = null;
    if (monthly.length >= 4) {
      const values = monthly.map(m => m.etudie).sort((a, b) => a - b);
      const median = values[Math.floor(values.length / 2)];
      const maxM   = monthly.reduce((a, b) => a.etudie > b.etudie ? a : b);
      if (median > 0 && maxM.etudie > median * 2) peakMonth = maxM;
    }

    const clientCA = {};
    data.filter(p => ProjectUtils.getStatus(p) === 'obtenu').forEach(p => {
      const k = (p['Client'] || '').trim(); if (!k) return;
      clientCA[k] = (clientCA[k] || 0) + _ca(p, 'Bud');
    });
    const bestClient = Object.entries(clientCA).sort((a, b) => b[1] - a[1])[0] || null;

    const zoneCA = caByZone(data, {}, 'Bud');
    const bestZone = Object.entries(zoneCA).sort((a, b) => b[1] - a[1])[0] || null;

    const smallProjects = data.filter(p => _ca(p, 'Bud') < 200000);
    const bigProjects   = data.filter(p => _ca(p, 'Bud') >= 200000);
    const winRateSegments = {
      small: { total: smallProjects.length, rate: conversionRate(smallProjects) },
      big:   { total: bigProjects.length,   rate: conversionRate(bigProjects) }
    };

    return { recordMonth, bestClient, bestZone, trend, peakMonth, winRateSegments };
  }

  /* ──────────────────────────────────────────────────────
     12. v3.0 — INTELLIGENCE DÉCISIONNELLE
  ────────────────────────────────────────────────────── */

  /**
   * Volume de projets par mois (toutes offres + décidés).
   * @returns {Array<{ month, label, total, obtenu, perdu, offre }>}
   */
  function volumeByMonth(projects, filters = {}) {
    const data = _applyFilters(projects, filters);
    const map = {};
    const monthNames = ['Jan','Fév','Mar','Avr','Mai','Jui','Jul','Aoû','Sep','Oct','Nov','Déc'];

    data.forEach(p => {
      const d = _getDate(p);
      if (!d) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!map[key]) map[key] = { total: 0, obtenu: 0, perdu: 0, offre: 0 };
      map[key].total++;
      const st = ProjectUtils.getStatus(p);
      if (map[key].hasOwnProperty(st)) map[key][st]++;
    });

    return Object.entries(map)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, vals]) => {
        const [y, m] = key.split('-');
        return { month: key, label: `${monthNames[parseInt(m, 10) - 1]} ${y}`, ...vals };
      });
  }

  /**
   * Taux de conversion mensuel — winRate par mois.
   * @returns {Array<{ month, label, won, decided, winRate }>}
   */
  function winRateByMonth(projects, filters = {}) {
    const data = _applyFilters(projects, filters);
    const map = {};
    const monthNames = ['Jan','Fév','Mar','Avr','Mai','Jui','Jul','Aoû','Sep','Oct','Nov','Déc'];

    data.forEach(p => {
      const d = _getDate(p);
      if (!d) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!map[key]) map[key] = { won: 0, decided: 0 };
      const st = ProjectUtils.getStatus(p);
      if (st === 'obtenu') { map[key].won++; map[key].decided++; }
      else if (st === 'perdu') { map[key].decided++; }
    });

    return Object.entries(map)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, vals]) => {
        const [y, m] = key.split('-');
        return {
          month: key,
          label: `${monthNames[parseInt(m, 10) - 1]} ${y}`,
          ...vals,
          winRate: vals.decided > 0 ? Math.round((vals.won / vals.decided) * 100) : null
        };
      });
  }

  /**
   * Pipeline pondéré individuel : Σ(CA_offre × win_proba_individuelle).
   * Beaucoup plus précis que global × conversionRate.
   * @returns {{ weighted, simple, delta, projects: Array<{label, ca, proba, weighted}> }}
   */
  function pipelineWeighted(projects, filters = {}) {
    const data = _applyFilters(projects, filters);
    const offers = data.filter(p => ProjectUtils.getStatus(p) === 'offre');

    let weighted = 0;
    const breakdown = offers.map(p => {
      const ca = _ca(p, 'Bud');
      const rawProba = p['Win proba'];
      let proba = null;
      if (rawProba) {
        const n = parseFloat(String(rawProba).replace('%', '').trim());
        if (!isNaN(n)) proba = n / 100;
      }
      // Fallback: taux global si pas de proba individuelle
      const effectiveProba = proba !== null ? proba : (conversionRate(data) || 50) / 100;
      const w = Math.round(ca * effectiveProba);
      weighted += w;
      return {
        label:    (p['Client'] || 'N/A').substring(0, 20),
        projet:   (p.projet || '').substring(0, 30),
        ca,
        proba:    Math.round(effectiveProba * 100),
        weighted: w,
        hasIndividualProba: proba !== null
      };
    });

    // Comparaison avec méthode simple (taux global)
    const globalRate = (conversionRate(data) || 50) / 100;
    const simpleTotal = offers.reduce((s, p) => s + _ca(p, 'Bud'), 0);
    const simple = Math.round(simpleTotal * globalRate);

    return {
      weighted,
      simple,
      delta: weighted - simple,
      deltaPct: simple > 0 ? Math.round(((weighted - simple) / simple) * 100) : null,
      offerCount: offers.length,
      projects: breakdown.sort((a, b) => b.weighted - a.weighted)
    };
  }

  /**
   * Comparaison de deux périodes.
   * @param {string} startA  'YYYY-MM-DD'
   * @param {string} endA    'YYYY-MM-DD'
   * @param {string} startB  'YYYY-MM-DD'
   * @param {string} endB    'YYYY-MM-DD'
   * @returns {Object} comparaison complète avec deltas
   */
  function comparePeriods(projects, startA, endA, startB, endB) {
    const field = _config.dateField;
    const dataA = filterByDateRange(projects, startA, endA, field);
    const dataB = filterByDateRange(projects, startB, endB, field);

    const pct = (a, b) => b > 0 ? Math.round(((a - b) / b) * 100) : null;
    const dir = (delta) => delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';

    const caA = totalCA(dataA, {}, 'Bud');
    const caB = totalCA(dataB, {}, 'Bud');
    const volA = dataA.length;
    const volB = dataB.length;
    const rateA = conversionRate(dataA);
    const rateB = conversionRate(dataB);

    // Top client shift
    const topClientA = Object.entries(caByClient(dataA, {}, 'Bud', 1))[0] || null;
    const topClientB = Object.entries(caByClient(dataB, {}, 'Bud', 1))[0] || null;

    // Zone shift
    const zonesA = caByZone(dataA, {}, 'Bud');
    const zonesB = caByZone(dataB, {}, 'Bud');
    const topZoneA = Object.entries(zonesA).sort((a, b) => b[1] - a[1])[0] || null;
    const topZoneB = Object.entries(zonesB).sort((a, b) => b[1] - a[1])[0] || null;

    const caDelta    = caA - caB;
    const volDelta   = volA - volB;
    const rateDelta  = rateA !== null && rateB !== null ? rateA - rateB : null;

    return {
      periodA: { start: startA, end: endA, label: `${startA} → ${endA}` },
      periodB: { start: startB, end: endB, label: `${startB} → ${endB}` },
      // CA
      caA, caB,
      caDelta,
      caDeltaPct: pct(caA, caB),
      caDirection: dir(caDelta),
      // Volume
      volA, volB,
      volDelta,
      volDeltaPct: pct(volA, volB),
      volDirection: dir(volDelta),
      // Taux conversion
      rateA, rateB,
      rateDelta,
      rateDirection: rateDelta !== null ? dir(rateDelta) : 'unknown',
      // Shifts
      topClientA, topClientB,
      clientShifted: topClientA && topClientB && topClientA[0] !== topClientB[0],
      topZoneA, topZoneB,
      zoneShifted: topZoneA && topZoneB && topZoneA[0] !== topZoneB[0],
      // Résumé global
      globalTrend: caDelta >= 0 && volDelta >= 0 ? 'progression'
                 : caDelta < 0  && volDelta < 0  ? 'recul'
                 : 'mixte'
    };
  }

  /**
   * Projection fin d'année basée sur la tendance mensuelle + pipeline pondéré.
   * @returns {{ projected, gained, pipeline, remaining, monthsLeft, confidence, label }}
   */
  function forecastYearEnd(projects, filters = {}, objectif = null) {
    const data = _applyFilters(projects, filters);
    const now   = new Date();
    const year  = now.getFullYear();
    const month = now.getMonth(); // 0-11

    // CA déjà gagné cette année
    const thisYear = data.filter(p => {
      const d = _getDate(p);
      return d && d.getFullYear() === year;
    });
    const gained = totalCA(thisYear, {}, 'Bud', 'obtenu');

    // Moyenne mensuelle basée sur les mois complets (excl. mois courant)
    const monthly = caByMonth(data).filter(m => {
      const [y, mo] = m.month.split('-');
      return parseInt(y, 10) === year && (parseInt(mo, 10) - 1) < month;
    });

    const monthsElapsed  = Math.max(month, 1);
    const avgMonthlyCA   = monthly.length > 0
      ? monthly.reduce((s, m) => s + m.gagne, 0) / monthly.length
      : gained / monthsElapsed;

    const monthsLeft = 12 - month - 1; // mois restants après le mois courant

    // Pipeline pondéré pour les offres actives
    const pw = pipelineWeighted(data);

    // Projection = gagné + tendance × mois restants + pipeline pondéré
    const trendProjection = Math.round(avgMonthlyCA * monthsLeft);
    const projected = Math.round(gained + trendProjection + pw.weighted);

    // Confiance (plus on a de données, plus c'est fiable)
    const confidence = Math.min(100, Math.round((monthsElapsed / 12) * 80 + (data.length >= 10 ? 20 : data.length * 2)));

    const pctObjectif = objectif ? Math.round((projected / objectif) * 100) : null;

    return {
      projected,
      gained,
      pipeline:      pw.weighted,
      trendContrib:  trendProjection,
      monthsLeft,
      monthsElapsed,
      avgMonthlyCA:  Math.round(avgMonthlyCA),
      confidence,
      objectif,
      pctObjectif,
      delta:         objectif ? projected - objectif : null,
      label:         objectif
        ? `Projection : ${ProjectUtils.formatMontant(projected, true)} (objectif ${ProjectUtils.formatMontant(objectif, true)} → ${pctObjectif >= 100 ? '✅' : '⚠️'} ${pctObjectif}%)`
        : `Projection fin d'année : ${ProjectUtils.formatMontant(projected, true)}`
    };
  }

  /**
   * Score de performance global (0–100) — indicateur composite.
   * Critères : conversion, CA gagné relatif, pipeline, croissance.
   * @returns {{ score, label, color, gauge, breakdown }}
   */
  function performanceScore(projects, filters = {}, objectif = null) {
    const data = _applyFilters(projects, filters);
    let score = 0;
    const breakdown = {};

    // 1. Taux de conversion (0–30 pts)
    const rate = conversionRate(data);
    const rateScore = rate === null ? 15
      : rate >= 60 ? 30
      : rate >= 40 ? 22
      : rate >= 25 ? 14
      : rate >= 10 ? 7
      : 0;
    breakdown.conversion = { score: rateScore, max: 30, rate };
    score += rateScore;

    // 2. Pipeline pondéré vs objectif (0–25 pts)
    const pw = pipelineWeighted(data);
    let pipelineScore = 0;
    if (objectif && objectif > 0) {
      const gained = totalCA(data, {}, 'Bud', 'obtenu');
      const remaining = Math.max(0, objectif - gained);
      pipelineScore = pw.weighted >= remaining ? 25
        : pw.weighted >= remaining * 0.7 ? 18
        : pw.weighted >= remaining * 0.4 ? 10
        : 4;
    } else if (pw.offerCount > 0) {
      pipelineScore = Math.min(25, pw.offerCount * 3);
    }
    breakdown.pipeline = { score: pipelineScore, max: 25, weighted: pw.weighted };
    score += pipelineScore;

    // 3. Délai de décision (0–20 pts) — plus court = mieux
    const dt = avgDecisionTime(data);
    const delayScore = dt === null ? 10
      : dt <= 60  ? 20
      : dt <= 120 ? 15
      : dt <= 200 ? 9
      : 3;
    breakdown.delay = { score: delayScore, max: 20, avgDays: dt };
    score += delayScore;

    // 4. Croissance mensuelle (0–15 pts)
    const monthly = caByMonth(data);
    let growthScore = 0;
    if (monthly.length >= 3) {
      const last = monthly.slice(-3).map(m => m.etudie);
      const growing = last[2] > last[1] && last[1] > last[0];
      const flat    = Math.abs(last[2] - last[0]) / (last[0] || 1) < 0.1;
      growthScore = growing ? 15 : flat ? 8 : 3;
    }
    breakdown.growth = { score: growthScore, max: 15 };
    score += growthScore;

    // 5. Taux de réponse offres (0–10 pts)
    const resp = responseRate(data);
    const respScore = resp >= 80 ? 10 : resp >= 60 ? 7 : resp >= 40 ? 4 : 1;
    breakdown.response = { score: respScore, max: 10, rate: resp };
    score += respScore;

    score = Math.max(0, Math.min(100, score));

    let label, color, emoji;
    if (score >= 80)      { label = 'Excellent';      color = '#00d4aa'; emoji = '🏆'; }
    else if (score >= 65) { label = 'Très bon';       color = '#10b981'; emoji = '✅'; }
    else if (score >= 50) { label = 'Correct';        color = '#f5b740'; emoji = '⚡'; }
    else if (score >= 35) { label = 'À améliorer';    color = '#f97316'; emoji = '⚠️'; }
    else                  { label = 'Critique';       color = '#ff4d6d'; emoji = '🔴'; }

    return { score, label, color, emoji, breakdown };
  }

  /**
   * Diagnostics stratégiques automatiques.
   * @returns {{ alerts: [], strengths: [], risks: [], recommendations: [] }}
   */
  function diagnostics(projects, filters = {}, objectif = null) {
    const data = _applyFilters(projects, filters);
    const alerts = [], strengths = [], risks = [], recommendations = [];

    const counts  = countByStatus(data);
    const rate    = conversionRate(data);
    const won     = data.filter(p => ProjectUtils.getStatus(p) === 'obtenu');
    const offers  = data.filter(p => ProjectUtils.getStatus(p) === 'offre');
    const overdue = overdueOffers(data);

    // ── Concentration client ──────────────────────────────
    const caClientMap = {};
    won.forEach(p => {
      const k = (p['Client'] || '').trim(); if (!k) return;
      caClientMap[k] = (caClientMap[k] || 0) + _ca(p, 'Bud');
    });
    const totalWonCA = Object.values(caClientMap).reduce((s, v) => s + v, 0);
    const topClientEntry = Object.entries(caClientMap).sort((a, b) => b[1] - a[1])[0];
    if (topClientEntry && totalWonCA > 0) {
      const concentration = topClientEntry[1] / totalWonCA;
      if (concentration >= _config.concentrationAlertThreshold) {
        alerts.push({
          type: 'risk',
          icon: '🏦',
          title: 'Concentration client élevée',
          message: `${topClientEntry[0]} représente ${Math.round(concentration * 100)}% du CA gagné — risque de dépendance.`,
          action: 'Diversifier le portefeuille client'
        });
        risks.push({ id: 'concentration_client', severity: concentration >= 0.6 ? 'high' : 'medium' });
      }
    }

    // ── Dépendance zone ──────────────────────────────────
    const caZoneMap = caByZone(data, {}, 'Bud');
    const totalZoneCA = Object.values(caZoneMap).reduce((s, v) => s + v, 0);
    const topZoneEntry = Object.entries(caZoneMap).sort((a, b) => b[1] - a[1])[0];
    if (topZoneEntry && totalZoneCA > 0) {
      const zoneConc = topZoneEntry[1] / totalZoneCA;
      if (zoneConc >= 0.55) {
        alerts.push({
          type: 'warning',
          icon: '🌍',
          title: 'Dépendance géographique',
          message: `${Math.round(zoneConc * 100)}% du CA gagné provient de la zone ${topZoneEntry[0]}.`,
          action: 'Développer les autres zones géographiques'
        });
        risks.push({ id: 'zone_dependance', severity: zoneConc >= 0.75 ? 'high' : 'medium' });
      }
    }

    // ── Taux de conversion ────────────────────────────────
    if (rate !== null) {
      if (rate < _config.conversionAlertMin) {
        alerts.push({
          type: 'alert',
          icon: '📉',
          title: 'Taux de conversion critique',
          message: `${rate}% de conversion sur les projets décidés — seuil minimum recommandé : ${_config.conversionAlertMin}%.`,
          action: 'Analyser les causes des pertes récentes'
        });
        risks.push({ id: 'low_conversion', severity: 'high' });
      } else if (rate >= _config.conversionAlertHigh) {
        strengths.push({
          icon: '🎯',
          title: 'Excellent taux de conversion',
          message: `${rate}% de conversion — performance au-dessus du seuil de référence (${_config.conversionAlertHigh}%).`
        });
      }
    }

    // ── Pipeline insuffisant vs objectif ─────────────────
    if (objectif) {
      const gained = totalCA(won, {}, 'Bud');
      const pw = pipelineWeighted(data);
      const remaining = Math.max(0, objectif - gained);
      if (pw.weighted < remaining * 0.5 && remaining > 0) {
        alerts.push({
          type: 'alert',
          icon: '💼',
          title: 'Pipeline insuffisant',
          message: `Pipeline pondéré (${ProjectUtils.formatMontant(pw.weighted, true)}) insuffisant pour couvrir le restant à atteindre (${ProjectUtils.formatMontant(remaining, true)}).`,
          action: 'Alimenter le pipeline — prospecter activement'
        });
        risks.push({ id: 'insufficient_pipeline', severity: 'high' });
      } else if (pw.weighted >= remaining && remaining > 0) {
        strengths.push({
          icon: '💰',
          title: 'Pipeline bien dimensionné',
          message: `Pipeline pondéré (${ProjectUtils.formatMontant(pw.weighted, true)}) couvre l'objectif restant.`
        });
      }
    }

    // ── Offres en retard ─────────────────────────────────
    if (overdue.length >= _config.overdueAlertThreshold) {
      alerts.push({
        type: 'warning',
        icon: '⚠️',
        title: `${overdue.length} offres en retard`,
        message: `Échéances dépassées sans décision — impact potentiel sur le taux de réponse.`,
        action: 'Relancer les clients concernés en priorité'
      });
    }

    // ── Tendance mensuelle ────────────────────────────────
    const monthly = caByMonth(data);
    if (monthly.length >= 3) {
      const last3 = monthly.slice(-3).map(m => m.etudie);
      const allDown = last3[2] < last3[1] && last3[1] < last3[0];
      const allUp   = last3[2] > last3[1] && last3[1] > last3[0];
      if (allDown) {
        alerts.push({
          type: 'info',
          icon: '📉',
          title: 'Ralentissement mensuel',
          message: 'CA étudié en baisse sur les 3 derniers mois consécutifs.',
          action: 'Identifier les segments en perte de vitesse'
        });
        risks.push({ id: 'monthly_decline', severity: 'medium' });
      }
      if (allUp) {
        strengths.push({
          icon: '📈',
          title: 'Croissance mensuelle soutenue',
          message: 'CA étudié en hausse sur les 3 derniers mois — dynamique commerciale positive.'
        });
      }
    }

    // ── Recommandations automatiques ─────────────────────
    if (risks.find(r => r.id === 'low_conversion')) {
      recommendations.push({
        priority: 1, icon: '🔍',
        title: 'Audit des projets perdus',
        detail: 'Analyser les patterns des projets perdus : zone, taille, type offre, délai.'
      });
    }
    if (risks.find(r => r.id === 'concentration_client')) {
      recommendations.push({
        priority: 2, icon: '🌐',
        title: 'Diversification portefeuille',
        detail: 'Cibler 2–3 nouveaux clients potentiels dans des zones sous-représentées.'
      });
    }
    if (risks.find(r => r.id === 'insufficient_pipeline')) {
      recommendations.push({
        priority: 1, icon: '🚀',
        title: 'Renforcer la prospection',
        detail: `Générer au moins ${ProjectUtils.formatMontant((objectif || 0) * 0.3, true)} de nouvelles opportunités.`
      });
    }
    if (counts.offre > 0 && rate !== null && rate > 40) {
      recommendations.push({
        priority: 3, icon: '⚡',
        title: 'Accélérer la décision sur les offres actives',
        detail: `${counts.offre} offres en cours — relance proactive sur les chaudes (>70% win_proba).`
      });
    }

    // Trier les recommandations par priorité
    recommendations.sort((a, b) => a.priority - b.priority);

    return { alerts, strengths, risks, recommendations };
  }

  /* ──────────────────────────────────────────────────────
     13. v4.0 — COMPARAISON ANNÉES INTELLIGENTE
  ────────────────────────────────────────────────────── */

  /**
   * Configuration du mode comparaison — mutable par l'UI.
   * Non gelé : Analytics.compareConfig.positiveOnly = true
   */
  const _compareConfig = {
    positiveOnly: false,  // masquer les métriques en régression
    yearA: null,
    yearB: null,
    colorA: '#0099ff',   // bleu — année de référence
    colorB: '#8b78f8',   // violet — année de comparaison
  };

  /** Extraire les projets d'une année — utilise annee_manuel > annee > creation */
  function _projectsForYear(projects, year) {
    const y = String(parseInt(year, 10));
    return projects.filter(p => _getAnneeFinale(p) === y);
  }

  /**
   * Retourner toutes les années distinctes présentes dans les données.
   * Tient compte de annee_manuel (priorité) + annee + date création.
   * @returns {number[]} années triées décroissantes
   */
  function availableYears(projects) {
    const set = new Set();
    projects.forEach(p => {
      const y = _getAnneeFinale(p);
      if (y) set.add(parseInt(y, 10));
    });
    return [...set].filter(y => !isNaN(y)).sort((a, b) => b - a);
  }

  /**
   * Comparer deux années sur tous les indicateurs clés.
   * @param {Array}         projects  données brutes complètes
   * @param {number|string} yearA     année A (référence — "nouvelle")
   * @param {number|string} yearB     année B (base — "ancienne")
   * @returns {Object}
   */
  function compareYears(projects, yearA, yearB) {
    const dataA = _projectsForYear(projects, yearA);
    const dataB = _projectsForYear(projects, yearB);

    /* Calcul delta unifié */
    function _delta(a, b) {
      const d   = a - b;
      const pct = b !== 0 ? Math.round((d / Math.abs(b)) * 100) : (a !== 0 ? 100 : 0);
      return { A: a, B: b, delta: d, deltaPct: pct,
               direction: d > 0 ? 'up' : d < 0 ? 'down' : 'flat',
               positive: d >= 0 };
    }

    /* Métriques de base */
    const caGagneA   = totalCA(dataA, {}, 'Bud');
    const caGagneB   = totalCA(dataB, {}, 'Bud');
    const caEtudieA  = totalCA(dataA, {}, 'Bud');
    const caEtudieB  = totalCA(dataB, {}, 'Bud');
    const rateA      = conversionRate(dataA);
    const rateB      = conversionRate(dataB);
    const volA       = dataA.length;
    const volB       = dataB.length;
    const wonA       = dataA.filter(p => ProjectUtils.getStatus(p) === 'obtenu').length;
    const wonB       = dataB.filter(p => ProjectUtils.getStatus(p) === 'obtenu').length;
    const avgCAA     = wonA > 0 ? Math.round(caGagneA / wonA) : 0;
    const avgCAB     = wonB > 0 ? Math.round(caGagneB / wonB) : 0;
    const respA      = responseRate(dataA);
    const respB      = responseRate(dataB);

    /* Shifts client / zone */
    const clientMapA = caByClient(dataA, {}, 'Bud', 20);
    const clientMapB = caByClient(dataB, {}, 'Bud', 20);
    const topClientA = Object.entries(clientMapA).sort((a, b) => b[1] - a[1])[0] || null;
    const topClientB = Object.entries(clientMapB).sort((a, b) => b[1] - a[1])[0] || null;

    const zonesA     = caByZone(dataA, {}, 'Bud');
    const zonesB     = caByZone(dataB, {}, 'Bud');
    const topZoneA   = Object.entries(zonesA).sort((a, b) => b[1] - a[1])[0] || null;
    const topZoneB   = Object.entries(zonesB).sort((a, b) => b[1] - a[1])[0] || null;

    /* Comparaison par zone */
    const allZones = [...new Set([...Object.keys(zonesA), ...Object.keys(zonesB)])];
    const zoneComparison = allZones.map(z => {
      const cA = zonesA[z] || 0, cB = zonesB[z] || 0;
      return { zone: z, caA: cA, caB: cB, delta: cA - cB,
               deltaPct: cB > 0 ? Math.round((cA - cB) / cB * 100) : null,
               positive: cA >= cB };
    }).sort((a, b) => b.caA - a.caA);

    /* Comparaison par client (top 10) */
    const allClients = [...new Set([...Object.keys(clientMapA), ...Object.keys(clientMapB)])];
    const clientComparison = allClients.map(c => {
      const cA = clientMapA[c] || 0, cB = clientMapB[c] || 0;
      return { client: c, caA: cA, caB: cB, delta: cA - cB,
               deltaPct: cB > 0 ? Math.round((cA - cB) / cB * 100) : null,
               positive: cA >= cB };
    }).sort((a, b) => b.caA - a.caA).slice(0, 10);

    /* Verdict global */
    const positives = [caGagneA > caGagneB,
                       rateA !== null && rateB !== null && rateA > rateB,
                       volA > volB].filter(Boolean).length;
    const verdict = positives >= 2 ? 'better' : positives === 0 ? 'worse' : 'mixed';

    /* Phrase narrative automatique */
    const fmt = v => ProjectUtils.formatMontant(v, true);
    let narrative = `<strong>${yearA}</strong> vs <strong>${yearB}</strong> · `;
    if (verdict === 'better')
      narrative += `<span style="color:#00d4aa">▲ En progression</span>`;
    else if (verdict === 'worse')
      narrative += `<span style="color:#ff4d6d">▼ En recul</span>`;
    else
      narrative += `<span style="color:#f5b740">⟷ Résultats mixtes</span>`;
    if (caGagneB > 0) {
      const pct = Math.abs(Math.round((caGagneA - caGagneB) / caGagneB * 100));
      const sign = caGagneA >= caGagneB ? '+' : '-';
      narrative += ` — CA gagné ${sign}${pct}% (${fmt(caGagneA)} vs ${fmt(caGagneB)})`;
    }
    if (rateA !== null && rateB !== null) {
      const rd = rateA - rateB;
      narrative += ` · Conversion ${rd >= 0 ? '+' : ''}${rd}pt (${rateA}% vs ${rateB}%)`;
    }
    narrative += `.`;

    /* Structure de données pour le graphique comparatif */
    const chartData = {
      labels:    ['CA Gagné', 'CA Étudié', 'Win Rate %', 'Volume', 'Projets Gagnés', 'CA Moyen Gagné'],
      valuesA:   [caGagneA, caEtudieA, rateA || 0, volA, wonA, avgCAA],
      valuesB:   [caGagneB, caEtudieB, rateB || 0, volB, wonB, avgCAB],
      isPercent: [false, false, true, false, false, false],
      isCurrency:[true, true, false, false, false, true],
      deltas:    [caGagneA - caGagneB, caEtudieA - caEtudieB,
                  rateA !== null && rateB !== null ? rateA - rateB : 0,
                  volA - volB, wonA - wonB, avgCAA - avgCAB]
    };

    return {
      yearA: parseInt(yearA, 10),
      yearB: parseInt(yearB, 10),
      // Métriques comparées
      ca_gagne:    _delta(caGagneA,  caGagneB),
      ca_etudie:   _delta(caEtudieA, caEtudieB),
      winRate:     { A: rateA, B: rateB,
                     delta: rateA !== null && rateB !== null ? rateA - rateB : null,
                     positive: rateA !== null && rateB !== null ? rateA >= rateB : null },
      volume:      _delta(volA,   volB),
      won:         _delta(wonA,   wonB),
      avgCA:       _delta(avgCAA, avgCAB),
      responseRate:_delta(respA,  respB),
      // Shifts
      topClientA, topClientB,
      clientShifted: !!(topClientA && topClientB && topClientA[0] !== topClientB[0]),
      topZoneA, topZoneB,
      zoneShifted: !!(topZoneA && topZoneB && topZoneA[0] !== topZoneB[0]),
      // Détails breakdowns
      zoneComparison,
      clientComparison,
      // Verdict + narrative
      verdict,
      narrative,
      chartData
    };
  }

  /* ──────────────────────────────────────────────────────
     14. v4.1 — COMPARAISON OBJECTIFS ANNUELS
  ────────────────────────────────────────────────────── */

  /**
   * Comparer l'atteinte d'objectif entre deux années.
   *
   * @param {Array}  projects          données brutes complètes
   * @param {string|number} yearA      année A (référence — la plus récente)
   * @param {string|number} yearB      année B (base — l'ancienne)
   * @param {Object} objectivesConfig  ex: { "2023": 4000000, "2024": 5000000 }
   * @param {string} [caMode]          champ CA à utiliser (défaut: 'Bud')
   * @returns {Object}
   */
  function compareObjective(projects, yearA, yearB, objectivesConfig, caMode) {
    const mode = caMode || 'Bud';
    const dataA = _projectsForYear(projects, yearA);
    const dataB = _projectsForYear(projects, yearB);
    const cfg   = objectivesConfig || {};
    const yA    = String(yearA);
    const yB    = String(yearB);

    /* ── Objectifs ── */
    const objA = cfg[yA] || 0;
    const objB = cfg[yB] || 0;

    /* ── CA réel ── */
    const realA = totalCA(dataA, {}, mode);
    const realB = totalCA(dataB, {}, mode);

    /* ── Taux de complétion (%) ── */
    const compA = objA > 0 ? Math.round((realA / objA) * 100 * 10) / 10 : 0;
    const compB = objB > 0 ? Math.round((realB / objB) * 100 * 10) / 10 : 0;

    /* ── Écart à l'objectif (gap = objectif − réel) ── */
    const gapA = objA - realA;
    const gapB = objB - realB;

    /* ── Helpers delta ── */
    const _d = (a, b) => {
      const delta    = a - b;
      const deltaPct = b !== 0 ? Math.round((delta / Math.abs(b)) * 100) : (a !== 0 ? 100 : 0);
      return { A: a, B: b, delta, deltaPct, positive: delta >= 0, direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat' };
    };

    const objectifDelta     = _d(objA, objB);
    const performanceDelta  = _d(realA, realB);
    const completionDelta   = { A: compA, B: compB, delta: Math.round((compA - compB) * 10) / 10, positive: compA >= compB };
    const gapDelta          = _d(gapA, gapB); // amélioration = gap A plus petit que gap B → delta négatif est positif ici
    gapDelta.improved       = gapA < gapB;    // l'écart s'est réduit → bonne nouvelle

    /* ── Verdict ── */
    let verdict;
    if (compA >= 100 && compB < 100)       verdict = 'ahead';
    else if (compA < 100 && compB >= 100)  verdict = 'behind';
    else if (compA >= compB && objA >= objB) verdict = 'improving';
    else if (compA < compB)                verdict = 'worsening';
    else                                   verdict = 'stable';

    /* ── Interprétation narrative ── */
    const fmt  = v => ProjectUtils.formatMontant(v, true);
    let narrative;
    if (objA > objB && realA > realB) {
      const perfPct = performanceDelta.deltaPct;
      narrative = objA > objB && compA >= compB
        ? `Objectif plus ambitieux (+${objectifDelta.deltaPct}%) et dépassé : la performance progresse davantage que l'ambition.`
        : `Objectif ambitieux (+${objectifDelta.deltaPct}%) mais la performance n'a pas suivi le même rythme.`;
    } else if (gapDelta.improved) {
      narrative = `Amélioration structurelle : l'écart à l'objectif s'est réduit de ${fmt(Math.abs(gapB - gapA))}.`;
    } else if (performanceDelta.positive) {
      narrative = `Performance en hausse de +${performanceDelta.deltaPct}% malgré un contexte plus exigeant.`;
    } else {
      narrative = `Performance en recul de ${performanceDelta.deltaPct}% — objectif plus difficile à atteindre.`;
    }

    /* ── Indicateurs individuels pour affichage ── */
    const indicators = [
      {
        id: 'objectif',
        label: 'Objectif',
        icon: '🎯',
        valueA: fmt(objA),
        valueB: fmt(objB),
        delta: objectifDelta.delta,
        deltaPct: objectifDelta.deltaPct,
        positive: objectifDelta.positive,
        available: objA > 0 || objB > 0
      },
      {
        id: 'performance',
        label: 'Performance réelle',
        icon: '📈',
        valueA: fmt(realA),
        valueB: fmt(realB),
        delta: performanceDelta.delta,
        deltaPct: performanceDelta.deltaPct,
        positive: performanceDelta.positive,
        available: true
      },
      {
        id: 'completion',
        label: 'Taux de réalisation',
        icon: '✅',
        valueA: compA + '%',
        valueB: compB + '%',
        delta: completionDelta.delta,
        deltaPct: null,
        positive: completionDelta.positive,
        isPoints: true,
        available: objA > 0 || objB > 0
      },
      {
        id: 'gap',
        label: 'Écart à l\'objectif',
        icon: '📏',
        valueA: gapA > 0 ? fmt(gapA) : '🎉 Dépassé',
        valueB: gapB > 0 ? fmt(gapB) : '🎉 Dépassé',
        delta: gapDelta.delta,       // négatif = amélioration
        deltaPct: gapDelta.deltaPct,
        positive: gapDelta.improved, // l'écart s'est réduit = bon
        isGap: true,
        available: objA > 0 || objB > 0
      }
    ];

    return {
      yearA: parseInt(yearA, 10),
      yearB: parseInt(yearB, 10),
      objectif:      objectifDelta,
      performance:   performanceDelta,
      completionRate: completionDelta,
      gapToObjective: gapDelta,
      verdict,
      narrative,
      indicators,
      // Raw pour les barres
      bars: {
        A: { real: realA, obj: objA, pct: compA },
        B: { real: realB, obj: objB, pct: compB }
      }
    };
  }

  /* ──────────────────────────────────────────────────────
     15. v4.2 — HISTORIQUE OBJECTIFS MULTI-ANNÉES
  ────────────────────────────────────────────────────── */

  /**
   * Calcule l'atteinte d'objectif pour chaque année.
   *
   * @param {Array}  projects
   * @param {Object} objectivesConfig  { "2023": 4000000, "2024": 5000000 }
   * @param {string} [caMode]          'Bud' (défaut)
   * @returns {Object}  clé = année string
   */
  function objectiveByYear(projects, objectivesConfig, caMode) {
    const mode = caMode || 'Bud';
    const cfg  = objectivesConfig || {};

    // Union des années: config + données
    const cfgYears  = Object.keys(cfg).map(Number).filter(y => !isNaN(y));
    const dataYears = availableYears(projects);
    const allYears  = [...new Set([...cfgYears, ...dataYears])].sort((a, b) => a - b);

    const result = {};
    allYears.forEach(yr => {
      const yearData   = _projectsForYear(projects, yr);
      const real       = totalCA(yearData, {}, mode);
      const objectif   = cfg[String(yr)] || 0;
      const completion = objectif > 0 ? Math.round((real / objectif) * 1000) / 10 : null;
      const gap        = objectif > 0 ? objectif - real : null;

      result[String(yr)] = {
        year:        yr,
        objectif,
        real,
        completion,
        gap,
        hasObjectif: objectif > 0
      };
    });

    return result;
  }

  /**
   * Série chronologique avec delta vs année précédente — pour la timeline de barres.
   *
   * @param {Array}  projects
   * @param {Object} objectivesConfig
   * @param {string} [caMode]
   * @returns {Array}
   */
  function objectiveTrend(projects, objectivesConfig, caMode) {
    const byYear = objectiveByYear(projects, objectivesConfig, caMode);
    const years  = Object.keys(byYear).map(Number).sort((a, b) => a - b);

    return years.map((yr, i) => {
      const curr = byYear[String(yr)];
      const prev = i > 0 ? byYear[String(years[i - 1])] : null;

      // Delta taux de réalisation (en points)
      const deltaCompletion = (prev && prev.completion !== null && curr.completion !== null)
        ? Math.round((curr.completion - prev.completion) * 10) / 10
        : null;

      // Delta CA réel (€)
      const deltaReal = prev !== null ? curr.real - prev.real : null;

      // Delta ambition objectif (%)
      const deltaObjectif = (prev && prev.objectif > 0 && curr.objectif > 0)
        ? Math.round(((curr.objectif - prev.objectif) / prev.objectif) * 100)
        : null;

      return {
        year:            yr,
        objectif:        curr.objectif,
        real:            curr.real,
        completion:      curr.completion,   // null si pas d'objectif
        gap:             curr.gap,
        hasObjectif:     curr.hasObjectif,
        deltaVsPrevious: deltaCompletion,   // Δ pts taux vs N-1
        deltaReal,                           // Δ CA réel vs N-1
        deltaObjectif,                       // Δ% ambition vs N-1
        progression:     deltaCompletion !== null ? deltaCompletion >= 0 : null
      };
    });
  }

  /* ──────────────────────────────────────────────────────
     16. v4.3 — OBJECTIF MULTI-ANNÉES AVEC ANNÉES FORCÉES
  ────────────────────────────────────────────────────── */

  /**
   * Variante de objectiveTrend avec années fixes garanties.
   * Même si aucun projet n'existe pour une année, elle apparaît.
   * Compatible comparaison A/B et mode positif uniquement.
   *
   * @param {Array}    projects
   * @param {Object}   objectivesConfig  { "2023": 4000000, "2024": 5000000, ... }
   * @param {string[]} [forcedYears]     Ex: ["2023","2024","2025"] — prioritaire sur objectivesConfig keys
   * @param {string}   [caMode]          'Bud' (défaut)
   * @returns {Array}  Tableau ordonné chronologiquement
   */
  function objectiveTrendFixedYears(projects, objectivesConfig, forcedYears, caMode) {
    const mode = caMode || 'Bud';
    const cfg  = objectivesConfig || {};

    // Années : forcedYears en priorité, sinon les clés de config
    const years = (Array.isArray(forcedYears) && forcedYears.length)
      ? forcedYears.map(String)
      : Object.keys(cfg).sort();

    // Pour ca_gagne : sommer uniquement les projets au statut "obtenu"
    // Pour ca_etudie : sommer tous les projets (comportement standard)
    function _realForYear(year) {
      const filtered = projects.filter(function (p) {
        const py = p._annee
          ? String(p._annee)
          : (p['Date réception'] ? String(new Date(p['Date réception']).getFullYear()) : null);
        if (py !== year) return false;
        if (mode === 'Bud') {
          return ProjectUtils.getStatus(p) === 'obtenu';
        }
        return true;
      });
      return filtered.reduce(function (sum, p) {
        return sum + (_ca(p, mode));
      }, 0);
    }

    return years.map(function (year, index) {
      const real      = _realForYear(year);
      const objectif  = cfg[year] || 0;
      const completion = objectif > 0 ? Math.round((real / objectif) * 1000) / 10 : null;
      const gap        = objectif > 0 ? objectif - real : null;

      // Delta vs année précédente
      let deltaVsPrevious = null;
      let deltaReal       = null;
      let deltaObjectif   = null;
      let progression     = null;

      if (index > 0) {
        const prevYear       = years[index - 1];
        const prevReal       = _realForYear(prevYear);
        const prevObj        = cfg[prevYear] || 0;
        const prevCompletion = prevObj > 0 ? Math.round((prevReal / prevObj) * 1000) / 10 : null;

        deltaReal = real - prevReal;

        if (completion !== null && prevCompletion !== null) {
          deltaVsPrevious = Math.round((completion - prevCompletion) * 10) / 10;
          progression = deltaVsPrevious >= 0;
        }

        if (prevObj > 0 && objectif > 0) {
          deltaObjectif = Math.round(((objectif - prevObj) / prevObj) * 100);
        }
      }

      return {
        year:            parseInt(year, 10),
        objectif,
        real,
        completion,
        gap,
        hasObjectif:     objectif > 0,
        deltaVsPrevious,
        deltaReal,
        deltaObjectif,
        progression
      };
    });
  }

  /* ──────────────────────────────────────────────────────
     17. v5.0 — INTELLIGENCE DÉCISIONNELLE AVANCÉE
  ────────────────────────────────────────────────────── */

  /**
   * Mode d'affichage (positif uniquement, etc.) — mutable.
   */
  const _displayMode = {
    positiveOnly: false
  };

  /**
   * Score global de performance (0–100) — version enrichie.
   * Pondération : Conversion 30%, Objectif 30%, Croissance 20%, Pipeline 10%, Diversification 10%.
   * @param {Array}  projects
   * @param {number|string} year
   * @param {Object} [opts]  { objectif, objectivesConfig }
   * @returns {Object} { score, deltaVsLastYear, breakdown }
   */
  function performanceScoreV2(projects, year, opts = {}) {
    const y = parseInt(year, 10);
    const dataY = _projectsForYear(projects, y);
    const dataPrev = _projectsForYear(projects, y - 1);
    const cfg = opts.objectivesConfig || {};
    const objectif = opts.objectif || cfg[String(y)] || 0;

    const breakdown = { conversion: 0, objectif: 0, croissance: 0, pipeline: 0, diversification: 0 };

    // 1. Conversion (0–30 pts)
    const rate = conversionRate(dataY);
    breakdown.conversion = rate === null ? 15
      : rate >= 60 ? 30 : rate >= 45 ? 24 : rate >= 30 ? 18 : rate >= 15 ? 10 : 4;

    // 2. % objectif atteint (0–30 pts)
    if (objectif > 0) {
      const realCA = totalCA(dataY, {}, 'Bud', 'obtenu');
      const pct = realCA / objectif;
      breakdown.objectif = pct >= 1.0 ? 30 : pct >= 0.8 ? 24 : pct >= 0.6 ? 18 : pct >= 0.4 ? 12 : 5;
    } else {
      breakdown.objectif = 15; // neutral
    }

    // 3. Croissance vs N-1 (0–20 pts)
    const caY = totalCA(dataY, {}, 'Bud', 'obtenu');
    const caPrev = totalCA(dataPrev, {}, 'Bud', 'obtenu');
    if (caPrev > 0) {
      const growth = (caY - caPrev) / caPrev;
      breakdown.croissance = growth >= 0.20 ? 20 : growth >= 0.10 ? 16 : growth >= 0 ? 12 : growth >= -0.10 ? 6 : 2;
    } else {
      breakdown.croissance = caY > 0 ? 14 : 6;
    }

    // 4. Pipeline pondéré (0–10 pts)
    const pw = pipelineWeighted(dataY);
    if (objectif > 0) {
      const remaining = Math.max(0, objectif - caY);
      breakdown.pipeline = remaining <= 0 ? 10
        : pw.weighted >= remaining ? 10
        : pw.weighted >= remaining * 0.5 ? 7
        : pw.weighted > 0 ? 4 : 1;
    } else {
      breakdown.pipeline = pw.offerCount > 0 ? Math.min(10, pw.offerCount) : 2;
    }

    // 5. Diversification client (0–10 pts)
    const cc = clientConcentration(projects, year);
    breakdown.diversification = cc.riskLevel === 'low' ? 10
      : cc.riskLevel === 'medium' ? 7
      : cc.riskLevel === 'high' ? 4 : 2;

    const score = Math.max(0, Math.min(100,
      breakdown.conversion + breakdown.objectif + breakdown.croissance +
      breakdown.pipeline + breakdown.diversification));

    // Delta vs N-1
    let deltaVsLastYear = null;
    if (dataPrev.length > 0) {
      const prevScore = performanceScoreV2(projects, y - 1, opts).score;
      deltaVsLastYear = score - prevScore;
    }

    return { score, deltaVsLastYear, breakdown };
  }

  /**
   * Projection fin d'année intelligente.
   * Basée sur : CA actuel + pipeline pondéré + rythme mensuel extrapolé.
   * @returns {{ current, weightedPipeline, projected, objectif, projectedCompletion }}
   */
  function projectedYearEnd(projects, year, objectif = 0) {
    const y = parseInt(year, 10);
    const dataY = _projectsForYear(projects, y);
    const now = new Date();
    const currentMonth = now.getFullYear() === y ? now.getMonth() : 11;

    // CA déjà gagné
    const current = totalCA(dataY, {}, 'Bud', 'obtenu');

    // Pipeline pondéré
    const pw = pipelineWeighted(dataY);
    const weightedPipeline = pw.weighted;

    // Rythme mensuel (mois complets seulement)
    const monthsElapsed = Math.max(1, currentMonth); // janv = 0 → au moins 1
    const avgMonthlyCA = current / monthsElapsed;
    const monthsLeft = Math.max(0, 12 - currentMonth - 1);

    // Projection = CA actuel + extrapolation + pipeline
    const trendContrib = Math.round(avgMonthlyCA * monthsLeft);
    const projected = Math.round(current + trendContrib + weightedPipeline);

    const projectedCompletion = objectif > 0 ? Math.round((projected / objectif) * 100) : null;

    return {
      current,
      weightedPipeline,
      trendContrib,
      projected,
      objectif,
      projectedCompletion,
      avgMonthlyCA: Math.round(avgMonthlyCA),
      monthsElapsed,
      monthsLeft
    };
  }

  /**
   * Croissance cumulée CA gagné vs N-1.
   * @returns {{ months: string[], currentYear: number[], previousYear: number[] }}
   */
  function cumulativeGrowth(projects, year) {
    const y = parseInt(year, 10);
    const dataY = _projectsForYear(projects, y);
    const dataPrev = _projectsForYear(projects, y - 1);

    const monthNames = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
    const cumY = new Array(12).fill(0);
    const cumPrev = new Array(12).fill(0);

    // Accumulate CA gagné by month
    function accumulate(data, arr) {
      data.filter(p => ProjectUtils.getStatus(p) === 'obtenu').forEach(p => {
        const d = _getDate(p);
        if (!d) return;
        const m = d.getMonth();
        arr[m] += _ca(p, 'Bud');
      });
      // Make cumulative
      for (let i = 1; i < 12; i++) arr[i] += arr[i - 1];
    }

    accumulate(dataY, cumY);
    accumulate(dataPrev, cumPrev);

    return { months: monthNames, currentYear: cumY, previousYear: cumPrev };
  }

  /**
   * Concentration client — risque de dépendance.
   * @returns {{ topClient, share, riskLevel, top3Share, details }}
   */
  function clientConcentration(projects, year) {
    const y = parseInt(year, 10);
    const dataY = _projectsForYear(projects, y);
    const won = dataY.filter(p => ProjectUtils.getStatus(p) === 'obtenu');

    const caMap = {};
    let totalWon = 0;
    won.forEach(p => {
      const k = (p['Client'] || '').trim();
      if (!k) return;
      const ca = _ca(p, 'Bud');
      caMap[k] = (caMap[k] || 0) + ca;
      totalWon += ca;
    });

    const sorted = Object.entries(caMap).sort((a, b) => b[1] - a[1]);
    const topEntry = sorted[0];
    const share = totalWon > 0 && topEntry ? Math.round((topEntry[1] / totalWon) * 100) : 0;

    const top3CA = sorted.slice(0, 3).reduce((s, [, v]) => s + v, 0);
    const top3Share = totalWon > 0 ? Math.round((top3CA / totalWon) * 100) : 0;

    let riskLevel = 'low';
    if (share >= 50) riskLevel = 'critical';
    else if (share >= 40) riskLevel = 'high';
    else if (share >= 25) riskLevel = 'medium';

    return {
      topClient: topEntry ? topEntry[0] : null,
      share,
      riskLevel,
      top3Share,
      details: sorted.slice(0, 5).map(([client, ca]) => ({
        client,
        ca,
        share: totalWon > 0 ? Math.round((ca / totalWon) * 100) : 0
      }))
    };
  }

  /**
   * Funnel CA (valeur réelle, pas volume).
   * @returns {{ stages: Array<{label, ca, color}> }}
   */
  function funnelCA(projects, filters = {}) {
    const data = _applyFilters(projects, filters);
    const caEtudie = data.reduce((s, p) => s + _ca(p, 'Bud'), 0);
    const offres = data.filter(p => ProjectUtils.getStatus(p) === 'offre');
    const caOffre = offres.reduce((s, p) => s + _ca(p, 'Bud'), 0);
    const won = data.filter(p => ProjectUtils.getStatus(p) === 'obtenu');
    const caGagne = won.reduce((s, p) => s + _ca(p, 'Bud'), 0);

    return {
      stages: [
        { label: 'CA Étudié', ca: caEtudie, color: '#0099ff' },
        { label: 'CA Offres', ca: caOffre, color: '#8b78f8' },
        { label: 'CA Gagné', ca: caGagne, color: '#00d4aa' }
      ]
    };
  }

  /**
   * Analyse par type d'offre : conversion, CA moyen, délai moyen.
   * @returns {Array<{ type, total, won, lost, offers, winRate, avgCA, avgDelay }>}
   */
  function analysisByOfferType(projects, filters = {}) {
    const data = _applyFilters(projects, filters);
    const map = {};

    data.forEach(p => {
      const type = (p['Type de projet (Activité)'] || 'Non spécifié').trim();
      if (!map[type]) map[type] = { total: 0, won: 0, lost: 0, offers: 0, caTotal: 0, delays: [] };
      const s = ProjectUtils.getStatus(p);
      map[type].total++;
      if (s === 'obtenu') { map[type].won++; map[type].caTotal += _ca(p, 'Bud'); }
      else if (s === 'perdu') map[type].lost++;
      else if (s === 'offre') map[type].offers++;

      // Delay
      const start = ProjectUtils.parseDate(p['Date réception']);
      const end = ProjectUtils.parseDate(p['Date de retour demandée']);
      if (start && end) {
        const days = Math.max(0, Math.round((end - start) / 86400000));
        if (days > 0 && days < 1000) map[type].delays.push(days);
      }
    });

    return Object.entries(map)
      .map(([type, d]) => {
        const decided = d.won + d.lost;
        return {
          type,
          total: d.total,
          won: d.won,
          lost: d.lost,
          offers: d.offers,
          winRate: decided > 0 ? Math.round((d.won / decided) * 100) : null,
          avgCA: d.won > 0 ? Math.round(d.caTotal / d.won) : 0,
          avgDelay: d.delays.length > 0 ? Math.round(d.delays.reduce((a, b) => a + b, 0) / d.delays.length) : null
        };
      })
      .sort((a, b) => b.total - a.total);
  }

  /**
   * Score d'efficacité commerciale (0–100).
   * Basé sur : délai moyen cycle, conversion, CA moyen gagné.
   * @returns {{ score, label, breakdown }}
   */
  function commercialEfficiency(projects, filters = {}) {
    const data = _applyFilters(projects, filters);
    const breakdown = { delay: 0, conversion: 0, avgCA: 0 };

    // 1. Délai moyen cycle (0–35) — plus court = mieux
    const dt = avgDecisionTime(data);
    breakdown.delay = dt === null ? 17
      : dt <= 45 ? 35 : dt <= 90 ? 28 : dt <= 150 ? 18 : dt <= 250 ? 10 : 4;

    // 2. Conversion (0–40)
    const rate = conversionRate(data);
    breakdown.conversion = rate === null ? 20
      : rate >= 60 ? 40 : rate >= 45 ? 32 : rate >= 30 ? 22 : rate >= 15 ? 12 : 4;

    // 3. CA moyen gagné vs médiane marché (0–25)
    const avg = avgCAWon(data);
    breakdown.avgCA = avg >= 500000 ? 25 : avg >= 300000 ? 20 : avg >= 150000 ? 15 : avg >= 50000 ? 8 : 3;

    const score = Math.max(0, Math.min(100,
      breakdown.delay + breakdown.conversion + breakdown.avgCA));

    let label;
    if (score >= 80) label = 'Excellente';
    else if (score >= 60) label = 'Bonne';
    else if (score >= 40) label = 'Moyenne';
    else label = 'À améliorer';

    return { score, label, breakdown };
  }

  /**
   * Comparaison avancée A/B — uniformise Score, Projection, Croissance, Objectif, Concentration.
   * @returns {Object} Comparaison enrichie
   */
  function compareYearsAdvanced(projects, yearA, yearB, opts = {}) {
    const base = compareYears(projects, yearA, yearB);

    const scoreA = performanceScoreV2(projects, yearA, opts);
    const scoreB = performanceScoreV2(projects, yearB, opts);

    const concA = clientConcentration(projects, yearA);
    const concB = clientConcentration(projects, yearB);

    const effA = commercialEfficiency(_projectsForYear(projects, yearA));
    const effB = commercialEfficiency(_projectsForYear(projects, yearB));

    return {
      ...base,
      scoreComparison: {
        A: scoreA, B: scoreB,
        delta: scoreA.score - scoreB.score,
        positive: scoreA.score >= scoreB.score
      },
      concentrationComparison: {
        A: concA, B: concB,
        improved: concA.share < concB.share
      },
      efficiencyComparison: {
        A: effA, B: effB,
        delta: effA.score - effB.score,
        positive: effA.score >= effB.score
      }
    };
  }

  /**
   * Bilan automatique texte (narratif) — résumé exécutif.
   * @returns {{ headline, summary, strengths, risks, projection, recommendation }}
   */
  function generateExecutiveSummary(projects, year, objectivesConfig = {}, options = {}) {
    var requestedYear = parseInt(year, 10);
    if (!isFinite(requestedYear)) {
      var years = availableYears(projects);
      requestedYear = years.length ? years[0] : new Date().getFullYear();
    }
    const y = requestedYear;
    const dataY = _projectsForYear(projects, y);
    const dataPrev = _projectsForYear(projects, y - 1);
    const objectif = objectivesConfig[String(y)] || 0;
    const positiveOnly = options.positiveOnly || _displayMode.positiveOnly;

    const caGagne = totalCA(dataY, {}, 'Bud', 'obtenu');
    const caPrev = totalCA(dataPrev, {}, 'Bud', 'obtenu');
    const rate = conversionRate(dataY);
    const ratePrev = conversionRate(dataPrev);
    const conc = clientConcentration(projects, y);
    const proj = projectedYearEnd(projects, y, objectif);
    const eff = commercialEfficiency(dataY);

    const fmtV = v => ProjectUtils.formatMontant(v, true);

    // Headline
    let headline = '';
    if (objectif > 0) {
      const pctObj = Math.round((caGagne / objectif) * 100);
      headline = pctObj >= 100
        ? `🎉 Objectif ${y} atteint — ${fmtV(caGagne)} (${pctObj}%)`
        : `📊 ${y} : ${fmtV(caGagne)} sur ${fmtV(objectif)} (${pctObj}%)`;
    } else {
      headline = `📊 Bilan ${y} : ${fmtV(caGagne)} de CA gagné`;
    }

    // Summary
    const parts = [];
    if (caPrev > 0) {
      const growthPct = Math.round(((caGagne - caPrev) / caPrev) * 100);
      const dir = growthPct >= 0 ? 'hausse' : 'baisse';
      if (!positiveOnly || growthPct >= 0) {
        parts.push(`CA en ${dir} de ${growthPct >= 0 ? '+' : ''}${growthPct}% vs ${y - 1}`);
      }
    }
    if (rate !== null) parts.push(`Taux de conversion : ${rate}%`);
    parts.push(`${dataY.length} projets traités`);

    // Strengths
    const strengths = [];
    if (rate !== null && rate >= 40) strengths.push(`Excellent taux de conversion (${rate}%)`);
    if (caPrev > 0 && caGagne > caPrev) strengths.push(`Croissance du CA gagné vs N-1`);
    if (conc.riskLevel === 'low') strengths.push('Portefeuille client bien diversifié');
    if (eff.score >= 70) strengths.push(`Efficacité commerciale élevée (${eff.score}/100)`);
    if (objectif > 0 && caGagne >= objectif) strengths.push('Objectif annuel atteint ✅');

    // Risks
    const risks = [];
    if (!positiveOnly) {
      if (rate !== null && rate < 25) risks.push(`Taux de conversion faible (${rate}%)`);
      if (conc.riskLevel === 'high' || conc.riskLevel === 'critical') {
        risks.push(`Concentration client : ${conc.topClient} = ${conc.share}% du CA`);
      }
      if (ratePrev !== null && rate !== null && rate < ratePrev) {
        risks.push(`Conversion en baisse vs N-1 (${rate}% vs ${ratePrev}%)`);
      }
      if (objectif > 0 && proj.projectedCompletion < 80) {
        risks.push(`Projection fin d'année sous objectif (${proj.projectedCompletion}%)`);
      }
    }

    // Projection
    let projectionText = '';
    if (objectif > 0) {
      projectionText = `Projection EOY : ${fmtV(proj.projected)} (${proj.projectedCompletion}% de l'objectif)`;
    } else {
      projectionText = `Projection EOY : ${fmtV(proj.projected)}`;
    }

    // Recommendation
    const recommendations = [];
    if (conc.riskLevel !== 'low') recommendations.push('Diversifier le portefeuille client');
    if (rate !== null && rate < 30) recommendations.push('Analyser les causes des pertes pour améliorer la conversion');
    if (objectif > 0 && proj.projectedCompletion < 90) recommendations.push('Renforcer la prospection pour alimenter le pipeline');
    if (eff.score < 50) recommendations.push('Optimiser les délais de cycle commercial');

    return {
      headline,
      summary: parts.join(' · '),
      strengths,
      risks,
      projection: projectionText,
      recommendation: recommendations.length > 0 ? recommendations[0] : 'Maintenir la dynamique actuelle.'
    };
  }

  /* ──────────────────────────────────────────────────────
     18. EXPORT AVEC annee_finale
  ────────────────────────────────────────────────────── */

  /**
   * Enrichir chaque projet avec annee_finale = annee_manuel || annee.
   * À utiliser lors de l'export JSON pour conserver la source de vérité
   * et permettre la réimportation avec l'année correcte.
   *
   * @param {Array} projects  données brutes ou filtrées
   * @returns {Array}         copie avec annee_finale calculée sur chaque projet
   */
  function exportWithAnneefinale(projects) {
    return projects.map(p => {
      const annee_finale = _getAnneeFinale(p);
      return { ...p, annee_finale };
    });
  }

  /**
   * Mettre à jour annee_manuel sur un projet (modification manuelle de l'année).
   * Met à jour le projet dans le tableau fourni (in-place) et retourne le projet modifié.
   *
   * @param {Array}  projects    tableau de projets (window.DATA par ex.)
   * @param {number|string} id  identifiant du projet (p.id)
   * @param {string|number} anneeManuel  nouvelle année (ex: 2024)
   * @returns {Object|null}  projet modifié ou null si non trouvé
   */
  function setAnneeManuel(projects, id, anneeManuel) {
    const project = projects.find(p => String(p.id) === String(id));
    if (!project) {
      console.warn('[Analytics] setAnneeManuel : projet id=' + id + ' non trouvé');
      return null;
    }
    const parsedYear = parseInt(anneeManuel, 10);
    if (isNaN(parsedYear) || parsedYear < 1900 || parsedYear > 2100) {
      console.warn('[Analytics] setAnneeManuel : année invalide', anneeManuel);
      return null;
    }
    project.annee_manuel = parsedYear;
    console.log('[Analytics] annee_manuel=' + parsedYear + ' appliqué au projet id=' + id);
    return project;
  }

  /**
   * Créer un input HTML permettant la modification manuelle de l'année.
   * Injecte un champ dans containerId et met à jour project.annee_manuel
   * + déclenche un event 'anneeManuelChange' sur le document.
   *
   * @param {string} containerId  id du conteneur HTML cible
   * @param {Object} project      objet projet à modifier
   * @param {Array}  allProjects  tableau complet (window.DATA)
   * @param {Function} [onUpdate] callback(project) appelé après mise à jour
   */
  function renderAnneeManuelInput(containerId, project, allProjects, onUpdate) {
    const el = document.getElementById(containerId);
    if (!el || !project) return;

    const currentYear = _getAnneeFinale(project) || '';
    const hasManuel = project.annee_manuel !== undefined && project.annee_manuel !== null;

    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:.5rem;font-family:var(--mono, monospace);">
        <label style="font-size:.72rem;color:var(--dust,#9fb3c8);white-space:nowrap;">
          Année ${hasManuel ? '<span style="color:#f5b740;" title="Année modifiée manuellement">✎</span>' : ''}
        </label>
        <input
          id="annee-manuel-input-${project.id}"
          type="number"
          min="1990" max="2100"
          value="${currentYear}"
          style="
            width:72px;padding:.25rem .4rem;
            background:rgba(255,255,255,.05);
            border:1px solid rgba(0,212,170,.3);
            border-radius:5px;
            color:var(--snow,#dce8f5);
            font-family:var(--mono,monospace);
            font-size:.78rem;
            text-align:center;
          "
          placeholder="${new Date().getFullYear()}"
          title="Modifier l'année manuellement (prioritaire sur annee et date création)"
        />
        <button
          onclick="(function(){
            var inp = document.getElementById('annee-manuel-input-${project.id}');
            if (!inp) return;
            var val = inp.value.trim();
            if (!val) { delete window.DATA.find(function(p){return String(p.id)==='${project.id}';}).annee_manuel; }
            else {
              Analytics.setAnneeManuel(window.DATA, '${project.id}', val);
            }
            document.dispatchEvent(new CustomEvent('anneeManuelChange', { detail: { id: '${project.id}', annee: val } }));
          })()"
          style="
            padding:.25rem .6rem;
            background:rgba(0,212,170,.15);
            border:1px solid rgba(0,212,170,.4);
            border-radius:5px;
            color:#00d4aa;
            font-size:.72rem;
            cursor:pointer;
          "
        >OK</button>
      </div>`;

    // Aussi écouter "Enter"
    const input = document.getElementById(`annee-manuel-input-${project.id}`);
    if (input) {
      input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
          const val = this.value.trim();
          if (!val) {
            delete project.annee_manuel;
          } else {
            setAnneeManuel(allProjects, project.id, val);
          }
          document.dispatchEvent(new CustomEvent('anneeManuelChange', { detail: { id: project.id, annee: val } }));
          if (typeof onUpdate === 'function') onUpdate(project);
        }
      });
    }
  }

  

  const Analytics = Object.freeze({
    // Statuts
    countByStatus,
    conversionRate,

    // CA
    totalCA,
    caByStatus,
    caByClient,
    caByZone,
    caByYear,
    avgCAWon,
    pipelineCA,

    // Comptage
    countByClientStatus,
    wonByZone,
    lostByClient,
    wonByClient,
    countByOfferType,
    countByPartner,

    // Conversion
    winRateByClient,
    winRateByZone,

    // Délais
    avgDelayByStatus,
    avgDecisionTime,
    overdueOffers,
    urgentOffers,

    // Puissance
    avgPowerWon,
    totalMachines,
    scatterPowerVsCA,

    // Funnel
    commercialFunnel,

    // Utilitaires
    topActiveClient,
    responseRate,

    // KPIs complets
    computeAllKPIs,

    // ── Système de date dynamique ──
    setActiveDateField,
    getProjectDate,
    getProjectYear,
    getCAGagneByYear,

    // ── Helpers métier centralisés ──
    getCAEtudie,
    getCAGagne,
    getCAWinProba,
    topSocieteScore,

    // Nouveaux graphiques
    caByMonth,
    caHistogram,
    pipelineByStage,
    temporalHeatmap,
    filterByDateRange,
    autoInsights,

    // ── v3.0 — Intelligence décisionnelle ──
    volumeByMonth,
    winRateByMonth,
    pipelineWeighted,
    comparePeriods,
    forecastYearEnd,
    performanceScore,
    diagnostics,

    // ── v4.0 — Comparaison années ──
    compareYears,
    availableYears,

    // ── v4.1 — Comparaison objectifs ──
    compareObjective,

    // ── v4.2 — Historique multi-années ──
    objectiveByYear,
    objectiveTrend,

    // ── v4.3 — Années fixes garanties ──
    objectiveTrendFixedYears,

    // ── v5.0 — Intelligence décisionnelle avancée ──
    performanceScoreV2,
    projectedYearEnd,
    cumulativeGrowth,
    clientConcentration,
    funnelCA,
    analysisByOfferType,
    commercialEfficiency,
    compareYearsAdvanced,
    generateExecutiveSummary,
    displayMode: _displayMode,

    // ── v6.0 — annee_manuel + export enrichi ──
    exportWithAnneefinale,
    setAnneeManuel,
    renderAnneeManuelInput,
    getAnneeFinale: _getAnneeFinale,  // exposé pour usage externe



    // ── v8.0 — CA tous modes par année ──
    caByYearAllModes,

    // Config
    config: _config,
    compareConfig: _compareConfig,   // non-gelé → mutable par l'UI

    // Insights
    insights: AnalyticsInsights
  });

  global.Analytics = Analytics;

  console.log('%c📊 Analytics.js v9.0 chargé — Sélecteur date global + Bud/Statut/WinProba source unique', 'color:#00d4aa;font-weight:700');

})(typeof window !== 'undefined' ? window : global);
