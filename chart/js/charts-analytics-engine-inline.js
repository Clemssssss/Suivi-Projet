'use strict';

/* ═══════════════════════════════════════════════════════════
   ANALYTICS ENGINE — source unique de vérité
═══════════════════════════════════════════════════════════ */
if (!window.AE) {
  window.AE = (() => {
  const st = {
    raw: [], filters: {}, year: '', search: '',
    caMode: 'Bud', subs: [],  // [CORRIGÉ v2] 'Bud' = source unique de vérité (data.js)
    energyType: '',  // '' = tous | 'eolien' | 'photovoltaique'
    selection: null
  };

  const EMPTY = new Set([
    '', 'null', 'undefined', 'non spécifié', 'non specifie',
    'non défini', 'non defini', 'n/a', 'na', '-', '?',
    'inconnu', 'unknown', 'none', 'aucun'
  ]);
  const EMPTY_LBL = 'Non renseigné';

  function nv(v) {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    return EMPTY.has(s.toLowerCase()) ? null : s;
  }

  function projectKey(p) {
    if (!p || typeof p !== 'object') return '';
    return [
      p['N°- AO'] || '',
      p['Date réception'] || '',
      p['Client'] || '',
      p['Dénomination'] || '',
      p['Type de projet (Activité)'] || '',
      p['Zone Géographique'] || ''
    ].join('||');
  }

  function init(d) {
    if (!Array.isArray(d)) { st.raw = []; return; }
    // FIX P1 : injecter _annee sur chaque projet via Analytics.getProjectYear()
    // Obligatoire pour que AE.setYear() (year-filter) filtre correctement.
    // DataFilterEngine fait la même chose dans setRawData() — on reste cohérents.
    st.raw = d.map(function(p) {
      if (p._annee !== undefined && p._annee !== null && String(p._annee).trim() !== '') return p;
      // Calculer _annee si absent
      var annee = null;
      if (typeof Analytics !== 'undefined' && Analytics.getProjectYear) {
        annee = Analytics.getProjectYear(p);
      } else {
        // Fallback minimal DD/MM/YY
        var raw = p['Date réception'];
        if (raw && raw !== 'x' && raw !== 'X' && raw !== '') {
          var parts = String(raw).split('/');
          if (parts.length === 3) {
            var yr = parseInt(parts[2], 10);
            if (yr > 0 && yr < 100) yr += 2000;
            annee = yr > 1900 ? String(yr) : null;
          }
        }
      }
      if (annee === p._annee) return p; // pas de changement
      return Object.assign({}, p, { _annee: annee });
    });
  }

  // ── Détection du type d'énergie ──────────────────────────────────
  // Cherche "éolien" ou "eolien" (insensible à la casse et aux accents)
  // dans le nom du projet (Dénomination) et dans le type de projet.
  // Tout ce qui ne contient pas "éolien" est considéré photovoltaïque.
  function _isEolien(p) {
    const EOLIEN = /[eé]olien/i;
    const nom    = String(p['Dénomination'] || '');
    const type   = String(p['Type de projet (Activité)'] || '');
    return EOLIEN.test(nom) || EOLIEN.test(type);
  }

  function getFiltered() {
    let d = st.raw;
    if (st.year) {
      const y = parseInt(st.year, 10);
      d = d.filter(p => parseInt(p._annee, 10) === y);
    }
    if (st.search) {
      const q = st.search.toLowerCase();
      d = d.filter(p => [p['Dénomination'], p['Client'], p['Zone Géographique'], p['Type de projet (Activité)'], p['N°- AO'] || '']
        .join(' ').toLowerCase().includes(q));
    }
    // ── Filtre énergie ────────────────────────────────────────────
    if (st.energyType === 'eolien') {
      d = d.filter(p => _isEolien(p));
    } else if (st.energyType === 'photovoltaique') {
      d = d.filter(p => !_isEolien(p));
    }
    for (const [k, v] of Object.entries(st.filters)) {
      if (v == null) continue;
      d = d.filter(p => {
        if (k === 'Statut') return ProjectUtils.getStatus(p) === v || ProjectUtils.parseStatusKey(v) === ProjectUtils.getStatus(p);
        if (k === '_annee') {
          const py = p._annee ? String(p._annee) : '';
          return py === String(v);
        }
        const pv = nv(p[k]);
        if (v === EMPTY_LBL) return pv === null;
        return pv !== null && pv === v;
      });
    }
    if (st.selection && st.selection.keys && st.selection.keys.size) {
      d = d.filter(p => st.selection.keys.has(projectKey(p)));
    }
    return d;
  }

  function toggleFilter(k, v) {
    if (st.filters[k] === v) {
      delete st.filters[k];
      notify('Filtre supprimé', v, 'info', 1800);
    } else {
      st.filters[k] = v;
      notify('Filtre appliqué', `${FL[k] || k} : ${v}`, 'success', 1800);
    }
    push();
  }

  function removeFilter(k) { if (k in st.filters) { delete st.filters[k]; push(); } }
  function clearSelection(silent = false) {
    if (!st.selection) return;
    st.selection = null;
    push();
    if (!silent) notify('Sélection effacée', 'Retour au périmètre complet', 'info', 1800);
  }
  function setSelection(projects, label = '') {
    const items = Array.isArray(projects) ? projects : [];
    const keys = new Set(items.map(projectKey).filter(Boolean));
    if (!keys.size) {
      clearSelection(true);
      notify('Sélection impossible', 'Aucune donnée exploitable sur ce graphique', 'warning', 2200);
      return;
    }
    const token = Array.from(keys).sort().join('##');
    if (st.selection && st.selection.token === token) {
      clearSelection(true);
      notify('Sélection effacée', label || 'Retour au périmètre complet', 'info', 1800);
      return;
    }
    st.selection = {
      token,
      keys,
      label: label || 'Sélection graphique',
      count: items.length
    };
    push();
    notify('Filtre graphique appliqué', (label || 'Sélection graphique') + ' • ' + items.length + ' projet(s)', 'success', 2200);
  }
  function clearAll()      { st.filters = {}; st.selection = null; push(); notify('Filtres effacés', 'Tous les projets', 'info', 1800); }
  function setYear(y)      { st.year = y; st.filters = {}; push(); }
  function getSelection()  { return st.selection ? { label: st.selection.label, count: st.selection.count } : null; }
  function setSearch(q)    { st.search = q.trim(); push(); }
  function setCAMode(m)    { st.caMode = m; push(); }
  function getCAMode()     { return st.caMode; }
  function getFilters()    { return { ...st.filters }; }
  function setEnergyType(v){ st.energyType = v || ''; push(); }
  function getEnergyType() { return st.energyType; }
  function subscribe(fn)   { st.subs.push(fn); }

  function push() {
    updateURL();
    st.subs.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
  }

  function getURL() {
    const p = new URLSearchParams();
    if (st.year) p.set('year', st.year);
    if (st.caMode !== 'Bud') p.set('ca', st.caMode); // [CORRIGÉ v2]
    for (const [k, v] of Object.entries(st.filters)) p.set('f_' + k, v);
    return p.toString();
  }

  function loadFromURL() {
    const p = new URLSearchParams(window.location.search);
    if (p.has('year')) st.year = p.get('year');
    if (p.has('ca'))   st.caMode = p.get('ca');
    for (const [k, v] of p.entries())
      if (k.startsWith('f_')) st.filters[k.slice(2)] = v;
  }

  function updateURL() {
    const q = getURL();
    history.replaceState(null, '', window.location.pathname + (q ? '?' + q : ''));
  }

  return { init, getFiltered, getRaw: () => st.raw, toggleFilter, removeFilter, clearAll,
           setYear, setSearch, setCAMode, getCAMode, getFilters, setSelection, clearSelection, getSelection,
           setEnergyType, getEnergyType,
           subscribe, nv, loadFromURL, getURL, EMPTY_LBL };
})();
}

/* ─── Labels & couleurs ─── */
const FL = {
  'Client': 'Client', 'Zone Géographique': 'Zone', 'Statut': 'Statut',
  'Type de projet (Activité)': 'Type projet', '_annee': 'Année'
};
const PAL = [
  'rgba(0,212,170,.82)',  'rgba(0,153,255,.82)',  'rgba(245,183,64,.82)',
  'rgba(139,120,248,.82)','rgba(239,68,68,.82)',   'rgba(16,185,129,.82)',
  'rgba(236,72,153,.82)', 'rgba(251,146,60,.82)',  'rgba(99,102,241,.82)',
  'rgba(20,184,166,.82)',
  // 10 couleurs supplémentaires — évite les répétitions pour les graphiques > 10 éléments
  'rgba(225,29,72,.82)',  'rgba(14,165,233,.82)',  'rgba(217,119,6,.82)',
  'rgba(124,58,237,.82)', 'rgba(5,150,105,.82)',   'rgba(219,39,119,.82)',
  'rgba(234,88,12,.82)',  'rgba(8,145,178,.82)',   'rgba(147,51,234,.82)',
  'rgba(101,163,13,.82)'
];
const SC = {
  obtenu: 'rgba(0,212,170,.82)',
  perdu:  'rgba(255,77,109,.82)',
  offre:  'rgba(0,153,255,.82)'
};

// Axes Chart.js thème sombre
const xD  = { ticks: { color: '#9fb3c8' }, grid: { display: false } };
const yD  = { ticks: { color: '#9fb3c8' }, grid: { color: 'rgba(255,255,255,.06)' } };
const yCA = { ticks: { color: '#9fb3c8', callback: v => fmt(v) }, grid: { color: 'rgba(255,255,255,.06)' } };
const xCA = { ticks: { color: '#9fb3c8', callback: v => fmt(v) }, grid: { color: 'rgba(255,255,255,.06)' } };
const TT  = {
  backgroundColor: 'rgba(6,12,20,.96)',
  borderColor: 'rgba(0,212,170,.35)', borderWidth: 1,
  titleColor: '#dce8f5', bodyColor: '#9fb3c8',
  padding: 12, cornerRadius: 8,
  titleFont: { family: "'DM Mono', monospace", size: 11, weight: '600' },
  bodyFont:  { family: "'DM Sans', system-ui, sans-serif", size: 12 },
  displayColors: true,
  boxWidth: 10, boxHeight: 10, boxPadding: 4,
  usePointStyle: true
};

function fmt(v)   { return ProjectUtils.formatMontant(v, true); }
function pCA(v)   { return ProjectUtils.parseMontant(v) || 0; }
// [CORRIGÉ v2] getBud() — source unique de vérité pour les montants
// Remplace pCA(p[cm]) dans createAllCharts() : cm peut valoir 'ca_etudie' (champ inexistant)
function getBud(p) { return ProjectUtils.parseMontant(p['Bud']) || 0; }
// getCAValue(p, cm) — source unique pour lire le montant selon le mode CA
// cm = 'Bud' (étudié, tous projets) | 'ca_gagne' (gagné, filtre obtenu) | autre → Bud
function getCAValue(p, cm) {
  var bud = getBud(p);
  if (cm === 'ca_gagne') {
    // CA Gagné : montant uniquement si le projet est obtenu
    return (typeof ProjectUtils !== 'undefined' && ProjectUtils.getStatus(p) === 'obtenu') ? bud : 0;
  }
  // CA Étudié = Bud de tous les projets (cm='Bud' ou autre)
  return bud;
}
function dim(c)   { return c ? c.replace(/[\d.]+\)$/, '0.16)') : c; }
function cset(labels, fk, def) {
  const av = AE.getFilters()[fk];
  return labels.map((l, i) => {
    const b = def || PAL[i % PAL.length];
    return av ? (l === av ? b : dim(b)) : b;
  });
}


/* ═══════════════════════════════════════════════════════════
   NOTIFICATIONS
═══════════════════════════════════════════════════════════ */
function notify(title, msg, type = 'info', dur = 2500) {
  const wrap = document.getElementById('notif-wrap');
  if (!wrap) return;
  const el = document.createElement('div');
  el.className = `notif ${type}`;
  const ico = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  el.innerHTML = `
    <div class="notif-icon">${ico[type] || 'ℹ️'}</div>
    <div>
      <div class="notif-title">${title}</div>
      <div class="notif-msg">${msg}</div>
    </div>`;
  wrap.appendChild(el);
  if (dur > 0) setTimeout(() => {
    el.classList.add('hiding');
    setTimeout(() => el.remove(), 300);
  }, dur);
}


