/**
 * DATA FILTER ENGINE v2.2 — Moteur de Filtrage des Données
 * =========================================================
 *
 * CORRECTIFS v2.2 :
 *  ✅  Connexion automatique à FilterManager (subscribe) dans init()
 *  ✅  filteredData initialisé = rawData dès le départ
 *  ✅  applyFilters() est appelé en PREMIER par FilterManager
 *  ✅  getFilteredData() retourne rawData si filteredData vide
 *  ✅  Re-application automatique des filtres après setRawData()
 *  ✅  Protection contre les datasets vides après changement de date
 *  ✅  Logs explicites pour traçabilité
 *
 * RÈGLE ABSOLUE :
 *  ChartDrillDown NE filtre JAMAIS — il lit uniquement getFilteredData()
 *  DataFilterEngine est le SEUL à appliquer les filtres.
 */

// ── GUARD ANTI-REDÉCLARATION ────────────────────────────────────────────────
if (!window.DataFilterEngine) {
window.DataFilterEngine = (() => {
  'use strict';

  let rawData      = [];
  let filteredData = [];

  /* ── Nettoyage projet ────────────────────────────────────────── */
  const INVALID = new Set([
    '', 'null', 'undefined',
    'non spécifié', 'non specifie', 'non défini', 'non defini',
    'n/a', 'na', '-', '?', 'inconnu', 'unknown',
  ]);

  function cleanValue(value) {
    if (value === null || value === undefined) return null;
    const str = String(value).trim();
    return INVALID.has(str.toLowerCase()) ? null : str;
  }

  function _cleanProject(project) {
    const cleaned = { ...project };
    Object.keys(cleaned).forEach(key => {
      const value = cleaned[key];
      if (value === null || value === undefined) { cleaned[key] = null; return; }
      if (typeof value === 'string') {
        const trimmed = value.trim();
        cleaned[key] = INVALID.has(trimmed.toLowerCase()) ? null : trimmed;
      }
    });
    return cleaned;
  }

  /* ── Chargement des données brutes ───────────────────────────── */
  function setRawData(data) {
    if (!Array.isArray(data)) {
      console.error('[DataFilterEngine] setRawData : argument doit être un array');
      return false;
    }

    // ── Injection _annee — SOURCE UNIQUE DE VÉRITÉ ─────────────────
    rawData = data.map(p => {
      const cleaned = _cleanProject(p);

      if (typeof Analytics !== 'undefined' && typeof Analytics.getProjectYear === 'function') {
        cleaned._annee = Analytics.getProjectYear(cleaned);
      } else if (!cleaned._annee) {
        const raw = cleaned['Date réception'];
        if (raw && raw !== 'x' && raw !== 'X' && raw !== '') {
          const parts = String(raw).split('/');
          if (parts.length === 3) {
            let yr = parseInt(parts[2], 10);
            if (yr > 0 && yr < 100) yr += 2000;
            cleaned._annee = yr > 1900 ? String(yr) : null;
          }
        }
      }

      return cleaned;
    });

    // ✅ CORRECTION v2.2 : Re-appliquer les filtres actifs automatiquement
    if (typeof FilterManager !== 'undefined' && FilterManager.getFilters) {
      const activeFilters = FilterManager.getFilters();
      if (activeFilters && activeFilters.length > 0) {
        filteredData = applyFilters(activeFilters);
        console.log(`[DataFilterEngine] ✅ Filtres réappliqués après setRawData() — ${filteredData.length}/${rawData.length} projets`);
      } else {
        filteredData = rawData.slice();
      }
    } else {
      filteredData = rawData.slice();
    }

    const activeField = (typeof Analytics !== 'undefined' && Analytics.config)
      ? Analytics.config.activeDateField : 'Date réception';
    console.log(`[DataFilterEngine] ${rawData.length} projets chargés — _annee via "${activeField}"`);
    return true;
  }

  /* ── Application des filtres ─────────────────────────────────── */
  function applyFilters(filters) {
    if (!Array.isArray(filters)) {
      console.error('[DataFilterEngine] applyFilters : argument doit être un array');
      filteredData = rawData.slice();
      return filteredData;
    }

    if (filters.length === 0) {
      filteredData = rawData.slice();
      console.log('[DataFilterEngine] Aucun filtre — données brutes retournées');
      return filteredData;
    }

    const filtersByType = {};
    filters.forEach(f => {
      if (!filtersByType[f.type]) filtersByType[f.type] = [];
      filtersByType[f.type].push(f.value);
    });

    filteredData = rawData.filter(project => {
      for (const [type, values] of Object.entries(filtersByType)) {

        // ── Filtre dateRange ────────────────────────────────────
        if (type === 'dateRange') {
          const rangeFilter = values[0];
          if (rangeFilter && typeof rangeFilter === 'object') {
            const { start, end, field = 'creation' } = rangeFilter;
            const raw = project[field] || project.date_remise_offre || project.creation;
            if (!raw) return false;
            const d = new Date(raw);
            if (isNaN(d.getTime())) return false;
            if (start && d < new Date(start))              return false;
            if (end   && d > new Date(end + 'T23:59:59')) return false;
          }
          continue;
        }

        let projectValue;
        if (type === 'Statut') {
          const statusKey = (typeof ProjectUtils !== 'undefined')
            ? ProjectUtils.getStatus(project)
            : cleanValue(project['Statut']);
          const matches = values.some(fv => {
            const cleanFV = cleanValue(fv);
            return cleanFV !== null && (statusKey === cleanFV || 
              (typeof ProjectUtils !== 'undefined' && ProjectUtils.parseStatusKey(cleanFV) === statusKey));
          });
          if (!matches) return false;
          continue;
        } else if (type === '_annee') {
          const annee = project._annee ? String(project._annee) : null;
          const matches = values.some(fv => cleanValue(fv) === annee);
          if (!matches) return false;
          continue;
        } else {
          projectValue = cleanValue(project[type]);
        }
        
        if (!projectValue) return false;

        const matches = values.some(fv => {
          const cleanFV = cleanValue(fv);
          return cleanFV !== null && projectValue === cleanFV;
        });

        if (!matches) return false;
      }
      return true;
    });

    console.log(`[DataFilterEngine] ${filteredData.length}/${rawData.length} projets après filtrage`);
    return filteredData;
  }

  /* ── Accesseurs ──────────────────────────────────────────────── */
  function getFilteredData() {
    if (filteredData.length === 0 && rawData.length > 0) {
      console.warn('[DataFilterEngine] getFilteredData() — filteredData vide, retour rawData');
      return rawData.slice();
    }
    return filteredData;
  }

  function getRawData()        { return rawData; }
  function getFilteredCount()  { return filteredData.length; }
  function getTotalCount()     { return rawData.length; }

  /* ── Agrégations ─────────────────────────────────────────────── */
  function groupBy(field, data = null) {
    const dataset = data || getFilteredData();
    const groups  = {};
    dataset.forEach(project => {
      const value = cleanValue(project[field]);
      if (!value) return;
      if (!groups[value]) groups[value] = [];
      groups[value].push(project);
    });
    return groups;
  }

  function countBy(field, data = null) {
    const groups = groupBy(field, data);
    const counts = {};
    Object.keys(groups).forEach(k => { counts[k] = groups[k].length; });
    return counts;
  }

  function sumBy(field, aggregateField, data = null) {
    const groups = groupBy(field, data);
    const sums   = {};
    Object.keys(groups).forEach(k => {
      sums[k] = groups[k].reduce((s, p) => s + (parseFloat(p[aggregateField]) || 0), 0);
    });
    return sums;
  }

  function getTopN(field, n = 10, data = null) {
    const counts = countBy(field, data);
    return Object.fromEntries(
      Object.entries(counts).sort(([, a], [, b]) => b - a).slice(0, n)
    );
  }

  function getStats(data = null) {
    const dataset = data || getFilteredData();
    const stats = { total: dataset.length, obtenu: 0, perdu: 0, offre: 0, autre: 0 };
    dataset.forEach(project => {
      const status = (typeof ProjectUtils !== 'undefined')
        ? ProjectUtils.getStatus(project)
        : (project.statut || 'autre').toLowerCase();
      if (stats.hasOwnProperty(status)) stats[status]++;
    });
    return stats;
  }

  /* ── Debug ───────────────────────────────────────────────────── */
  function debug() {
    console.group('[DataFilterEngine] DEBUG');
    console.log('Total:', getTotalCount());
    console.log('Filtrés:', getFilteredCount());
    console.log('Stats:', getStats());
    console.groupEnd();
  }

  /* ── Initialisation ──────────────────────────────────────────── */
  function init(data) {
    console.log('[DataFilterEngine] Initialisation...');

    if (data) {
      setRawData(data);
    } else if (typeof window !== 'undefined' && window.DATA) {
      setRawData(window.DATA);
    } else {
      console.warn('[DataFilterEngine] Aucune donnée fournie à init()');
    }

    if (typeof FilterManager !== 'undefined') {
      if (!window.DataFilterEngine || !window.DataFilterEngine._fmSubscribed) {
        FilterManager.subscribe(function(filters) {
          applyFilters(filters);
        });
        if (window.DataFilterEngine) window.DataFilterEngine._fmSubscribed = true;
        console.log('[DataFilterEngine] ✅ Connecté à FilterManager (1 seul abonnement)');
      } else {
        console.log('[DataFilterEngine] FilterManager déjà abonné — skip subscribe');
      }
      applyFilters(FilterManager.getFilters());
    } else {
      filteredData = rawData.slice();
      console.warn('[DataFilterEngine] FilterManager absent — filteredData = rawData');
    }

    console.log('[DataFilterEngine] ✅ Prêt (v2.2)');
  }

  /* ── API publique ────────────────────────────────────────────── */
  return {
    init,
    setRawData,
    applyFilters,
    getFilteredData,
    getRawData,
    getFilteredCount,
    getTotalCount,
    groupBy,
    countBy,
    sumBy,
    getTopN,
    getStats,
    cleanValue,
    debug,
  };
})();
}