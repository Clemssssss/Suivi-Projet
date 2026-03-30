if (!window.DataFilterEngine) {
  window.DataFilterEngine = (() => {
  'use strict';
  let _rawData = [];
  let _filteredData = [];
  const _subs = [];

  const INVALID = new Set(['', 'null', 'undefined', 'non spécifié', 'non specifie',
    'non défini', 'non defini', 'n/a', 'na', '-', '?', 'inconnu', 'unknown', 'none', 'aucun']);

  function cleanValue(v) {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    return INVALID.has(s.toLowerCase()) ? null : s;
  }

  let _fmSubscribed = false; // Guard : évite les abonnements FilterManager multiples

  function init(rawData) {
    _rawData = Array.isArray(rawData) ? rawData : [];
    _filteredData = _rawData.slice(); // jamais vide au départ

    // Connexion FilterManager EN PREMIER — une seule fois
    if (typeof FilterManager !== 'undefined' && !_fmSubscribed) {
      FilterManager.subscribe((filters) => {
        applyFilters(filters);
      });
      _fmSubscribed = true;
      console.log('[DataFilterEngine] ✅ Connecté à FilterManager');
    }

    // Appliquer filtres existants immédiatement
    const initFilters = (typeof FilterManager !== 'undefined') ? FilterManager.getFilters() : [];
    applyFilters(initFilters);
    console.log('[DataFilterEngine] init() — ' + _rawData.length + ' projets chargés');
  }

  function applyFilters(filters) {
    if (!_rawData.length) { _filteredData = []; return; }
    let data = _rawData;

    filters.forEach(f => {
      if (f.type === 'dateRange') {
        if (f.value && (f.value.start || f.value.end)) {
          data = data.filter(p => {
            const field = f.value.field || 'Date réception';
            const rawDate = p[field] || p['Date réception'];
            if (!rawDate) return false;
            // Parse DD/MM/YY format
            let d;
            if (typeof rawDate === 'string' && rawDate.includes('/')) {
              const pts = rawDate.split('/'); if(pts.length===3){let y=parseInt(pts[2],10);if(y<100)y+=2000; d=new Date(y,parseInt(pts[1],10)-1,parseInt(pts[0],10));}
            } else { d = new Date(rawDate); }
            if (!d) return false;
            if (f.value.start && d < new Date(f.value.start)) return false;
            if (f.value.end && d > new Date(f.value.end)) return false;
            return true;
          });
        }
      } else if (f.type === 'Statut') {
        data = data.filter(p => {
          if (typeof ProjectUtils !== 'undefined') {
            const sk = ProjectUtils.getStatus(p);
            return sk === f.value || ProjectUtils.parseStatusKey(f.value) === sk;
          }
          return (p['Statut'] || '').toLowerCase() === f.value.toLowerCase();
        });
      } else if (f.type === '_annee') {
        data = data.filter(p => {
          let yr = p._annee;
          if (!yr && p['Date réception']) {
            const pts = String(p['Date réception']).split('/');
            if (pts.length === 3) { let y=parseInt(pts[2],10); if(y<100)y+=2000; yr=String(y); }
          }
          return yr === String(f.value);
        });
      } else {
        data = data.filter(p => {
          const pv = cleanValue(p[f.type]);
          return pv !== null && pv === f.value;
        });
      }
    });

    const prev = _filteredData.length;
    _filteredData = data;
    console.log(`[DataFilterEngine] ${_filteredData.length}/${_rawData.length} projets après filtrage`);
    _notify();
  }

  function getFilteredData() {
    return _filteredData.slice();
  }

  function getRawData() { return _rawData.slice(); }

  function setFilteredData(data) {
    if (!Array.isArray(data)) {
      console.error('[DataFilterEngine] setFilteredData : argument doit être un array');
      return false;
    }
    _filteredData = data.slice();
    _notify();
    return true;
  }

  function subscribe(fn) { _subs.push(fn); }

  function _notify() {
    _subs.forEach(fn => { try { fn(_filteredData.slice()); } catch(e) {} });
  }

  function debug() {
    console.log('[DataFilterEngine] raw:', _rawData.length, '| filtered:', _filteredData.length);
  }

  /* ── setRawData : API principale pour import CSV ─────────────────────────
     Remplace les données brutes sans réinstancier le module.
     Source unique de vérité pour _annee (via Analytics.getProjectYear).
  ── */
  function setRawData(data) {
    if (!Array.isArray(data)) {
      console.error('[DataFilterEngine] setRawData : argument doit être un array');
      return false;
    }
    _rawData = data.map(function(p) {
      const cleaned = Object.assign({}, p);
      if (typeof Analytics !== 'undefined' && typeof Analytics.getProjectYear === 'function') {
        cleaned._annee = Analytics.getProjectYear(cleaned);
      } else if (!cleaned._annee) {
        const raw = cleaned['Date réception'];
        if (raw && raw.trim && raw.trim() !== '') {
          const parts = String(raw).split('/');
          if (parts.length === 3) {
            let yr = parseInt(parts[2], 10);
            if (yr > 0 && yr < 100) yr += 2000;
            cleaned._annee = yr > 1900 ? String(yr) : null;
          }
        }
      }
      if (cleaned._annee != null) cleaned._annee = String(cleaned._annee);
      return cleaned;
    });
    _filteredData = _rawData.slice();
    const activeField = (typeof Analytics !== 'undefined' && Analytics.config)
      ? Analytics.config.activeDateField : 'Date réception';
    console.log('[DataFilterEngine] setRawData() — ' + _rawData.length + ' projets via "' + activeField + '"');
    return true;
  }

  return { init, setRawData, setFilteredData, applyFilters, getFilteredData, getRawData, subscribe, cleanValue, debug };
})();
}