/* ═══════════════════════════════════════════════════════════
   CHART MANAGER
═══════════════════════════════════════════════════════════ */
const CM = (() => {
  const ins = {};

  function destroy(id) {
    // CORRECTION 10 : destroy() + suppression référence obligatoires avant re-render
    if (ins[id]) {
      try { ins[id].destroy(); } catch(e) { console.warn('[ChartLeak] destroy() échoué pour', id, e); }
      delete ins[id];
    }
    // Nettoyage ChartFilterController (évite listener orphelin)
    if (typeof ChartFilterController !== 'undefined' && ChartFilterController.unregisterChart) {
      ChartFilterController.unregisterChart(id);
    }
  }

  function create(id, cfg, click = null) {
    // FIX P4 : logs explicites pour diagnostiquer les échecs silencieux
    const card = document.querySelector(`[data-chart-id="${id}"]`);
    if (!card) {
      // data-chart-id manquant ou DOM non prêt — fallback : chercher par canvas parent
      const cv0 = document.getElementById(id);
      if (!cv0) {
        console.warn('[CM.create] Canvas introuvable ET aucune card pour:', id);
        return null;
      }
      // Canvas trouvé mais pas de card avec data-chart-id → créer quand même
      console.info('[CM.create] Pas de data-chart-id pour', id, '— création directe sur canvas');
    } else if (card.classList.contains('hidden') || card.classList.contains('hidden-chart')) {
      return null; // card masquée intentionnellement — ne pas loguer
    }
    destroy(id);
    const cv = document.getElementById(id);
    if (!cv) {
      console.warn('[CM.create] Canvas #' + id + ' introuvable dans le DOM');
      return null;
    }

    // Réinitialiser canvas
    cv.style.display = '';
    card.querySelectorAll('.chart-empty').forEach(e => e.remove());

    // Options de base
    cfg.options = cfg.options || {};
    cfg.options.plugins = cfg.options.plugins || {};
    cfg.options.plugins.tooltip = Object.assign({}, TT, cfg.options.plugins.tooltip || {});
    const _reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    cfg.options.animation  = _reducedMotion ? false : (cfg.options.animation || { duration: 420 });
    cfg.options.responsive = true;
    cfg.options.maintainAspectRatio = false;

    // Vérification données
    // FIX P2 : hasData — critère robuste (v > 0 était trop strict)
    // Un graphique est "sans données" UNIQUEMENT si toutes les valeurs sont null/undefined/NaN
    // ET qu'il n'y a aucun label. Les valeurs 0 légitimes (counts, CA nul) sont autorisées.
    const hasData = (() => {
      if (!cfg.data || !cfg.data.datasets || !cfg.data.datasets.length) return false;
      // Labels présents → considérer qu'il y a des données (ex: donut, bar horizontal)
      if (cfg.data.labels && cfg.data.labels.length > 0) {
        // Vérifier qu'au moins un dataset a des données numériques (pas tout null/NaN)
        return cfg.data.datasets.some(ds =>
          ds.data && ds.data.some(v => v !== null && v !== undefined && !isNaN(v))
        );
      }
      return cfg.data.datasets.some(function(ds) {
        if (!ds.data || !ds.data.length) return false;
        return ds.data.some(function(v) {
          if (v === null || v === undefined) return false;
          if (typeof v === 'object') return (v.x!=null&&v.x!==0)||(v.y!=null&&v.y!==0)||(v.r!=null&&v.r>0);
          return !isNaN(v);
        });
      });
    })();
    if (!hasData) {
      cv.style.display = 'none';
      const emp = document.createElement('div');
      emp.className = 'chart-empty';
      emp.innerHTML = '<div class="chart-empty-icon">📭</div><div>Aucune donnée</div>';
      card.querySelector('.chart-container, .chart-box').appendChild(emp);
      return null;
    }

    const ch = new Chart(cv, cfg);
    ins[id] = ch;

    if (click) {
      // ── Centralisation dans ChartFilterController (v2.0) ─────────
      // On enregistre le graphique : CFC pose son propre listener,
      // appelle FilterManager.toggleFilter + ChartDrillDown.show.
      // Plus de onclick direct sur le canvas depuis CM.
      if (typeof ChartFilterController !== 'undefined') {
        // Pont AE ↔ FilterManager : synchroniser les deux moteurs
        // CFC appelle FilterManager ; on s'assure qu'AE suit via son subscriber
        ChartFilterController.registerChart(id, ch, {
          filterType:        click.fk,
          clickable:         true,
          highlightOnFilter: true,
          reRenderOnFilter:  true,
          // fv : résolution de la valeur cliquée (si différent de label direct)
          valueFn:           click.fv || null,
          dataSource: null
        });
        // Patch sur-mesure si fv est fourni (valeur != label)
        if (click.fv) {
          const cv2 = document.getElementById(id);
          if (cv2) {
            cv2.removeEventListener('click', cv2._cfcListener);
            cv2._cfcListener = e => {
              const els = ch.getElementsAtEventForMode(e, 'nearest', { intersect: true }, true);
              if (!els.length) return;
              const i = els[0].index;
              const fv = click.fv ? click.fv(i, ch.data.labels) : ch.data.labels[i];
              if (fv == null) return;
              AE.toggleFilter(click.fk, String(fv));
              if (typeof FilterManager !== 'undefined') {
                if (FilterManager.hasFilter(click.fk, String(fv))) FilterManager.removeFilter(click.fk);
                else FilterManager.setFilter(click.fk, String(fv), String(fv));
              }
              setTimeout(() => {
                if (typeof ChartDrillDown !== 'undefined') {
                  var _ef = (typeof EXTRA_FILTERS_MAP !== 'undefined' && EXTRA_FILTERS_MAP[id]) ? { extraFilters: EXTRA_FILTERS_MAP[id] } : undefined;
                  ChartDrillDown.show(id, click.fk, String(fv), String(fv), _ef);
                }
              }, 0);
            };
            cv2.addEventListener('click', cv2._cfcListener);
          }
        }
      } else {
        // ── Fallback si CFC absent ───────────────────────────────────
        cv.onclick = e => {
          const els = ch.getElementsAtEventForMode(e, 'nearest', { intersect: true }, true);
          if (!els.length) return;
          const i  = els[0].index;
          const fv = click.fv ? click.fv(i, ch.data.labels) : ch.data.labels[i];
          if (fv == null) return;
          AE.toggleFilter(click.fk, fv);
          if (typeof ChartDrillDown !== 'undefined') {
            ChartDrillDown.show(id, click.fk, String(fv), String(fv));
          }
        };
      }
      const badge = document.getElementById(`badge-${id}`);
      if (badge) badge.onclick = e => {
        e.stopPropagation();
        AE.removeFilter(click.fk);
        if (typeof FilterManager !== 'undefined') FilterManager.clearFiltersByType(click.fk);
        if (typeof ChartDrillDown !== 'undefined') ChartDrillDown.hide(id);
      };
    }
    return ch;
  }

  return { create, destroy };
})();


/* ═══════════════════════════════════════════════════════════
   HELPERS DONNÉES
═══════════════════════════════════════════════════════════ */
function gCount(data, field, { limit = null, empty = false } = {}) {
  const c = {};
  data.forEach(p => {
    let v = AE.nv(p[field]);
    if (!v) { if (!empty) return; v = AE.EMPTY_LBL; }
    c[v] = (c[v] || 0) + 1;
  });
  let e = Object.entries(c).sort((a, b) => b[1] - a[1]);
  return limit ? e.slice(0, limit) : e;
}

function gSum(data, field, vf, pf, { limit = null, empty = false } = {}) {
  const s = {};
  data.forEach(p => {
    let v = AE.nv(p[field]);
    if (!v) { if (!empty) return; v = AE.EMPTY_LBL; }
    s[v] = (s[v] || 0) + (pf(p[vf]) || 0);
  });
  let e = Object.entries(s).sort((a, b) => b[1] - a[1]);
  return limit ? e.slice(0, limit) : e;
}


/* ═══════════════════════════════════════════════════════════
   BADGES & FILTRES ACTIFS
═══════════════════════════════════════════════════════════ */
const CFM = {
  // ── Graphiques charts.html ──────────────────────────────────────
  'chart-perdu':          'Client',
  'chart-obtenu':         'Client',
  'chart-obtenu-zone':    'Zone Géographique',
  'chart-ca-company':     'Client',
  'chart-ca-status':      'Statut',
  'chart-machines-zone':  'Zone Géographique',
  'chart-offer-type':     'Type de projet (Activité)',
  'chart-power-status':   'status',
  'chart-ca-compare':     'Client',
  'chart-ca-client':      'Client',
  'chart-ca-zone':        'Zone Géographique',
  'chart-ca-year':        '_annee',
  'chart-ca-by-year-v2':  '_annee',
  'chart-status-zone':    'Zone Géographique',
  'chart-win-rate':       'Client',
  'chart-monthly':        '_annee',
  'chart-ca-trend':       '_annee',
      // ── Graphiques ChartsEnrichis (IDs de référence demandés) ───────
  'chart-status':             'status',
  'chart-montant':            'Client',
  'chart-montant-statut':     'status',
  // ── Graphiques ChartsEnrichis enrichis ─────────────────────────
  'chart-perdu':              'Client',
  'chart-obtenu':             'Client',
  'chart-obtenu-zone':        'Zone Géographique',
  'chart-scatter-power-ca':   'Client',
  'chart-win-rate-client':    'Client',
  'chart-ca-zone-v2':         'Zone Géographique',
  'chart-delay-status':       'Statut',
  'chart-ca-by-month':        '_annee',
  'chart-pipeline-stage':     'Statut',
  'chart-ca-histogram':       'Statut',
  'chart-winrate-month':      '_annee',
  'chart-pipeline-weighted':  'Client',
  'chart-win-rate-zone':      'Zone Géographique',
  'chart-power-status-e':     'Statut',
  };

function updateBadges() {
  const f = AE.getFilters();
  const selection = (typeof AE !== 'undefined' && AE.getSelection) ? AE.getSelection() : null;
  for (const [id, fk] of Object.entries(CFM)) {
    const b    = document.getElementById(`badge-${id}`);
    const card = document.querySelector(`[data-chart-id="${id}"]`);
    const on   = fk in f;
    if (b)    b.classList.toggle('visible', on);
    if (card) card.classList.toggle('is-filtering', on);
  }
  const pill = document.getElementById('project-count');
  const hasEnergyFilter = !!(typeof AE !== 'undefined' && AE.getEnergyType && AE.getEnergyType());
  if (pill) pill.classList.toggle('filtered', Object.keys(f).length > 0 || hasEnergyFilter || !!selection);
  // Refléter l'état du filtre énergie sur le select
  const energySel = document.getElementById('energy-type-filter');
  if (energySel && typeof AE !== 'undefined' && AE.getEnergyType) {
    const et = AE.getEnergyType();
    energySel.value = et || '';
    if (et) {
      energySel.style.borderColor = 'rgba(245,183,64,.6)';
      energySel.style.color       = '#f5b740';
      energySel.style.background  = 'rgba(245,183,64,.08)';
    } else {
      energySel.style.borderColor = '';
      energySel.style.color       = '';
      energySel.style.background  = '';
    }
  }
}

function renderFilterPanel() {
  const f     = AE.getFilters();
  const panel = document.getElementById('filter-panel');
  const tags  = document.getElementById('filter-tags');
  const e     = Object.entries(f);
  const energyType = (typeof AE !== 'undefined' && AE.getEnergyType) ? AE.getEnergyType() : '';
  const selection = (typeof AE !== 'undefined' && AE.getSelection) ? AE.getSelection() : null;
  const hasFilters = e.length > 0 || !!energyType || !!selection;

  if (!hasFilters) { panel.classList.remove('active'); return; }
  panel.classList.add('active');
  tags.innerHTML = '';

  e.forEach(([k, v]) => {
    const t = document.createElement('span');
    t.className = 'ftag';
    t.innerHTML = `<span class="ftag-key">${FL[k] || k}</span> ${v} ✕`;
    t.addEventListener('click', () => AE.removeFilter(k));
    tags.appendChild(t);
  });

  if (selection) {
    const t = document.createElement('span');
    t.className = 'ftag';
    t.style.cssText = 'border-color:rgba(0,212,170,.4);background:rgba(0,212,170,.08);color:#9af3e0;';
    t.innerHTML = `<span class="ftag-key" style="color:#9af3e0;">Graphique</span> ${selection.label} (${selection.count}) ✕`;
    t.addEventListener('click', () => AE.clearSelection());
    tags.appendChild(t);
  }

  // Badge filtre énergie
  if (energyType) {
    const ENERGY_LABELS = { eolien: '🌬️ Éolien', photovoltaique: '☀️ Photovoltaïque' };
    const t = document.createElement('span');
    t.className = 'ftag';
    t.style.cssText = 'border-color:rgba(245,183,64,.4);background:rgba(245,183,64,.08);color:#f5b740;';
    t.innerHTML = `<span class="ftag-key" style="color:#f5b740;">⚡ Énergie</span> ${ENERGY_LABELS[energyType] || energyType} ✕`;
    t.addEventListener('click', () => {
      AE.setEnergyType('');
      const energySel = document.getElementById('energy-type-filter');
      if (energySel) {
        energySel.value = '';
        energySel.style.borderColor = '';
        energySel.style.color       = '';
        energySel.style.background  = '';
      }
    });
    tags.appendChild(t);
  }
}


/* ═══════════════════════════════════════════════════════════
   ENTONNOIR
═══════════════════════════════════════════════════════════ */
function renderFunnel(data) {
  var total = data.length;
  var countByStatut = {};
  data.forEach(function(p) {
    var raw = (p['Statut'] || '').trim() || 'Non renseigne';
    countByStatut[raw] = (countByStatut[raw] || 0) + 1;
  });
  var PIPELINE_STAGES = [
    { name: 'Non Chiffre',  keys: ['Non Chiffré','Non Chiffre','non chiffré'],color: 'rgba(107,127,150,.6)', icon: '📋' },
    { name: 'Avant Projet', keys: ['Avant Projet','avant projet'],            color: 'rgba(0,153,255,.65)', icon: '📐' },
    { name: 'En Etude',     keys: ['En Etude','En Étude','en etude'],         color: 'rgba(245,183,64,.72)',icon: '🔍' },
    { name: 'Remis',        keys: ['Remis','remis'],                          color: 'rgba(139,120,248,.72)',icon: '📤' },
    { name: 'Gagne',        keys: ['Gagné','Gagne','gagne','obtenu'],         color: 'rgba(0,212,170,.85)', icon: '✅' },
    { name: 'Perdu',        keys: ['Perdu','perdu'],                          color: 'rgba(255,77,109,.7)', icon: '❌' },
    { name: 'Abandonne',    keys: ['Abandonné','Abandonne'],                  color: 'rgba(107,127,150,.4)',icon: '🚫' },
  ];
  var steps = [];
  PIPELINE_STAGES.forEach(function(stage) {
    var count = 0;
    stage.keys.forEach(function(k){ count += (countByStatut[k]||0); });
    if (count > 0) steps.push({ name: stage.name, count: count, color: stage.color, icon: stage.icon });
  });
  var knownKeys = [];
  PIPELINE_STAGES.forEach(function(s){ s.keys.forEach(function(k){ knownKeys.push(k); }); });
  var renseignes = 0;
  Object.keys(countByStatut).forEach(function(k){ if (knownKeys.indexOf(k)===-1) renseignes += countByStatut[k]; });
  if (renseignes > 0) steps.push({ name: 'Non renseigne', count: renseignes, color: 'rgba(107,127,150,.3)', icon: '❓' });

  var offers  = data.filter(function(p){ return ProjectUtils.getStatus(p) === 'offre'; }).length;
  var decided = data.filter(function(p){ var s=ProjectUtils.getStatus(p); return s==='obtenu'||s==='perdu'; }).length;
  var won     = data.filter(function(p){ return ProjectUtils.getStatus(p) === 'obtenu'; }).length;

  var stepsSimple = [
    { name: 'Total projets',   count: total,   color: 'rgba(0,153,255,.65)',  key: null },
    { name: 'Offres actives',  count: offers,  color: 'rgba(245,183,64,.72)', key: 'offre' },
    { name: 'Décisions prises',count: decided, color: 'rgba(139,120,248,.72)',key: null },
    { name: 'Projets obtenus', count: won,     color: 'rgba(0,212,170,.82)',  key: 'obtenu' }
  ];

  var wrapReal = document.getElementById('funnel-steps-real');
  if (wrapReal) {
    var maxReal = Math.max.apply(null, steps.map(function(s){ return s.count; })) || 1;
    wrapReal.innerHTML = steps.map(function(s) {
      var pct = Math.round(s.count / total * 100);
      var barH = Math.max(8, Math.round(s.count / maxReal * 120));
      return '<div class="funnel-step" style="min-width:70px;">' +
        '<div class="funnel-bar-wrap"><div class="funnel-bar" style="height:' + barH + 'px;background:' + s.color + ';border-radius:4px 4px 0 0;"></div></div>' +
        '<div class="funnel-step-lbl">' +
        '<div class="funnel-step-name" style="font-size:.72rem;">' + s.icon + ' ' + s.name + '</div>' +
        '<div class="funnel-step-count">' + s.count + '</div>' +
        '<div style="font-size:.65rem;color:var(--dust);margin-top:1px;">' + pct + '%</div>' +
        '</div></div>';
    }).join('');
  }
  var max  = total || 1;
  var wrap = document.getElementById('funnel-steps');
  wrap.innerHTML = '';

  steps.forEach((s, i) => {
    const pct  = Math.round((s.count / max) * 100);
    const drop = i > 0
      ? Math.round(((steps[i-1].count - s.count) / (steps[i-1].count || 1)) * 100)
      : null;

    const div = document.createElement('div');
    div.className = 'funnel-step';
    if (s.key) div.dataset.clickable = 'true';

    div.innerHTML = `
      <div class="funnel-bar-wrap">
        <div class="funnel-bar" style="height:${Math.max(6, pct * .88)}px;background:${s.color}"></div>
        ${i < steps.length - 1 ? '<div class="funnel-arrow">›</div>' : ''}
      </div>
      <div class="funnel-step-lbl">
        <div class="funnel-step-name">${s.name}</div>
        <div class="funnel-step-count">${s.count}</div>
        <div class="funnel-step-pct">${pct}% du total</div>
        ${drop !== null ? `<div class="funnel-step-drop">−${drop}%</div>` : ''}
      </div>`;

    if (s.key) div.addEventListener('click', () => {
      AE.toggleFilter('Statut', s.key);
      if (typeof ChartDrillDown !== 'undefined') {
        ChartDrillDown.show('chart-funnel', 'Statut', s.key, s.name);
      }
    });
    wrap.appendChild(div);
  });
}


/* ═══════════════════════════════════════════════════════════
   HEATMAP
═══════════════════════════════════════════════════════════ */
function renderHeatmap(data) {
  const tbl = document.getElementById('heatmap-tbl');
  if (!tbl) return;

  const zones  = [...new Set(data.map(p => AE.nv(p['Zone Géographique'])).filter(Boolean))].sort();
  const stats  = ['obtenu', 'perdu', 'offre'];
  const mx     = {};
  zones.forEach(z => { mx[z] = { obtenu: 0, perdu: 0, offre: 0 }; });
  data.forEach(p => {
    const z = AE.nv(p['Zone Géographique']); if (!z) return;
    const s = ProjectUtils.getStatus(p); if (s in mx[z]) mx[z][s]++;
  });
  const maxV = Math.max(1, ...zones.flatMap(z => stats.map(s => mx[z][s])));

  function heatBg(v, s) {
    const a = 0.1 + (v / maxV) * 0.78;
    if (s === 'obtenu') return `rgba(0,212,170,${a.toFixed(2)})`;
    if (s === 'perdu')  return `rgba(255,77,109,${a.toFixed(2)})`;
    return `rgba(0,153,255,${a.toFixed(2)})`;
  }

  const stLbls = { obtenu: '✅ Obtenus', perdu: '❌ Perdus', offre: '📋 Offres' };
  let html = `<thead><tr>
    <th class="rh">Zone</th>
    ${stats.map(s => `<th>${stLbls[s]}</th>`).join('')}
    <th>Total</th>
  </tr></thead><tbody>`;

  zones.forEach(z => {
    const total = stats.reduce((a, s) => a + mx[z][s], 0);
    html += `<tr><td class="td-zone">${z}</td>`;
    stats.forEach(s => {
      const v  = mx[z][s];
      const bg = v > 0 ? heatBg(v, s) : 'transparent';
      const co = v > 0 ? 'var(--snow)' : 'var(--dust)';
      const esc = z.replace(/'/g, "\\'");
      html += `<td class="${v === 0 ? 'hm0' : ''}"
        style="background:${bg};color:${co}"
        title="${z} / ${s}: ${v}"
        onclick="AE.toggleFilter('Zone Géographique','${esc}');update();">${v || '·'}</td>`;
    });
    html += `<td class="td-total">${total}</td></tr>`;
  });

  html += '</tbody>';
  tbl.innerHTML = html;
}


/* ═══════════════════════════════════════════════════════════
   VÉLOCITÉ
═══════════════════════════════════════════════════════════ */
function renderVelocity(data) {
  const now = new Date();
  const d30 = new Date(now - 30 * 86400000);
  const d60 = new Date(now - 60 * 86400000);
  const d90 = new Date(now - 90 * 86400000);
  const parseDateSafe = (raw) => {
    if (!raw) return null;
    if (typeof ProjectUtils !== 'undefined' && ProjectUtils.parseDate) {
      return ProjectUtils.parseDate(raw);
    }
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  };
  const formatDateSafe = (raw) => {
    const d = parseDateSafe(raw);
    return d ? d.toLocaleDateString('fr-FR') : (raw ? String(raw).trim() : '—');
  };

  const decided = data.filter(p => ['obtenu','perdu'].includes(ProjectUtils.getStatus(p)));

  function cnt(since) {
    return decided.filter(p => {
      const d = parseDateSafe(p['Date de retour demandée'] || p['Date réception']);
      return d && d >= since;
    }).length;
  }

  const v30     = cnt(d30), v60 = cnt(d60), v90 = cnt(d90);
  const overdue = data.filter(p =>
    ProjectUtils.getStatus(p) === 'offre' && parseDateSafe(p['Date de retour demandée']) && parseDateSafe(p['Date de retour demandée']) < now
  ).length;
  const cm   = AE.getCAMode();
  const ca90 = data
    .filter(p => {
      const d = parseDateSafe(p['Date de retour demandée']);
      return ProjectUtils.getStatus(p) === 'obtenu' && d && d >= d90;
    })
    .reduce((s, p) => s + getCAValue(p, cm), 0);

  function sv(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }
  sv('vel-30', v30);
  sv('vel-60', v60);
  sv('vel-90', v90);
  sv('vel-overdue', overdue);
  sv('vel-ca90', ca90 > 0 ? fmt(ca90) : '—');

  const od = document.getElementById('vel-overdue');
  if (od) od.className = 'vel-val ' + (overdue > 0 ? 'red' : 'green');
}


/* ═══════════════════════════════════════════════════════════
   TABLEAU DÉTAILS
═══════════════════════════════════════════════════════════ */
let tsort = { field: 'echeance', asc: true };
var detailTableState = { query: '', filters: {} };

function normalizeDetailFilterValue(value) {
  if (value == null) return '';
  var raw = String(value).trim();
  if (!raw) return '';
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeDetailHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getDetailColumnValue(p, col, cm) {
  switch (col.key) {
    case 'projet':
      return p['Dénomination'] || '';
    case 'ao':
      return p['N°- AO'] || '';
    case 'client':
      return p['Client'] || '';
    case 'statut':
      return (p['Statut'] || p['MG Statut Odoo MG'] || '') + ' ' + ProjectUtils.getStatus(p);
    case 'zone':
      return p['Zone Géographique'] || '';
    case 'ca': {
      var ca = getCAValue(p, cm);
      return ca > 0 ? fmt(ca) : '—';
    }
    case 'echeance': {
      var parsed = (typeof ProjectUtils !== 'undefined' && ProjectUtils.parseDate)
        ? ProjectUtils.parseDate(p['Date de retour demandée'])
        : (p['Date de retour demandée'] ? new Date(p['Date de retour demandée']) : null);
      var isValid = parsed && !isNaN(parsed.getTime());
      return isValid ? parsed.toLocaleDateString('fr-FR') : (p['Date de retour demandée'] || '');
    }
    case 'puissance':
      return p['Puissance (MWc)'] ? parseFloat(p['Puissance (MWc)']).toFixed(1) + ' MW' : '';
    case 'type':
      return p['Type de projet (Activité)'] || '';
    case 'emetteur':
      return p['Emetteur'] || '';
    case 'winproba':
      return p['Win proba'] || '';
    case 'annee':
      return p._annee || '';
    case 'gonogo':
      return p['GoNogo'] || '';
    case 'commentaires':
      return p['Commentaires'] || '';
    default:
      return '';
  }
}

function getDetailSearchText(p, cols, cm) {
  return normalizeDetailFilterValue(cols.map(function(col) {
    return getDetailColumnValue(p, col, cm);
  }).join(' '));
}

function getDetailSortValue(p, field, cm) {
  switch (field) {
    case 'ca':
      return pCA(p[cm]);
    case 'statut':
      return ProjectUtils.getStatus(p);
    case 'echeance': {
      var parsed = (typeof ProjectUtils !== 'undefined' && ProjectUtils.parseDate)
        ? ProjectUtils.parseDate(p['Date de retour demandée'])
        : (p['Date de retour demandée'] ? new Date(p['Date de retour demandée']) : null);
      return parsed && !isNaN(parsed.getTime()) ? parsed.getTime() : 0;
    }
    case 'Puissance (MWc)':
      return parseFloat(p['Puissance (MWc)']) || 0;
    case 'projet':
      return p['Dénomination'] || '';
    case 'Client':
      return p['Client'] || '';
    case 'Zone Géographique':
      return p['Zone Géographique'] || '';
    case 'N°- AO':
      return p['N°- AO'] || '';
    case 'Type de projet (Activité)':
      return p['Type de projet (Activité)'] || '';
    case 'Emetteur':
      return p['Emetteur'] || '';
    case 'Win proba':
      return p['Win proba'] || '';
    case '_annee':
      return p._annee || '';
    case 'GoNogo':
      return p['GoNogo'] || '';
    case 'Commentaires':
      return p['Commentaires'] || '';
    default:
      return p[field];
  }
}

function resetDetailTableFilters() {
  detailTableState.query = '';
  detailTableState.filters = {};
  var search = document.getElementById('detail-search');
  if (search) search.value = '';
  document.querySelectorAll('#dtable .dtable-filter').forEach(function(input) {
    input.value = '';
  });
}

function showDetailTable(data, title = 'Projets filtrés') {
  document.getElementById('detail-title').textContent = `📋 ${title}`;
  resetDetailTableFilters();
  renderRows(data);
  const sec = document.getElementById('detail-section');
  sec.classList.add('active');
  /* scrollIntoView supprimé — évite remontée de page */
}

/* ══════════════════════════════════════════════════════════
   CONFIGURATION COLONNES — définition de toutes les colonnes disponibles
   Chaque entrée : { key, label, sort, render(p, cm) → string HTML }
══════════════════════════════════════════════════════════ */
var TABLE_COLUMNS = [
  {
    key: 'projet', label: 'Projet', sort: 'projet', visible: true,
    render: function(p) {
      return `<td style="color:var(--snow);max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"
          title="${(p['Dénomination']||'').replace(/"/g,'')}">${p['Dénomination'] || '—'}</td>`;
    }
  },
  {
    key: 'ao', label: 'N° AO', sort: 'N°- AO', visible: false,
    render: function(p) {
      return `<td style="font-family:var(--mono);font-size:.72rem;color:var(--dust)">${p['N°- AO'] || '—'}</td>`;
    }
  },
  {
    key: 'client', label: 'Société', sort: 'Client', visible: true,
    render: function(p) {
      return `<td>${p['Client'] || '—'}</td>`;
    }
  },
  {
    key: 'statut', label: 'Statut source', sort: 'statut', visible: true,
    render: function(p) {
      const s = ProjectUtils.getStatus(p);
      const rawStatus = (p['Statut'] || p['MG Statut Odoo MG'] || '—');
      return `<td><div>${rawStatus}</div><div style="font-family:var(--mono);font-size:.64rem;color:var(--dust);margin-top:.15rem;">normalisé : ${s}</div></td>`;
    }
  },
  {
    key: 'zone', label: 'Zone', sort: 'Zone Géographique', visible: true,
    render: function(p) {
      return `<td>${p['Zone Géographique'] || '—'}</td>`;
    }
  },
  {
    key: 'ca', label: 'Budget', sort: 'ca', visible: true,
    render: function(p, cm) {
      const ca = getCAValue(p, cm);
      return `<td style="font-family:var(--mono);font-size:.78rem;color:var(--brand)">${ca > 0 ? fmt(ca) : '—'}</td>`;
    }
  },
  {
    key: 'echeance', label: 'Échéance', sort: 'echeance', visible: true,
    render: function(p) {
      const s = ProjectUtils.getStatus(p);
      const parsed = (typeof ProjectUtils !== 'undefined' && ProjectUtils.parseDate)
        ? ProjectUtils.parseDate(p['Date de retour demandée'])
        : (p['Date de retour demandée'] ? new Date(p['Date de retour demandée']) : null);
      const isValid = parsed && !isNaN(parsed.getTime());
      const overdue = isValid && s === 'offre' && parsed < new Date();
      const ech = isValid ? parsed.toLocaleDateString('fr-FR') : (p['Date de retour demandée'] ? String(p['Date de retour demandée']).trim() : '—');
      return `<td style="${overdue ? 'color:var(--heat)' : ''}">${ech}${overdue ? ' ⚠️' : ''}</td>`;
    }
  },
  {
    key: 'puissance', label: 'MW', sort: 'Puissance (MWc)', visible: true,
    render: function(p) {
      return `<td style="font-family:var(--mono);font-size:.78rem">${p['Puissance (MWc)'] ? parseFloat(p['Puissance (MWc)']).toFixed(1) + ' MW' : '—'}</td>`;
    }
  },
  {
    key: 'type', label: 'Type', sort: 'Type de projet (Activité)', visible: false,
    render: function(p) {
      return `<td style="font-size:.75rem;color:var(--dust)">${p['Type de projet (Activité)'] || '—'}</td>`;
    }
  },
  {
    key: 'emetteur', label: 'Émetteur', sort: 'Emetteur', visible: false,
    render: function(p) {
      return `<td style="font-size:.75rem">${p['Emetteur'] || '—'}</td>`;
    }
  },
  {
    key: 'winproba', label: 'Win %', sort: 'Win proba', visible: false,
    render: function(p) {
      return `<td style="font-family:var(--mono);font-size:.75rem;color:var(--brand2)">${p['Win proba'] || '—'}</td>`;
    }
  },
  {
    key: 'annee', label: 'Année', sort: '_annee', visible: false,
    render: function(p) {
      return `<td style="font-family:var(--mono);font-size:.75rem;color:var(--dust)">${p._annee || '—'}</td>`;
    }
  },
  {
    key: 'gonogo', label: 'GoNogo', sort: 'GoNogo', visible: false,
    render: function(p) {
      const v = p['GoNogo'];
      return `<td style="font-size:.75rem;color:var(--dust)">${v || '—'}</td>`;
    }
  },
  {
    key: 'commentaires', label: 'Commentaires', sort: 'Commentaires', visible: false,
    render: function(p) {
      const v = p['Commentaires'] || '';
      return `<td style="font-size:.72rem;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${v.replace(/"/g,'')}">${v || '—'}</td>`;
    }
  },
];

/* Mettre à jour le thead dynamiquement selon les colonnes visibles */
function _updateThead() {
  var rows = document.querySelectorAll('#dtable thead tr');
  if (!rows || rows.length < 2) return;
  var headerRow = rows[0];
  var filterRow = rows[1];
  var visibleCols = TABLE_COLUMNS.filter(function(c) { return c.visible; });

  headerRow.innerHTML = visibleCols.map(function(c) {
    var sorted = tsort.field === c.sort;
    var arrow  = sorted ? (tsort.asc ? '↑' : '↓') : '↕';
    return `<th data-sort="${c.sort}" ${sorted ? 'class="sorted"' : ''}>${c.label} ${arrow}</th>`;
  }).join('');

  var currentData = Array.isArray(_currentTableData) ? _currentTableData : [];
  filterRow.innerHTML = visibleCols.map(function(c) {
    var values = currentData.map(function(p) {
      return getDetailColumnValue(p, c, AE.getCAMode());
    }).filter(function(v) { return String(v || '').trim(); });
    var uniqueValues = Array.from(new Set(values)).sort(function(a, b) {
      return String(a).localeCompare(String(b), 'fr', { sensitivity: 'base' });
    });
    var currentValue = detailTableState.filters[c.key] || '';
    var shouldSelect = uniqueValues.length > 0 && uniqueValues.length <= 12 &&
      ['statut', 'zone', 'type', 'emetteur', 'gonogo', 'annee'].indexOf(c.key) !== -1;

    if (shouldSelect) {
      return `<th><select class="dtable-filter" data-filter-key="${c.key}"><option value="">Tous</option>${uniqueValues.map(function(option) {
        var selected = currentValue === option ? ' selected' : '';
        return `<option value="${escapeDetailHtml(option)}"${selected}>${escapeDetailHtml(option)}</option>`;
      }).join('')}</select></th>`;
    }

    return `<th><input class="dtable-filter" data-filter-key="${c.key}" type="text" placeholder="Filtrer" value="${escapeDetailHtml(currentValue)}"></th>`;
  }).join('');

  headerRow.querySelectorAll('th[data-sort]').forEach(function(th) {
    th.addEventListener('click', function() {
      var f = this.dataset.sort;
      tsort.asc   = tsort.field === f ? !tsort.asc : true;
      tsort.field = f;
      _updateThead();
      var data = (typeof _currentTableData !== 'undefined') ? _currentTableData : AE.getFiltered();
      renderRows(data);
    });
  });

  filterRow.querySelectorAll('.dtable-filter').forEach(function(input) {
    var eventName = input.tagName === 'SELECT' ? 'change' : 'input';
    input.addEventListener(eventName, function() {
      detailTableState.filters[this.dataset.filterKey] = this.value || '';
      renderRows(_currentTableData || []);
    });
  });
}

var _currentTableData = null;

function renderRows(data) {
  _currentTableData = data;
  const cm = AE.getCAMode();
  const visibleCols = TABLE_COLUMNS.filter(function(c) { return c.visible; });
  _updateThead();
  const search = normalizeDetailFilterValue(detailTableState.query || '');
  const filtered = data.filter(function(p) {
    if (search && getDetailSearchText(p, visibleCols, cm).indexOf(search) === -1) {
      return false;
    }

    return visibleCols.every(function(col) {
      var filterValue = normalizeDetailFilterValue(detailTableState.filters[col.key] || '');
      if (!filterValue) return true;
      return normalizeDetailFilterValue(getDetailColumnValue(p, col, cm)).indexOf(filterValue) !== -1;
    });
  });

  document.getElementById('detail-count').textContent =
    `${filtered.length} / ${data.length} projet${data.length !== 1 ? 's' : ''}`;
  var resultsCount = document.getElementById('detail-results-count');
  if (resultsCount) {
    resultsCount.textContent = `${filtered.length} ligne${filtered.length > 1 ? 's' : ''} affichée${filtered.length > 1 ? 's' : ''}`;
  }

  const sorted = [...filtered].sort((a, b) => {
    let av = getDetailSortValue(a, tsort.field, cm);
    let bv = getDetailSortValue(b, tsort.field, cm);
    if (typeof av === 'string') av = av.toLowerCase();
    if (typeof bv === 'string') bv = bv.toLowerCase();
    if (av < bv) return tsort.asc ? -1 : 1;
    if (av > bv) return tsort.asc ?  1 : -1;
    return 0;
  });

  document.getElementById('dtable-body').innerHTML = sorted.length
    ? sorted.map(function(p) {
    return `<tr>${visibleCols.map(function(col) { return col.render(p, cm); }).join('')}</tr>`;
  }).join('')
    : `<tr><td colspan="${visibleCols.length || 1}" class="dtable-empty">Aucune ligne ne correspond aux filtres en cours.</td></tr>`;
}


/* ═══════════════════════════════════════════════════════════
   KPIs
═══════════════════════════════════════════════════════════ */
function setEl(id, v) { const el = document.getElementById(id); if (el) el.textContent = v; }

function animNum(id, target) {
  const el = document.getElementById(id); if (!el) return;
  const cur = parseInt(el.textContent, 10) || 0;
  if (cur === target) { el.textContent = target; return; }
  el.classList.add('pulse');
  const steps = 16, delta = (target - cur) / steps;
  let i = 0, v = cur;
  const tick = () => {
    i++; v += delta;
    el.textContent = Math.round(i === steps ? target : v);
    if (i < steps) requestAnimationFrame(tick); else el.classList.remove('pulse');
  };
  requestAnimationFrame(tick);
}

function updateKPIs(data) {
  const cm      = AE.getCAMode();
  const won     = data.filter(p => ProjectUtils.getStatus(p) === 'obtenu').length;
  const lost    = data.filter(p => ProjectUtils.getStatus(p) === 'perdu').length;
  const offers  = data.filter(p => ProjectUtils.getStatus(p) === 'offre').length;
  const total   = data.length, decided = won + lost;
  const conv    = decided > 0 ? Math.round(won / decided * 100) : 0;
  const totalCA = data.reduce((s, p) => s + getCAValue(p, cm), 0);
  const wonCA   = data.filter(p => ProjectUtils.getStatus(p) === 'obtenu').reduce((s,p)=>s+getBud(p),0);
  const totPow  = data.reduce((s, p) => s + (parseFloat(p['Puissance (MWc)']) || 0), 0);

  // Délai moyen
  const decP   = data.filter(p => ['obtenu','perdu'].includes(ProjectUtils.getStatus(p)) && p['Date réception'] && p['Date de retour demandée']);
  const avgDec = decP.length > 0
    ? Math.round(decP.reduce((s,p) => {
        const start = ProjectUtils.parseDate(p['Date réception']);
        const end = ProjectUtils.parseDate(p['Date de retour demandée']);
        if (!start || !end) return s;
        return s + Math.max(0, (end - start) / 86400000);
      }, 0) / decP.length)
    : null;

  // Pipeline
  const offerCA  = data.filter(p=>ProjectUtils.getStatus(p)==='offre').reduce((s,p)=>s+getBud(p),0);
  const pipeline = Math.round(offerCA * (conv / 100));

  // Top société
  const sc  = {};
  data.forEach(p => { const s = AE.nv(p['Client']); if (s) sc[s] = (sc[s]||0)+1; });
  const top = Object.entries(sc).sort((a,b)=>b[1]-a[1])[0];

  // Taux réponse
  const ofArr = data.filter(p => ProjectUtils.getStatus(p) === 'offre');
  // depose_remise_offre absent du schéma data.js — champ non disponible
  const _hasDepose = data.some(function(p){ return p.depose_remise_offre !== undefined && p.depose_remise_offre !== null; });
  const resp  = _hasDepose && ofArr.length > 0
    ? Math.round(ofArr.filter(p=>p.depose_remise_offre==='Oui').length/ofArr.length*100) : null;

  animNum('k-total', total);
  animNum('k-won',   won);
  animNum('k-lost',  lost);
  animNum('k-offers',offers);

  setEl('k-ca',       fmt(totalCA));
  setEl('k-conv',     conv + '%');
  setEl('k-power',    totPow.toFixed(1) + ' MW');
  setEl('k-decision', avgDec !== null ? avgDec + ' j' : '—');
  setEl('k-pipeline', pipeline > 0 ? fmt(pipeline) : '—');
  setEl('k-response', resp !== null ? resp + '%' : 'N/D');
  setEl('k-total-sub',`${decided} décidés`);
  setEl('k-won-pct',  total > 0 ? Math.round(won/total*100)+'% du total' : '');
  setEl('k-lost-pct', total > 0 ? Math.round(lost/total*100)+'% du total' : '');
  setEl('k-offers-pct',total > 0 ? Math.round(offers/total*100)+'% du total' : '');
  setEl('k-ca-avg',   won > 0 ? 'moy. '+fmt(Math.round(wonCA/won)) : 'moy. —');
  setEl('k-power-avg',total > 0 ? 'moy. '+(totPow/total).toFixed(1)+' MW' : '');
  setEl('k-top',      top ? top[0] : '—');
  setEl('k-top-sub',  top ? top[1]+' projet'+(top[1]>1?'s':'') : '');
  setEl('project-count', total + ' projets');

  // GoNogo dashboard
  var goCount   = data.filter(function(p){ return (p['GoNogo']||'').trim() === 'Go'; }).length;
  var nogoCount = data.filter(function(p){ var g=(p['GoNogo']||'').trim().toLowerCase(); return g==='nogo'||g==='no go'; }).length;
  var goBar = document.getElementById('gonogo-bar');
  if (!goBar) {
    goBar = document.createElement('div');
    goBar.id = 'gonogo-bar';
    goBar.style.cssText = 'margin:0 2.5rem .75rem;padding:.6rem 1.2rem;background:rgba(0,0,0,.2);border:1px solid rgba(255,255,255,.07);border-radius:10px;display:flex;align-items:center;gap:1.5rem;flex-wrap:wrap;';
    var _funnel1 = document.querySelector('.funnel-section');
    if (_funnel1) _funnel1.parentNode.insertBefore(goBar, _funnel1);
  }
  var goTotal = goCount + nogoCount;
  var goRate  = goTotal > 0 ? Math.round(goCount/goTotal*100) : 0;
  var nogoRate = goTotal > 0 ? Math.round(nogoCount/goTotal*100) : 0;
  goBar.innerHTML = '<span style="font-size:.78rem;color:var(--dust);font-weight:600;text-transform:uppercase;letter-spacing:.04em;">GoNogo</span>' +
    '<span style="color:#00d4aa;font-weight:700;">Go : ' + goCount + ' <span style="color:var(--dust);font-weight:400;font-size:.75rem;">(' + goRate + '%)</span></span>' +
    '<span style="color:#ff4d6d;font-weight:700;">NoGo : ' + nogoCount + ' <span style="color:var(--dust);font-weight:400;font-size:.75rem;">(' + nogoRate + '%)</span></span>' +
    (goTotal < data.length ? '<span style="color:var(--dust);font-size:.75rem;">' + (data.length-goTotal) + ' non renseignés</span>' : '') +
    '<div style="flex:1;min-width:120px;max-width:300px;height:6px;background:rgba(255,77,109,.2);border-radius:3px;overflow:hidden;">' +
    '<div style="width:' + goRate + '%;height:100%;background:#00d4aa;border-radius:3px;transition:width .4s;"></div></div>';

  // Badge projets sans statut
  var noStatus = data.filter(function(p){ var s=ProjectUtils.getStatus(p); return !s||s==='autre'; }).length;
  var badge = document.getElementById('no-status-badge');
  if (!badge) {
    badge = document.createElement('div');
    badge.id = 'no-status-badge';
    badge.style.cssText = 'display:none;margin:0 2.5rem .5rem;padding:.45rem 1rem;background:rgba(245,183,64,.12);border:1px solid rgba(245,183,64,.35);border-radius:8px;color:#f5b740;font-size:.8rem;cursor:pointer;';
    var _funnel2 = document.querySelector('.funnel-section');
    if (_funnel2) _funnel2.parentNode.insertBefore(badge, _funnel2);
  }
  if (noStatus > 0) {
    badge.style.display = 'block';
    badge.innerHTML = '⚠️ <strong>' + noStatus + ' projet' + (noStatus>1?'s':'') + ' sans statut</strong> — ces projets n\'apparaissent pas dans les graphiques de conversion.';
    badge.onclick = function(){ document.getElementById('dtable').scrollIntoView({behavior:'smooth'}); };
  } else { badge.style.display = 'none'; }

  // KPI active state
  const af = AE.getFilters();
  document.querySelectorAll('.kpi[data-ft]').forEach(k => {
    k.classList.remove('active');
    const ft = k.dataset.ft;
    if (ft === 'total' && !Object.keys(af).length) k.classList.add('active');
    else if (ft !== 'total' && af.status === ft)   k.classList.add('active');
  });

  // Barre objectif multi-années
  if (typeof window.renderObjectiveBars === 'function') window.renderObjectiveBars();
  // Barres de progression par année
  if (typeof window.renderYearKPIBars === 'function') window.renderYearKPIBars();
}


/* ═══════════════════════════════════════════════════════════
   GRAPHIQUES
═══════════════════════════════════════════════════════════ */
// Guard audit — détecte les appels répétés à createAllCharts (corrections 2 + 10)
let _createAllChartsCallCount = 0;

function createAllCharts(data) {
  if (document.body.classList.contains('business-dashboard-simplified')
      && typeof window.BusinessChartsDashboard !== 'undefined'
      && typeof window.BusinessChartsDashboard.render === 'function') {
    try { window.BusinessChartsDashboard.render(); } catch (err) {
      console.warn('[createAllCharts] BusinessChartsDashboard.render:', err);
    }
    updateBadges();
    return;
  }

  _createAllChartsCallCount++;
  if (_createAllChartsCallCount > 1) {
    console.info(`[Audit double-init] createAllCharts() appel n°${_createAllChartsCallCount} — re-render`);
  }

  // FIX P5 : guard data vide — logguer avec contexte pour diagnostiquer
  if (!data || !data.length) {
    const aeFiltered = AE.getFiltered();
    const aeRaw = AE.getRaw ? AE.getRaw() : [];
    console.warn(
      '[createAllCharts] data vide !',
      '| AE.raw:', aeRaw.length,
      '| AE.filtered:', aeFiltered.length,
      '| AE.year:', AE.getURL ? new URLSearchParams(AE.getURL()).get('year') : '?',
      '| DFE.filtered:', (typeof DataFilterEngine !== 'undefined' ? DataFilterEngine.getFilteredData().length : 'N/A')
    );
    // Si AE est filtré à vide mais rawData existe → afficher "filtre actif" sur les cartes
    if (aeRaw.length > 0) {
      document.querySelectorAll('[data-chart-id]').forEach(card => {
        card.querySelectorAll('.chart-empty').forEach(e => e.remove());
        const box = card.querySelector('.chart-container, .chart-box');
        if (box && !box.querySelector('.chart-empty')) {
          const emp = document.createElement('div');
          emp.className = 'chart-empty';
          emp.innerHTML = '<div class="chart-empty-icon">🔍</div><div>Aucun résultat pour les filtres actifs</div>';
          box.appendChild(emp);
        }
      });
    }
    return;
  }

  const cm = AE.getCAMode(), af = AE.getFilters();

  // Nettoyer les états "vides" pour les cartes visibles
  Object.keys(CFM).forEach(id => {
    const cv   = document.getElementById(id);
    const card = document.querySelector(`[data-chart-id="${id}"]`);
    if (cv)   cv.style.display = '';
    if (card) card.querySelectorAll('.chart-empty').forEach(e => e.remove());
  });

  // ── 1. Tendance mensuelle ──
  {
    const M = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
    const mCA = {}, mCnt = {};
    data.forEach(p => {
      // [CORRIGÉ v2] Utilise activeDateField + ProjectUtils.parseDate() pour DD/MM/YY
      const _activeFld = (typeof Analytics !== 'undefined' && Analytics.config)
        ? Analytics.config.activeDateField : 'Date réception';
      const _rawD = p[_activeFld];
      if (!_rawD || _rawD === 'x' || _rawD === 'X') return;
      const _parsedD = (typeof ProjectUtils !== 'undefined')
        ? ProjectUtils.parseDate(_rawD) : new Date(_rawD);
      if (!_parsedD || isNaN(_parsedD.getTime())) return;
      const m = _parsedD.getMonth();
      mCA[m]  = (mCA[m]  || 0) + getBud(p);  // getBud() au lieu de pCA(p[cm])
      mCnt[m] = (mCnt[m] || 0) + 1;
    });
    CM.create('chart-monthly', {
      type: 'bar',
      data: {
        labels: M,
        datasets: [
          { type:'line', label:'Projets', data:M.map((_,i)=>mCnt[i]||0), borderColor:SC.offre, backgroundColor:'transparent', borderWidth:2.5, tension:.4, pointBackgroundColor:SC.offre, pointRadius:5, yAxisID:'y2', order:1 },
          { type:'bar',  label:'CA',     data:M.map((_,i)=>mCA[i]||0),  backgroundColor:M.map((_,i)=>mCA[i]>0?PAL[0]:'transparent'), borderRadius:5, yAxisID:'y1', order:2 }
        ]
      },
      options: {
        plugins: { legend: { labels: { color:'#9fb3c8', boxWidth:12 } }, tooltip: { callbacks: { label: c => c.datasetIndex===1 ? ' CA: '+fmt(c.raw) : ` Projets: ${c.raw}` } } },
        scales: { x:xD, y1:{ ...yCA, beginAtZero:true, position:'left' }, y2:{ ticks:{color:'#9fb3c8'}, grid:{display:false}, beginAtZero:true, position:'right' } }
      }
    });
  }

  // ── 2. Perdus/société ──
  {
    const d = gCount(data.filter(p=>ProjectUtils.getStatus(p)==='perdu'), 'Client', {limit:10});
    const l = d.map(([x])=>x);
    CM.create('chart-perdu', {
      type:'bar',
      data:{ labels:l, datasets:[{ label:'Perdus', data:d.map(([,v])=>v), backgroundColor:cset(l,'Client',SC.perdu), borderRadius:6 }] },
      options:{ indexAxis:'y', plugins:{legend:{display:false}}, scales:{x:{...yD,beginAtZero:true},y:xD} }
    }, { fk:'Client', fv:(i)=>l[i] });
  }

  // ── 3. Obtenus/société ──
  {
    const d = gCount(data.filter(p=>ProjectUtils.getStatus(p)==='obtenu'), 'Client', {limit:10});
    const l = d.map(([x])=>x);
    CM.create('chart-obtenu', {
      type:'bar',
      data:{ labels:l, datasets:[{ label:'Obtenus', data:d.map(([,v])=>v), backgroundColor:cset(l,'Client',SC.obtenu), borderRadius:6 }] },
      options:{ indexAxis:'y', plugins:{legend:{display:false}}, scales:{x:{...yD,beginAtZero:true},y:xD} }
    }, { fk:'Client', fv:(i)=>l[i] });
  }

  // ── 4. Obtenus/zone ──
  {
    const d = gCount(data.filter(p=>ProjectUtils.getStatus(p)==='obtenu'), 'Zone Géographique');
    const l = d.map(([x])=>x);
    CM.create('chart-obtenu-zone', {
      type:'doughnut',
      data:{ labels:l, datasets:[{ data:d.map(([,v])=>v), backgroundColor:cset(l,'Zone Géographique') }] },
      options:{ plugins:{ legend:{ position:'bottom', labels:{color:'#9fb3c8',padding:14} } } }
    }, { fk:'Zone Géographique', fv:(i)=>l[i] });
  }

  // ── 5. CA/société ──
  {
    const d = gSum(data, 'Client', cm, pCA, {limit:8});
    const l = d.map(([x])=>x);
    CM.create('chart-ca-company', {
      type:'bar',
      data:{ labels:l.map(x=>x.substring(0,15)), datasets:[{ label:'CA', data:d.map(([,v])=>v), backgroundColor:cset(l,'Client',SC.obtenu), borderRadius:6 }] },
      options:{ plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' CA: '+fmt(c.raw)}}}, scales:{y:{...yCA,beginAtZero:true},x:xD} }
    }, { fk:'Client', fv:(i)=>l[i] });
  }

  // ── 6. CA/statut ──
  {
    const sd = { obtenu:0, perdu:0, offre:0 };
    data.forEach(p => { const s=ProjectUtils.getStatus(p); if(s in sd) sd[s]+=getCAValue(p, cm); });
    const l = Object.keys(sd), av = af.status;
    const bg = l.map(x => av ? (x===av?SC[x]:dim(SC[x])) : SC[x]);
    CM.create('chart-ca-status', {
      type:'bar',
      data:{ labels:l, datasets:[{ label:'CA', data:Object.values(sd), backgroundColor:bg, borderRadius:6 }] },
      options:{ plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' CA: '+fmt(c.raw)}}}, scales:{y:{...yCA,beginAtZero:true},x:xD} }
    }, { fk:'status', fv:(i)=>l[i] });
  }

  // ── 7. Machines/zone ──
  {
    const d = gSum(data, 'Zone Géographique', 'Puissance (MWc)', v=>parseFloat(v)||0);
    const l = d.map(([x])=>x);
    CM.create('chart-machines-zone', {
      type:'bar',
      data:{ labels:l, datasets:[{ label:'Puissance MW', data:d.map(([,v])=>v), backgroundColor:cset(l,'Zone Géographique',PAL[3]), borderRadius:6 }] },
      options:{ plugins:{legend:{display:false}, tooltip:{callbacks:{label:(ctx)=>` ${(ctx.raw||0).toFixed(1)} MW`}}}, scales:{y:{...yD,beginAtZero:true,ticks:{callback:v=>v+' MW'}},x:xD} }
    }, { fk:'Zone Géographique', fv:(i)=>l[i] });
  }

  // ── 8. Types offres ──
  {
    const d = gCount(data, 'Type de projet (Activité)');
    const l = d.map(([x])=>x);
    CM.create('chart-offer-type', {
      type:'pie',
      data:{ labels:l, datasets:[{ data:d.map(([,v])=>v), backgroundColor:cset(l,'Type de projet (Activité)') }] },
      options:{ plugins:{ legend:{ position:'bottom', labels:{color:'#9fb3c8',padding:12} } } }
    }, { fk:'Type de projet (Activité)', fv:(i)=>l[i] });
  }

  // ── 9. Partenaires ──
  {
    // Graphique partenaire — guard: partenaire_gc absent du schéma actuel de data.js
    const _hasPartner = data.some(function(p){ return p.partenaire_gc && String(p.partenaire_gc).trim(); });

    const d = _hasPartner ? gCount(data, 'partenaire_gc', {limit:8}) : [];
    const l = d.map(([x])=>x);

  }

  // ── 10. Puissance/statut ──
  {
    const pd = { obtenu:0, perdu:0, offre:0 };
    data.forEach(p => { const s=ProjectUtils.getStatus(p); if(s in pd) pd[s]+=parseFloat(p['Puissance (MWc)'])||0; });
    const l = Object.keys(pd), av = af.status;
    const bg = l.map(x => av ? (x===av?SC[x]:dim(SC[x])) : SC[x]);
    CM.create('chart-power-status', {
      type:'bar',
      data:{ labels:l, datasets:[{ label:'MW', data:Object.values(pd).map(v=>+v.toFixed(2)), backgroundColor:bg, borderRadius:6 }] },
      options:{ plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>` ${c.raw} MW`}}}, scales:{y:{...yD,beginAtZero:true},x:xD} }
    }, { fk:'status', fv:(i)=>l[i] });
  }

  // ── 11. Comparaison CA Étudié / Gagné ──
  {
    const cc = {};
    data.forEach(p => {
      const c = AE.nv(p['Client']); if (!c) return;
      if (!cc[c]) cc[c] = { e:0, g:0 };
      cc[c].e += pCA(p['Bud']);
      cc[c].g += pCA(p['Bud']);
    });
    const s  = Object.entries(cc).sort((a,b)=>(b[1].e+b[1].g)-(a[1].e+a[1].g)).slice(0,8);
    const l  = s.map(([c])=>c), av = af['Client'];
    const bgE = l.map(x=>av?(x===av?SC.offre:dim(SC.offre)):SC.offre);
    const bgG = l.map(x=>av?(x===av?SC.obtenu:dim(SC.obtenu)):SC.obtenu);
    CM.create('chart-ca-compare', {
      type:'bar',
      data:{ labels:l.map(x=>x.substring(0,15)), datasets:[
        { label:'CA Étudié', data:s.map(([,d])=>d.e), backgroundColor:bgE, borderRadius:6 },
        { label:'CA Gagné',  data:s.map(([,d])=>d.g), backgroundColor:bgG, borderRadius:6 }
      ]},
      options:{ plugins:{legend:{labels:{color:'#9fb3c8'}},tooltip:{callbacks:{label:c=>' '+fmt(c.raw)}}}, scales:{y:{...yCA,beginAtZero:true},x:xD} }
    }, { fk:'Client', fv:(i)=>l[i] });
  }

  // ── 12. CA par société horizontal ──
  {
    const d = gSum(data, 'Client', cm, pCA, {limit:8});
    const l = d.map(([x])=>x);
    CM.create('chart-ca-client', {
      type:'bar',
      data:{ labels:l.map(x=>x.substring(0,18)), datasets:[{ label:'CA', data:d.map(([,v])=>v), backgroundColor:cset(l,'Client','rgba(236,72,153,.82)'), borderRadius:6 }] },
      options:{ indexAxis:'y', plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' CA: '+fmt(c.raw)}}}, scales:{x:{...xCA,beginAtZero:true},y:xD} }
    }, { fk:'Client', fv:(i)=>l[i] });
  }

  // ── 13. CA/zone doughnut ──
  {
    const d = gSum(data, 'Zone Géographique', cm, pCA);
    const l = d.map(([x])=>x);
    CM.create('chart-ca-zone', {
      type:'doughnut',
      data:{ labels:l, datasets:[{ data:d.map(([,v])=>v), backgroundColor:cset(l,'Zone Géographique') }] },
      options:{ plugins:{ legend:{position:'bottom',labels:{color:'#9fb3c8',padding:14}}, tooltip:{callbacks:{label:c=>' '+fmt(c.raw)}} } }
    }, { fk:'Zone Géographique', fv:(i)=>l[i] });
  }

  // ── 14. CA/année ligne ──
  {
    const ya = {};
    data.forEach(p => {
      // Priorité : annee_manuel > annee
      const yearVal = (p._annee != null && String(p._annee).trim() !== '')
        ? String(p._annee)
        : AE.nv(String(p._annee||''));
      if(!yearVal) return;
      // ca_gagne : uniquement les projets obtenus
      // [CORRIGÉ v2] ca_gagne → filtrer obtenu ; sinon lire Bud
      if(cm === 'ca_gagne' && ProjectUtils.getStatus(p) !== 'obtenu') return;
      ya[yearVal]=(ya[yearVal]||0)+getBud(p);
    });
    const s  = Object.entries(ya).sort((a,b)=>parseInt(a[0])-parseInt(b[0]));
    const l  = s.map(([y])=>y), av = af._annee;
    const ptBg = l.map(x=>av?(x===av?SC.obtenu:dim(SC.obtenu)):SC.obtenu);
    CM.create('chart-ca-year', {
      type:'line',
      data:{ labels:l, datasets:[{ label:'CA', data:s.map(([,v])=>v), borderColor:SC.obtenu, backgroundColor:'rgba(0,212,170,.08)', borderWidth:2.5, tension:.4, fill:true, pointBackgroundColor:ptBg, pointBorderColor:'#fff', pointBorderWidth:2, pointRadius:6 }] },
      options:{ plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' CA: '+fmt(c.raw)}}}, scales:{y:{...yCA,beginAtZero:true},x:xD} }
    }, { fk:'_annee', fv:(i)=>l[i] });
  }

  // ── 15. Statut/zone stacked ──
  {
    const sbz = {};
    data.forEach(p => { const z=AE.nv(p['Zone Géographique']); if(!z)return; if(!sbz[z])sbz[z]={obtenu:0,perdu:0,offre:0}; const s=ProjectUtils.getStatus(p); if(s in sbz[z])sbz[z][s]++; });
    const zones = Object.keys(sbz), av = af['Zone Géographique'];
    const mk = sk => zones.map(z => av ? (z===av?SC[sk]:dim(SC[sk])) : SC[sk]);
    CM.create('chart-status-zone', {
      type:'bar',
      data:{ labels:zones, datasets:[
        { label:'Obtenus', data:zones.map(z=>sbz[z].obtenu), backgroundColor:mk('obtenu'), borderRadius:4 },
        { label:'Perdus',  data:zones.map(z=>sbz[z].perdu),  backgroundColor:mk('perdu'),  borderRadius:4 },
        { label:'Offres',  data:zones.map(z=>sbz[z].offre),  backgroundColor:mk('offre'),  borderRadius:4 }
      ]},
      options:{ plugins:{legend:{labels:{color:'#9fb3c8'}}}, scales:{y:{...yD,beginAtZero:true,stacked:true},x:{...xD,stacked:true}} }
    }, { fk:'Zone Géographique', fv:(i)=>zones[i] });
  }

  // ── 16. Taux de réussite ──
  {
    const cs = {};
    data.forEach(p => { const c=AE.nv(p['Client']); if(!c)return; if(!cs[c])cs[c]={w:0,l:0}; const s=ProjectUtils.getStatus(p); if(s==='obtenu')cs[c].w++;else if(s==='perdu')cs[c].l++; });
    const wr = Object.entries(cs).map(([c,s])=>({c,r:s.w+s.l>0?s.w/(s.w+s.l)*100:0,t:s.w+s.l})).filter(x=>x.t>=2).sort((a,b)=>b.r-a.r).slice(0,8);
    const l  = wr.map(x=>x.c);
    CM.create('chart-win-rate', {
      type:'bar',
      data:{ labels:l, datasets:[{ label:'%', data:wr.map(x=>+x.r.toFixed(1)), backgroundColor:cset(l,'Client',SC.obtenu), borderRadius:6 }] },
      options:{ indexAxis:'y', plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>` ${c.raw}%`}}}, scales:{x:{beginAtZero:true,max:100,ticks:{color:'#9fb3c8',callback:v=>v+'%'},grid:{color:'rgba(255,255,255,.06)'}},y:xD} }
    }, { fk:'Client', fv:(i)=>l[i] });
  }

  // ── 17. CA cumulé multi-années ──
  {
    const M = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
    const years = [...new Set(data.map(p => {
      // Priorité : annee_manuel > annee
      if (p._annee != null && String(p._annee).trim() !== '') return String(p._annee);
      return p._annee;
    }).filter(Boolean))].sort();
    const datasets = years.map((y, yi) => {
      const mCA = Array(12).fill(0);
      data.filter(p => {
        const py = (p._annee != null && String(p._annee).trim() !== '')
          ? String(p._annee) : String(p._annee||'');
        return py === String(y);
      }).forEach(p => {
        const d = p['Date réception'] || p['Date réception']; if (!d) return;
        mCA[new Date(d).getMonth()] += getCAValue(p, cm);
      });
      let acc = 0;
      const cumul = mCA.map(v => { acc += v; return acc; });
      const col = PAL[yi % PAL.length];
      return {
        label: String(y), data: cumul,
        borderColor: col, backgroundColor: col.replace(/[\d.]+\)$/, '0.05)'),
        borderWidth: 2.5, tension: .35, fill: true,
        pointBackgroundColor: col, pointRadius: 4, pointHoverRadius: 7
      };
    });
    CM.create('chart-ca-trend', {
      type:'line',
      data:{ labels:M, datasets },
      options:{ plugins:{legend:{labels:{color:'#9fb3c8',boxWidth:12}},tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${fmt(c.raw)}`}}}, scales:{y:{...yCA,beginAtZero:true},x:xD} }
    });
  }

  updateBadges();
}


/* ═══════════════════════════════════════════════════════════
   EXPORTS
═══════════════════════════════════════════════════════════ */

  // Colonnes exportées — ordre exact du CSV source
  var EXPORT_COLUMNS = [
    { key:'Date réception',                       type:'date'    },
    { key:'Client',                               type:'text'    },
    { key:'Dénomination',                         type:'text'    },
    { key:'Emetteur',                             type:'text'    },
    { key:'Receveur',                             type:'text'    },
    { key:'Zone Géographique',                    type:'text'    },
    { key:'Type de projet (Activité)',            type:'text'    },
    { key:'Bud',                                  type:'number'  },
    { key:'Puissance (MWc)',                      type:'number'  },
    { key:'Win proba',                            type:'percent' },
    { key:'CA win proba',                         type:'number'  },
    { key:'Statut',                               type:'text'    },
    { key:'MG Statut Odoo MG',                   type:'text'    },
    { key:'Date de retour demandée',              type:'date'    },
    { key:'GoNogo',                               type:'text'    },
    { key:'N°- AO',                              type:'text'    },
    { key:'Carte Planner oui/non',               type:'text'    },
    { key:'Décidé le',                           type:'date'    },
    { key:'Date de démarrage VRD prévisionnelle', type:'date'    },
    { key:'Date de démarrage GE prévisionnelle',  type:'date'    },
    { key:'Date de MSI prévisionnelle',           type:'date'    },
    { key:'Commentaires',                         type:'text'    },
  ];

function exportExcel(data, filename, sheetTitle) {
  if (typeof XLSX === 'undefined') { notify('Export Excel', 'SheetJS non chargé', 'error'); return; }
  if (!data || !data.length)       { notify('Export Excel', 'Aucune donnée', 'error'); return; }
  filename   = filename   || ('analytics_' + new Date().toISOString().slice(0,10) + '.xlsx');
  sheetTitle = sheetTitle || 'Données';

  function _date(v) {
    if (!v) return null;
    var s = String(v).trim(); if (!s||s==='—') return null;
    var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return new Date(+m[3], +m[2]-1, +m[1]);
    var d = new Date(s); return isNaN(d.getTime()) ? null : d;
  }
  function _num(v) {
    if (v===null||v===undefined) return null;
    if (typeof v==='number') return v;
    var s = String(v).replace(/[^\d.,]/g,'');
    if (!s) return null;
    var lc=s.lastIndexOf(','), ld=s.lastIndexOf('.');
    if (lc>ld) s=s.replace(/\./g,'').replace(',','.');
    else if (ld>lc) s=s.replace(/,/g,'');
    var n=parseFloat(s); return isNaN(n)?null:n;
  }
  function _pct(v) {
    if (!v&&v!==0) return null;
    var n=parseFloat(String(v).replace('%','').trim());
    return isNaN(n)?null:(n>1?n/100:n);
  }

  var wsData = [EXPORT_COLUMNS.map(function(c){ return c.key; })];
  data.forEach(function(p) {
    wsData.push(EXPORT_COLUMNS.map(function(c) {
      var raw = p[c.key]!==undefined ? p[c.key] : p[c.key+' '];
      if (raw===undefined||raw===null) return '';
      if (c.type==='date')    { var d=_date(raw);    return d||String(raw); }
      if (c.type==='number')  { var n=_num(raw);     return n!==null?n:String(raw); }
      if (c.type==='percent') { var pc=_pct(raw);    return pc!==null?pc:String(raw); }
      return String(raw);
    }));
  });
  // Ligne total
  var budI = EXPORT_COLUMNS.findIndex(function(c){ return c.key==='Bud'; });
  var pwI  = EXPORT_COLUMNS.findIndex(function(c){ return c.key==='Puissance (MWc)'; });
  var tot  = EXPORT_COLUMNS.map(function(c,i){
    if (i===0) return 'TOTAL ('+data.length+' projets)';
    if (i===budI) return data.reduce(function(s,p){ return s+(_num(p['Bud'])||0); },0);
    if (i===pwI)  return data.reduce(function(s,p){ var n=parseFloat(p['Puissance (MWc)']||0); return s+(isNaN(n)?0:n); },0);
    return '';
  });
  wsData.push(tot);

  var wb = XLSX.utils.book_new();
  var ws = XLSX.utils.aoa_to_sheet(wsData);

  // Styles en-tête
  var hF={bold:true,color:{rgb:'FFFFFF'},name:'Arial',sz:10};
  var hFill={patternType:'solid',fgColor:{rgb:'1A5276'}};
  var dF={name:'Arial',sz:9};
  var tF={bold:true,color:{rgb:'F0C040'},name:'Arial',sz:10};
  var tFill={patternType:'solid',fgColor:{rgb:'0D2137'}};
  var nRows=wsData.length, nCols=EXPORT_COLUMNS.length;

  function ref(r,c){ return XLSX.utils.encode_cell({r:r,c:c}); }

  for (var c=0;c<nCols;c++) {
    var cell=ws[ref(0,c)];
    if (!cell) ws[ref(0,c)]={t:'s',v:EXPORT_COLUMNS[c].key};
    ws[ref(0,c)].s={font:hF,fill:hFill,alignment:{horizontal:'center',vertical:'center',wrapText:true},border:{bottom:{style:'medium',color:{rgb:'00D4AA'}}}};
  }

  for (var r=1;r<nRows-1;r++) {
    var alt=r%2===0;
    for (var c=0;c<nCols;c++) {
      var cl=ws[ref(r,c)]; if (!cl) continue;
      var col=EXPORT_COLUMNS[c];
      var s={font:dF,fill:alt?{patternType:'solid',fgColor:{rgb:'0F1E2E'}}:{},alignment:{vertical:'center'}};
      if (col.type==='date'&&cl.v instanceof Date){ cl.t='d'; s.numFmt='DD/MM/YYYY'; s.alignment.horizontal='center'; }
      else if ((col.key==='Bud'||col.key==='CA win proba')&&typeof cl.v==='number'){ cl.t='n'; s.numFmt='# ##0.00 €'; s.alignment.horizontal='right'; }
      else if (col.key==='Puissance (MWc)'&&typeof cl.v==='number'){ cl.t='n'; s.numFmt='0.0'; s.alignment.horizontal='right'; }
      else if (col.type==='percent'&&typeof cl.v==='number'){ cl.t='n'; s.numFmt='0%'; s.alignment.horizontal='center'; }
      else { s.alignment.horizontal='left'; }
      if (col.key==='Statut'&&cl.v) {
        var st=String(cl.v).toLowerCase();
        var sc=st.includes('gagn')?'00C176':st.includes('perdu')?'E74C3C':st.includes('remis')?'8B78F8':'9FB3C8';
        s.font=Object.assign({},dF,{bold:true,color:{rgb:sc}});
      }
      cl.s=s;
    }
  }

  var tr=nRows-1;
  for (var c=0;c<nCols;c++) {
    var cl=ws[ref(tr,c)]; if (!cl) ws[ref(tr,c)]={t:'s',v:''};
    var ts={font:tF,fill:tFill,alignment:{vertical:'center'}};
    var col=EXPORT_COLUMNS[c];
    if ((col.key==='Bud'||col.key==='CA win proba')&&typeof ws[ref(tr,c)].v==='number'){ ws[ref(tr,c)].t='n'; ts.numFmt='# ##0.00 €'; ts.alignment.horizontal='right'; }
    else if (col.key==='Puissance (MWc)'&&typeof ws[ref(tr,c)].v==='number'){ ws[ref(tr,c)].t='n'; ts.numFmt='0.0'; ts.alignment.horizontal='right'; }
    ws[ref(tr,c)].s=ts;
  }

  var widths={'Date réception':14,'Client':22,'Dénomination':34,'Emetteur':16,'Receveur':14,'Zone Géographique':16,'Type de projet (Activité)':22,'Bud':14,'Puissance (MWc)':12,'Win proba':10,'CA win proba':14,'Statut':14,'MG Statut Odoo MG':16,'Date de retour demandée':14,'GoNogo':8,'N°- AO':12,'Carte Planner oui/non':14,'Décidé le':12,'Date de démarrage VRD prévisionnelle':20,'Date de démarrage GE prévisionnelle':20,'Date de MSI prévisionnelle':18,'Commentaires':40};
  ws['!cols']=EXPORT_COLUMNS.map(function(c){ return {wch:widths[c.key]||14}; });
  ws['!rows']=[{hpt:32}];
  ws['!autofilter']={ref:XLSX.utils.encode_range({s:{r:0,c:0},e:{r:nRows-1,c:nCols-1}})};
  ws['!ref']=XLSX.utils.encode_range({s:{r:0,c:0},e:{r:nRows-1,c:nCols-1}});

  XLSX.utils.book_append_sheet(wb, ws, sheetTitle.slice(0,31));
  XLSX.writeFile(wb, filename, {bookType:'xlsx',type:'binary',cellStyles:true});
  notify('Export Excel', data.length+' projets → '+filename, 'success', 3000);
}

function exportCSV(data) {
  const cm = AE.getCAMode();
  const h  = ['Date réception','Client','Dénomination','Emetteur','Receveur','Zone Géographique','Type de projet (Activité)','Bud','Puissance (MWc)','Win proba','CA win proba','Statut','MG Statut Odoo MG','Date de retour demandée','GoNogo','N°- AO','Carte Planner oui/non','Décidé le','Date démarrage VRD','Date démarrage GE','Date MSI','Commentaires'];
  function esc(v) { return '"' + String(v||'').replace(/"/g,'""') + '"'; }
  const rows = data.map(p => [
    p['Date réception']||'', esc(p['Client']), esc(p['Dénomination']),
    esc(p['Emetteur']), esc(p['Receveur']), p['Zone Géographique']||'',
    p['Type de projet (Activité)']||'', p['Bud']||'', p['Puissance (MWc)']||'',
    p['Win proba']||'', p['CA win proba']||'', p['Statut']||'',
    p['MG Statut Odoo MG']||'', p['Date de retour demandée']||'', p['GoNogo']||'',
    p['N°- AO']||'', p['Carte Planner oui/non']||'',
    p['Décidé le']||p['Décidé le ']||'',
    p['Date de démarrage VRD prévisionnelle']||'',
    p['Date de démarrage GE prévisionnelle']||'',
    p['Date de MSI prévisionnelle']||'', esc(p['Commentaires'])
  ].join(';'));
  const blob = new Blob(['\uFEFF' + [h.join(';'), ...rows].join('\n')],
    { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `analytics_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  notify('Export CSV', `${data.length} projets exportés`, 'success');
}

function exportChart(id) {
  const cv = document.getElementById(id); if (!cv) return;
  const tmp = document.createElement('canvas');
  tmp.width = cv.width; tmp.height = cv.height;
  const ctx = tmp.getContext('2d');
  ctx.fillStyle = '#101928';
  ctx.fillRect(0, 0, tmp.width, tmp.height);
  ctx.drawImage(cv, 0, 0);
  const a = document.createElement('a');
  a.href     = tmp.toDataURL('image/png');
  a.download = `chart_${id}_${new Date().toISOString().slice(0,10)}.png`;
  a.click();
  notify('PNG exporté', 'Graphique téléchargé', 'success', 1800);
}


/* ═══════════════════════════════════════════════════════════
   DEBOUNCE
═══════════════════════════════════════════════════════════ */
function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

function resolveProjectYearValue(project) {
  if (!project) return null;

  function toYear(raw) {
    if (raw == null) return null;
    const str = String(raw).trim();
    if (!str) return null;
    const parsedInt = parseInt(str, 10);
    if (/^\d{4}$/.test(str) && isFinite(parsedInt)) return parsedInt;
    if (typeof ProjectUtils !== 'undefined' && typeof ProjectUtils.parseDate === 'function') {
      const date = ProjectUtils.parseDate(str);
      if (date && typeof date.getFullYear === 'function') {
        const year = date.getFullYear();
        if (isFinite(year)) return year;
      }
    }
    return null;
  }

  const directYear = toYear(project._annee);
  if (directYear) return directYear;

  if (typeof Analytics !== 'undefined' && typeof Analytics.getProjectYear === 'function') {
    const liveYear = toYear(Analytics.getProjectYear(project));
    if (liveYear) return liveYear;
  }

  const activeField = (typeof Analytics !== 'undefined' && Analytics.config && Analytics.config.activeDateField)
    ? Analytics.config.activeDateField
    : null;
  const fields = [
    activeField,
    'Date réception',
    'Date de retour demandée',
    'Décidé le ',
    'Décidé le',
    'Date de démarrage VRD prévisionnelle',
    'Date de démarrage GE prévisionnelle',
    'Date de MSI prévisionnelle',
    'creation',
    'date_reception_ao',
    'date_remise_offre'
  ].filter(Boolean);

  for (const field of fields) {
    const year = toYear(project[field]);
    if (year) return year;
  }

  return null;
}

function rebuildYearSelectFromData(data) {
  const ys = document.getElementById('year-filter');
  if (!ys) return;

  const current = ys.value;
  const yrs = [...new Set((Array.isArray(data) ? data : []).map(p => {
    return resolveProjectYearValue(p);
  }).filter(y => isFinite(y)))].sort().reverse();

  ys.innerHTML = '<option value="">Toutes les années</option>';
  yrs.forEach(y => {
    const o = document.createElement('option');
    o.value = String(y);
    o.textContent = String(y);
    ys.appendChild(o);
  });

  if (current && yrs.includes(parseInt(current, 10))) {
    ys.value = current;
  }
}

function sanitizeDashboardSelectionState() {
  if (typeof AE === 'undefined' || typeof AE.getRaw !== 'function' || typeof AE.getFiltered !== 'function') return;
  const raw = AE.getRaw() || [];
  if (!raw.length) return;
  if (AE.getFiltered().length) return;

  console.warn('[DashboardState] Etat URL/restaure vide — reset securise');

  if (typeof FilterManager !== 'undefined' && typeof FilterManager.clearAll === 'function') {
    try { FilterManager.clearAll(); } catch (_) {}
  }
  if (typeof AE.clearAll === 'function') {
    try { AE.clearAll(); } catch (_) {}
  }

  const ys = document.getElementById('year-filter');
  if (ys) ys.value = '';
  if (typeof AE.setYear === 'function') {
    try { AE.setYear(''); } catch (_) {}
  }
}

function setDashboardData(newData, options) {
  const opts = options || {};
  const source = Array.isArray(newData) ? newData : [];

  window.DATA = source.map(function(p) {
    const normalized = Object.assign({}, p);
    if (normalized._annee == null || String(normalized._annee).trim() === '') {
      const year = resolveProjectYearValue(normalized);
      if (year) normalized._annee = String(year);
    }
    return normalized;
  });

  if (typeof DataFilterEngine !== 'undefined') {
    if (opts.initializeDataFilterEngine && typeof DataFilterEngine.init === 'function') {
      DataFilterEngine.init(window.DATA);
    } else if (typeof DataFilterEngine.setRawData === 'function') {
      DataFilterEngine.setRawData(window.DATA);
    } else if (typeof DataFilterEngine.init === 'function') {
      DataFilterEngine.init(window.DATA);
    }

    if (typeof DataFilterEngine.getRawData === 'function') {
      const enriched = DataFilterEngine.getRawData();
      if (enriched.length === window.DATA.length) {
        window.DATA = enriched.map(function(p) { return Object.assign({}, p); });
      }
    }
  }

  if (typeof AE !== 'undefined' && typeof AE.init === 'function') {
    AE.init(window.DATA);
  }

  rebuildYearSelectFromData(window.DATA);

  if (typeof DataFilterEngine !== 'undefined'
      && typeof DataFilterEngine.setFilteredData === 'function'
      && typeof AE !== 'undefined'
      && typeof AE.getFiltered === 'function') {
    DataFilterEngine.setFilteredData(AE.getFiltered());
  }

  if (!opts.skipUpdate && typeof update === 'function') {
    update();
  }

  return window.DATA;
}

window.setDashboardData = setDashboardData;


/* ═══════════════════════════════════════════════════════════
   UPDATE PRINCIPAL
═══════════════════════════════════════════════════════════ */
function update() {
  // FIX P3 : source de données unifiée
  // AE.getFiltered() gère les filtres UI (year, search, toggleFilter)
  // DataFilterEngine est ensuite synchronisé pour que les modules avancés
  // (ChartsEnrichis, ChartsNouveaux, ChartDrillDown) lisent la même donnée.
  const data = AE.getFiltered();

  // Synchroniser DataFilterEngine : il doit contenir exactement 'data'
  // pour que getFilteredData() retourne la même chose que AE.getFiltered().
  if (typeof DataFilterEngine !== 'undefined') {
    // 1. S'assurer que rawData est à jour (avec _annee injecté par AE)
    if (DataFilterEngine.getRawData().length !== AE.getRaw().length) {
      DataFilterEngine.setRawData(AE.getRaw());
    }
    // 2. Conserver exactement le même snapshot que l'UI visible
    if (typeof DataFilterEngine.setFilteredData === 'function') {
      DataFilterEngine.setFilteredData(data);
    } else {
      const aeFilters = AE.getFilters();
      const fmFilters = Object.entries(aeFilters).map(([type, value]) => ({ type, value }));
      DataFilterEngine.applyFilters(fmFilters);
    }
  }
  updateKPIs(data);
  createAllCharts(data);
  renderFilterPanel();
  if (!document.body.classList.contains('business-dashboard-simplified')) {
    renderFunnel(data);
    renderHeatmap(data);
  }
  renderVelocity(data);
  updateBadges();

  // ── MODULE 9 : Nouveaux graphiques ──────────────────────────────
  if (!document.body.classList.contains('business-dashboard-simplified') && typeof ChartsNouveaux !== 'undefined') {
    try { ChartsNouveaux.renderAll(data); }
    catch(e) { console.warn('[update] ChartsNouveaux.renderAll:', e); }
  }

  // ── MODULE 3 : Explications dynamiques ──────────────────────────
  if (!document.body.classList.contains('business-dashboard-simplified') && typeof ChartAnalysis !== 'undefined') {
    try { ChartAnalysis.renderAll(data); }
    catch(e) { console.warn('[update] ChartAnalysis.renderAll:', e); }
  }

  // ── MODULE 1 : Barre de filtres unifiée ─────────────────────────
  if (typeof FloatingFilterBar !== 'undefined') {
    try { FloatingFilterBar.render(); }
    catch(e) {}
  }
  if (typeof DashboardDataTransparency !== 'undefined'
      && typeof DashboardDataTransparency.renderGlobalBanner === 'function') {
    try { DashboardDataTransparency.renderGlobalBanner(data); }
    catch(e) {}
  }

  const sec = document.getElementById('detail-section');
  if (sec && sec.classList.contains('active')) renderRows(data);
}


/* ═══════════════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════════════ */
  window.addEventListener('load', async () => {
    window.DATA = Array.isArray(window.DATA) ? window.DATA : [];
    if (typeof DashboardDataTransparency !== 'undefined'
        && typeof DashboardDataTransparency.setDatasetMeta === 'function') {
      DashboardDataTransparency.setDatasetMeta({
        datasetKey: 'saip-main',
        sourceName: window.DATA.length ? 'Jeu embarque / session courante' : 'Aucune donnee chargee',
        rowCount: window.DATA.length,
        updatedAt: '',
        payloadHash: '',
        storageMode: 'bootstrap',
        sourceType: 'bootstrap'
      });
    }
    setDashboardData(window.DATA, { initializeDataFilterEngine: true, skipUpdate: true });
    var serverRecord = null;
    if (typeof DashboardServerData !== 'undefined' && typeof DashboardServerData.hydrateDashboard === 'function') {
      try {
        serverRecord = await DashboardServerData.hydrateDashboard();
        if (serverRecord && serverRecord.ok && typeof notify === 'function') {
          var sourceLabel = serverRecord.storageMode === 'session-cache'
            ? 'projets restaurés depuis le cache de session'
            : 'projets récupérés depuis la base';
          notify('Données chargées', serverRecord.rowCount + ' ' + sourceLabel, 'success', 3200);
        } else if (serverRecord && serverRecord.ok === false && typeof notify === 'function') {
          var msg = 'Dataset base indisponible';
          if (serverRecord.status === 401) msg = 'Session non autorisée pour charger les données';
          else if (serverRecord.status === 404) msg = 'Aucun dataset publié en base';
          else if (serverRecord.status === 500) msg = 'Base dataset indisponible';
          notify('Aucune donnée serveur', msg, 'warning', 5200);
        }
      } catch (err) {
        console.warn('[DashboardServerData] Chargement impossible', err);
        if (typeof notify === 'function') {
          notify('Aucune donnée serveur', 'Chargement base impossible — vérifiez Netlify et la base dataset', 'warning', 5200);
        }
      }
    }
    AE.loadFromURL();
    setTimeout(sanitizeDashboardSelectionState, 40);

  // ── Initialiser ChartFilterController ──────────────────────────
  // Doit être fait AVANT createAllCharts pour que registerChart fonctionne.
  // CFC souscrit à FilterManager pour re-render automatique.
  // On crée un pont FilterManager ↔ AE pour synchroniser les deux moteurs.
  if (typeof ChartFilterController !== 'undefined') {
    ChartFilterController.init();
  }
  if (typeof FilterManager !== 'undefined' && typeof AE !== 'undefined') {
    // Pont : quand FilterManager change → mettre à jour AE et re-render
    FilterManager.subscribe((filters) => {
      // Reconstruire les filtres AE depuis FilterManager
      const newFilters = {};
      filters.forEach(f => {
        // Pour AE, un seul filtre par type (dernier gagne)
        newFilters[f.type] = f.value;
      });
      // Remplacer les filtres AE par ceux de FilterManager
      const currentAEFilters = AE.getFilters();
      // Supprimer les filtres AE qui ne sont plus dans FilterManager
      Object.keys(currentAEFilters).forEach(k => {
        if (!(k in newFilters)) AE.removeFilter(k);
      });
      // Ajouter/mettre à jour les filtres FM → AE
      Object.entries(newFilters).forEach(([k, v]) => {
        if (currentAEFilters[k] !== v) {
          if (currentAEFilters[k] != null) AE.removeFilter(k);
          if (AE.getFilters()[k] !== v) AE.toggleFilter(k, v);
        }
      });
    });
  }

  // ── Synchroniser DataFilterEngine quand AE change ──────────────
  AE.subscribe(() => {
    if (typeof DataFilterEngine !== 'undefined') {
      if (typeof DataFilterEngine.setFilteredData === 'function') {
        DataFilterEngine.setFilteredData(AE.getFiltered());
      } else {
        const aeFilters = AE.getFilters();
        const fmFilters = Object.entries(aeFilters).map(([type, value]) => ({ type, value }));
        DataFilterEngine.applyFilters(fmFilters);
      }
    }
  });

  // Peupler les selects année du module comparaison
  setTimeout(function () {
    if (window._v4compare && window._v4compare.populateAll)
      window._v4compare.populateAll();
  }, 150);

  const ys  = document.getElementById('year-filter');
  rebuildYearSelectFromData(window.DATA);

  // Restaurer depuis URL
  const up = new URLSearchParams(window.location.search);
  if (up.has('year')) ys.value = up.get('year');
  if (up.has('ca'))   document.getElementById('ca-mode').value = up.get('ca');

  AE.subscribe(update);

  // ── Toggles graphiques (v5 — réversible, sans destroy) ──
  function initToggleBtns() {
    document.querySelectorAll('.chart-toggle-btn').forEach(btn => {
      if (btn._boundToggle) return;
      btn._boundToggle = true;
      btn.addEventListener('click', function () {
        const id   = this.dataset.chart;
        const card = document.querySelector(`[data-chart-id="${id}"]`);
        if (!card) return;
        const wasHidden = card.classList.contains('hidden-chart');

        this.classList.toggle('active');
        card.classList.remove('hidden'); // migration ancien système
        card.classList.toggle('hidden-chart');

        // Sync ChartVisibility (v5) + localStorage
        if (typeof ChartVisibility !== 'undefined') {
          ChartVisibility[id] = wasHidden;
          try { localStorage.setItem('chartVisibility', JSON.stringify(ChartVisibility)); } catch(e) {}
        }
        if (window._chartVis) window._chartVis.update();

        // Si on vient de ré-afficher → re-render
        if (wasHidden) update();
        // PAS de CM.destroy → le chart reste en mémoire, masqué par CSS
      });
    });
  }
  initToggleBtns();

  // ── KPI clicks ──
  document.querySelectorAll('.kpi[data-ft]').forEach(k => {
    k.addEventListener('click', () => {
      const ft = k.dataset.ft;
      if (ft === 'total') AE.clearAll();
      else {
        const cur = AE.getFilters()['Statut'];
        if (cur === ft) AE.removeFilter('Statut');
        else AE.toggleFilter('Statut', ft);
      }
    });
  });

  document.getElementById('btn-clear-all')
    .addEventListener('click', () => {
      AE.clearAll();
      AE.setEnergyType('');
      const energySel = document.getElementById('energy-type-filter');
      if (energySel) {
        energySel.value = '';
        energySel.style.borderColor = '';
        energySel.style.color       = '';
        energySel.style.background  = '';
      }
    });

  ys.addEventListener('change', function () {
    AE.setYear(this.value);
    notify('Filtre année', this.value || 'Toutes', 'info', 1800);
  });

  // ── MODULE 8 : Sélecteur de date global ─────────────────────────
  var dateFieldSel = document.getElementById('date-field-selector');
  if (dateFieldSel) {
    dateFieldSel.addEventListener('change', function () {
      var field = this.value;
      if (typeof Analytics !== 'undefined' && Analytics.setActiveDateField) {
        Analytics.setActiveDateField(field);
        // Mettre à jour le sélecteur d'année disponible
        setTimeout(function() {
          var yrSel = document.getElementById('year-filter');
          if (yrSel && window.DATA) {
            var currentVal = yrSel.value;
            var yrs = [...new Set(window.DATA.map(function(p) {
              return resolveProjectYearValue(p);
            }).filter(Boolean))].sort().reverse();
            yrSel.innerHTML = '<option value="">Toutes les années</option>';
            yrs.forEach(function(y) {
              var o = document.createElement('option');
              o.value = y; o.textContent = y;
              yrSel.appendChild(o);
            });
            // Restaurer la sélection si encore valide
            if (currentVal && yrs.includes(parseInt(currentVal))) {
              yrSel.value = currentVal;
            }
          }
        }, 150);
      } else {
        // Fallback si Analytics non disponible
        notify('⚠️ Analytics.setActiveDateField non disponible', '', 'warning', 2000);
      }
    });
    // Afficher la valeur courante au chargement
    if (typeof Analytics !== 'undefined' && Analytics.config && Analytics.config.activeDateField) {
      dateFieldSel.value = Analytics.config.activeDateField;
    }
  }

  document.getElementById('ca-mode')
    .addEventListener('change', function () {
      AE.setCAMode(this.value);
      const labels = { 'Bud': 'CA Total (Bud)', 'ca_gagne': 'CA Gagné' }; // [CORRIGÉ v2]
      notify('Mode CA', labels[this.value] || this.value, 'info', 1800);
    });

  const targetInput = document.getElementById('target-amount');
  if (targetInput) {
    targetInput.addEventListener('input', debounce(() => updateKPIs(AE.getFiltered()), 300));
  }

  var searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', debounce(function () { AE.setSearch(this.value); }, 250));
  }

  // ── Filtre type d'énergie ────────────────────────────────────────
  (function() {
    var energySel = document.getElementById('energy-type-filter');
    if (!energySel) return;
    energySel.addEventListener('change', function() {
      AE.setEnergyType(this.value);
      // Badge visuel sur le select quand filtre actif
      if (this.value) {
        energySel.style.borderColor = 'rgba(245,183,64,.6)';
        energySel.style.color       = '#f5b740';
        energySel.style.background  = 'rgba(245,183,64,.08)';
      } else {
        energySel.style.borderColor = '';
        energySel.style.color       = '';
        energySel.style.background  = '';
      }
    });
  })();

  document.getElementById('btn-csv')
    .addEventListener('click', () => exportCSV(AE.getFiltered()));

  var _btnXls = document.getElementById('btn-excel');
  if (_btnXls) _btnXls.addEventListener('click', function() {
    exportExcel(AE.getFiltered(), 'analytics_' + new Date().toISOString().slice(0,10) + '.xlsx', 'Projets filtres');
  });

  document.querySelectorAll('[data-ce]').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); exportChart(btn.dataset.ce); });
  });

  document.getElementById('btn-share').addEventListener('click', () => {
    const url = window.location.origin + window.location.pathname +
      (AE.getURL() ? '?' + AE.getURL() : '');
    navigator.clipboard.writeText(url)
      .then(() => {
        const t = document.getElementById('share-toast');
        t.classList.add('show');
        setTimeout(() => t.classList.remove('show'), 2500);
      })
      .catch(() => notify('URL', url, 'info', 0));
  });

  document.getElementById('btn-close-table')
    .addEventListener('click', () =>
      document.getElementById('detail-section').classList.remove('active'));

  var detailSearch = document.getElementById('detail-search');
  if (detailSearch) {
    detailSearch.addEventListener('input', function() {
      detailTableState.query = this.value || '';
      renderRows(_currentTableData || []);
    });
  }

  var detailReset = document.getElementById('btn-detail-reset-filters');
  if (detailReset) {
    detailReset.addEventListener('click', function() {
      resetDetailTableFilters();
      renderRows(_currentTableData || []);
    });
  }

  // ── Bouton "Tout afficher" / "Filtrés seulement" ──────────────────────────
  (function() {
    var _showingAll = false;
    var btnAll      = document.getElementById('btn-show-all-data');
    var btnFiltered = document.getElementById('btn-show-filtered');
    if (!btnAll || !btnFiltered) return;

    function _setMode(showAll) {
      _showingAll = showAll;
      if (showAll) {
        // Afficher toutes les données brutes (window.DATA)
        var raw = (typeof AE !== 'undefined' && AE.getRaw) ? AE.getRaw() : (window.DATA || []);
        renderRows(raw);
        document.getElementById('detail-title').textContent = '📋 Tous les projets (' + raw.length + ')';
        btnAll.style.display      = 'none';
        btnFiltered.style.display = '';
      } else {
        // Revenir aux données filtrées
        var filtered = (typeof AE !== 'undefined') ? AE.getFiltered() : (window.DATA || []);
        renderRows(filtered);
        document.getElementById('detail-title').textContent = '📋 Projets filtrés';
        btnAll.style.display      = '';
        btnFiltered.style.display = 'none';
      }
    }

    btnAll.addEventListener('click', function() { _setMode(true); });
    btnFiltered.addEventListener('click', function() { _setMode(false); });

    // Réinitialiser le mode "tout afficher" quand les filtres changent
    if (typeof AE !== 'undefined' && typeof AE.subscribe === 'function') {
      AE.subscribe(function() {
        if (_showingAll) return; // garder le mode tout-afficher si actif
        // Mettre à jour l'affichage si le tableau est ouvert
        var sec = document.getElementById('detail-section');
        if (sec && sec.classList.contains('active')) {
          renderRows(AE.getFiltered());
        }
      });
    }

    // Exposer pour usage depuis ChartDrillDown et showDetailTable
    window._tableMode = {
      reset: function() {
        _showingAll = false;
        if (btnAll) btnAll.style.display = '';
        if (btnFiltered) btnFiltered.style.display = 'none';
      },
      // setCustom : affiche un jeu de données spécifique (ex: depuis CDD)
      // sans modifier les filtres actifs
      setCustom: function(projects, label) {
        _showingAll = false; // pas en mode "tout", mode "sélection graphique"
        if (btnAll) btnAll.style.display = '';
        if (btnFiltered) btnFiltered.style.display = 'none';
        // Le titre et les données sont déjà gérés par showDetailTable()
      }
    };
  })();

  // ── Panneau de configuration des colonnes ──────────────────────────────────
  (function() {
    var btnConfig = document.getElementById('btn-cols-config');
    var panel     = document.getElementById('cols-config-panel');
    var list      = document.getElementById('cols-config-list');
    var btnAll    = document.getElementById('btn-cols-all');
    var btnNone   = document.getElementById('btn-cols-none');
    var btnClose  = document.getElementById('btn-cols-close');

    if (!btnConfig || !panel || !list) return;

    function _buildList() {
      list.innerHTML = TABLE_COLUMNS.map(function(col) {
        return [
          `<label style="display:flex;align-items:center;gap:.5rem;cursor:pointer;padding:.2rem .35rem;`,
          `border-radius:6px;transition:background .12s;" onmouseover="this.style.background='rgba(255,255,255,.04)'"`,
          ` onmouseout="this.style.background=''">`,
          `<input type="checkbox" data-col="${col.key}" ${col.visible ? 'checked' : ''} `,
          `style="accent-color:#00d4aa;width:14px;height:14px;">`,
          `<span style="font-size:.78rem;color:${col.visible ? '#dce8f5' : '#6b7f96'};">${col.label}</span>`,
          `</label>`
        ].join('');
      }).join('');

      // Listeners sur les checkboxes
      list.querySelectorAll('input[type=checkbox]').forEach(function(cb) {
        cb.addEventListener('change', function() {
          var key = this.dataset.col;
          var col = TABLE_COLUMNS.find(function(c) { return c.key === key; });
          if (col) {
            col.visible = this.checked;
            // Mettre à jour la couleur du label
            var span = this.parentElement.querySelector('span');
            if (span) span.style.color = col.visible ? '#dce8f5' : '#6b7f96';
          }
          // Re-rendre le tableau si ouvert
          if (typeof _currentTableData !== 'undefined' && _currentTableData !== null) {
            renderRows(_currentTableData);
          }
        });
      });
    }

    function _toggle() {
      var isOpen = panel.style.display !== 'none';
      if (isOpen) {
        panel.style.display = 'none';
      } else {
        _buildList();
        panel.style.display = 'block';
      }
    }

    btnConfig.addEventListener('click', function(e) { e.stopPropagation(); _toggle(); });

    if (btnAll) btnAll.addEventListener('click', function() {
      TABLE_COLUMNS.forEach(function(c) { c.visible = true; });
      _buildList();
      if (typeof _currentTableData !== 'undefined' && _currentTableData !== null) renderRows(_currentTableData);
    });

    if (btnNone) btnNone.addEventListener('click', function() {
      TABLE_COLUMNS.forEach(function(c, i) { c.visible = (i === 0); }); // garder au moins la 1ère
      _buildList();
      if (typeof _currentTableData !== 'undefined' && _currentTableData !== null) renderRows(_currentTableData);
    });

    if (btnClose) btnClose.addEventListener('click', function() { panel.style.display = 'none'; });

    // Fermer en cliquant ailleurs
    document.addEventListener('click', function(e) {
      if (panel.style.display !== 'none' && !panel.contains(e.target) && e.target !== btnConfig) {
        panel.style.display = 'none';
      }
    });
  })();

  // Tri géré dynamiquement par _updateThead() dans renderRows

  update();
  if (window.DATA.length > 0) {
    notify('Chargement réussi', `${window.DATA.length} projets détectés`, 'success', 3000);
  } else {
    notify('Prêt pour import CSV', 'Aucune donnée préchargée', 'info', 3200);
  }

  // ── MODULE 9 : Initialiser ChartsNouveaux ───────────────────────
  setTimeout(function() {
    var simplified = document.body.classList.contains('business-dashboard-simplified');
    if (!simplified && typeof ChartsNouveaux !== 'undefined') {
      const data = AE.getFiltered();
      ChartsNouveaux.initAll(data);
    }
    // ── MODULE 1 : FloatingFilterBar ──────────────────────────────
    if (typeof FloatingFilterBar !== 'undefined') {
      FloatingFilterBar.init();
    }
    // ── MODULE 3 : ChartAnalysis ──────────────────────────────────
    if (!simplified && typeof ChartAnalysis !== 'undefined') {
      ChartAnalysis.init();
      ChartAnalysis.renderAll(AE.getFiltered());
    }
  }, 200);
});
/* ═══════════════════════════════════════════════════════════
   INFO BOUTONS — branchés sur TooltipInfo pour cohérence visuelle
═══════════════════════════════════════════════════════════ */
(function () {
  /* Fermer les anciennes popups si elles restent ouvertes */
  function closeAllInfoPopups() {
    document.querySelectorAll('.chart-info-popup.visible').forEach(function (p) {
      p.classList.remove('visible');
    });
    document.querySelectorAll('.chart-info-btn.active').forEach(function (b) {
      b.classList.remove('active');
    });
  }

  /* Brancher chaque .chart-info-btn sur TooltipInfo */
  function bindChartInfoBtns() {
    document.querySelectorAll('.chart-info-btn').forEach(function (btn) {
      if (btn.__tipBound) return;
      var chartId = btn.dataset.info;
      var popup   = document.getElementById('info-' + chartId);
      var text    = '';
      if (popup) {
        var titleEl = popup.querySelector('.chart-info-popup-title');
        var textEl  = popup.querySelector('.chart-info-popup-text');
        if (titleEl) text += '<strong>' + titleEl.textContent.replace(/^ℹ\s*/, '') + '</strong><br>';
        if (textEl)  text += textEl.textContent;
      }
      if (!text) text = btn.getAttribute('title') || 'Information';

      /* Réutiliser l'API TooltipInfo directement */
      btn.setAttribute('data-info', text);
      if (typeof TooltipInfo !== 'undefined') {
        TooltipInfo.init(btn.parentNode || btn);
      }
    });
  }

  /* Désactiver le clic de l'ancien système (évite double déclenchement) */
  document.addEventListener('click', function (e) {
    if (e.target.closest('.chart-info-btn')) {
      closeAllInfoPopups();
    }
    if (!e.target.closest('.chart-info-btn') && !e.target.closest('.chart-info-popup')) {
      closeAllInfoPopups();
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindChartInfoBtns);
  } else {
    bindChartInfoBtns();
  }
})();
