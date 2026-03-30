/* =====================================================
   SCRIPT.JS — v26 (Architecture App namespace)
   
   Ce fichier orchestre les vues (table, map, stats,
   charts, details) en lisant/écrivant App.state.
   
   Logique métier → ProjectUtils
   Données + état → App
   DOM + rendu    → ici
   
   ⚠️  Requiert app.js chargé avant ce fichier
===================================================== */

// ── Raccourcis lisibles vers App (pas de globales dupliquées) ──
const _app     = window.App;          // namespace central
const _state   = _app.state;          // état UI réactif
const _data    = _app.data;           // couche données
const _cols    = _app.columns;        // colonnes
const _filters = _app.filters;        // filtrage

// ── Aliases backward-compat (lus par trello-view.js) ──────────
// ALL et save() sont déjà exposés par app.js comme aliases globaux

/* -------------------------------------------------------
   COLONNES — délèguent à App.columns
------------------------------------------------------- */
function getAllColumnKeys()    { return _cols.getAllKeys(); }
function getColumnLabel(k)     { return _cols.getLabel(k); }
function getColumnType(k)      { return _cols.getType(k); }
function isSystemCol(k)        { return _cols.isSystem(k); }
function saveCustomColumns()   { /* géré par App.columns */ }
function saveColumnsVisibility(){ /* géré par App.columns */ }
function saveColumnOrder()     { /* géré par App.columns */ }
function syncColumnOrder()     { /* fait au démarrage par App */ }

// Proxies transparents vers les collections gérées par App.columns
// (trello-view.js et code inline les lisent encore directement)
const customColumns   = _cols.custom;
const TABLE_COLUMNS   = _cols.order;
const visibleColumns  = _cols.visible;

/* -------------------------------------------------------
   TRI — lit/écrit App.state.sortState
------------------------------------------------------- */
function setSortCol(col) {
  const s = _state.sortState;
  if (s.col === col) s.dir = s.dir === "asc" ? "desc" : "asc";
  else { s.col = col; s.dir = "asc"; }
  refresh();
}

function applySortToData(data) {
  const s = _state.sortState;
  return ProjectUtils.sortProjects(data, s.col, s.dir, getColumnType);
}

/* -------------------------------------------------------
   FILTRE MONTANT — proxy vers App.state
------------------------------------------------------- */
// Proxy objet pour que les accès directs à montantFilter.*
// restent synchronisés avec App.state.montantFilter
const montantFilter = _state.montantFilter;

/* -------------------------------------------------------
   RENDER TABLE HEADER avec tri
------------------------------------------------------- */
function renderTableHeader() {
  const header = document.getElementById("table-header");
  if (!header) return;
  header.innerHTML = "";
  TABLE_COLUMNS.forEach(col => {
    if (!visibleColumns[col]) return;
    const th = document.createElement("th");
    th.dataset.column = col;
    th.style.cursor = "pointer";
    th.style.userSelect = "none";
    th.style.whiteSpace = "nowrap";
    const arrow = _state.sortState.col===col ? (_state.sortState.dir==="asc"?" ▲":" ▼") : " ⇅";
    th.innerHTML = `${getColumnLabel(col)}<span style="font-size:9px;opacity:0.55;margin-left:3px;">${arrow}</span>`;
    th.onclick = () => setSortCol(col);
    header.appendChild(th);
  });
}

/* =====================================================
   UTILITIES — fonctions DOM et helpers d'affichage
   La logique métier pure est dans ProjectUtils.
===================================================== */

// getStatusKey : adaptateur polymorphe — accepte une string OU un objet projet
function getStatusKey(input) {
  if (!input) return 'autre';
  if (typeof input === 'object') return ProjectUtils.getStatus(input);
  return ProjectUtils.parseStatusKey(input);
}

// Formatage — délèguent à ProjectUtils
function parseMontant(v)       { return ProjectUtils.parseMontant(v); }
function formatDateDisplay(s)  { return ProjectUtils.formatDateDisplay(s); }
function formatDateStorage(s)  { return ProjectUtils.formatDateStorage(s); }

function shortenLabel(l, max = 14) { if (!l) return '—'; return l.length > max ? l.slice(0, max) + '…' : l; }
function escapeHtml(t)  { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }
function fmtMontant(v)  { return ProjectUtils.formatMontant(v, true); }

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function flashBtn(id, txt = '✅ Fait !') {
  const btn = document.getElementById(id); if (!btn) return;
  const o = btn.textContent; btn.textContent = txt;
  btn.style.background = 'linear-gradient(135deg,#10b981 0%,#059669 100%)';
  setTimeout(() => { btn.textContent = o; btn.style.background = ''; }, 2000);
}

/* =====================================================
   DONNÉES — gérées par App (app.js)
   
   ALL et save() sont des aliases exposés par App pour
   la rétrocompatibilité. Ce bloc initialise simplement
   les references locales utilisées dans ce fichier.
   
   Note : plus de normalisation ici — faite dans app.js
===================================================== */
// ALL est exposé globalement par app.js — pas besoin de le redéclarer

/* =====================================================
   MAP
===================================================== */
const map = L.map("map").setView([46.6, 2.5], 6);
const osmLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"© OpenStreetMap"});
const satelliteLayer = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",{maxZoom:19,attribution:"© Esri"});
osmLayer.addTo(map);

let heatmapLayer=null, heatmapVisible=false, satelliteVisible=false;
const markers=new Map();
let activeMarker=null, activeMarkerData=null, blinkTimer=null;

const ACTIVE_STYLE = {radius:9,color:"#facc15",weight:3,fillColor:"#dc2626",fillOpacity:1};

// STATUS_COLORS et MARKER_RADIUS sont gérés par App.mapConfig
// Ces alias permettent au code existant de fonctionner sans changement
const STATUS_COLORS = _app.mapConfig.statusColors;

function saveLegendPrefs() { _app.mapConfig.save(); }

function getMarkerStyle(s) {
  const r = _app.mapConfig.markerRadius;
  const c = _app.mapConfig.statusColors;
  return {radius:r,color:"#ffffff",weight:1,fillColor:c[getStatusKey(s)]||c.autre,fillOpacity:0.9};
}

/**
 * Construire le panneau de personnalisation de la légende
 * S'ouvre en cliquant sur le titre "Légende" de la carte
 */
function buildLegendCustomizer() {
  const existing = document.getElementById('legend-customizer');
  if (existing) { existing.remove(); return; }

  const panel = document.createElement('div');
  panel.id = 'legend-customizer';
  panel.style.cssText = `
    position: absolute;
    bottom: 130px;
    left: 20px;
    z-index: 1500;
    background: white;
    padding: 16px;
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.18);
    border: 1px solid #e2e8f0;
    min-width: 220px;
    animation: fadeInUp 0.18s ease;
  `;

  const LABELS = {obtenu:'Obtenus',perdu:'Perdus',offre:'Offres',autre:'Autres'};

  let html = `<div style="font-size:11px;font-weight:800;text-transform:uppercase;color:#64748b;letter-spacing:.05em;margin-bottom:12px;">🎨 Personnaliser</div>`;

  // Couleurs par statut
  Object.entries(LABELS).forEach(([key, label]) => {
    html += `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
        <input type="color" id="lc-color-${key}" value="${STATUS_COLORS[key]}"
          style="width:32px;height:28px;border:none;border-radius:6px;cursor:pointer;padding:2px;">
        <span style="font-size:13px;font-weight:600;color:#334155;flex:1;">${label}</span>
      </div>`;
  });

  // Taille des icônes (rayon)
  html += `
    <div style="margin-top:12px;padding-top:12px;border-top:1px solid #e2e8f0;">
      <div style="font-size:11px;font-weight:700;color:#64748b;margin-bottom:6px;">📍 Taille icônes : <span id="lc-radius-val">${_app.mapConfig.markerRadius}</span>px</div>
      <input type="range" id="lc-radius" min="3" max="16" value="${_app.mapConfig.markerRadius}"
        style="width:100%;accent-color:#0d9488;">
    </div>
    <div style="margin-top:12px;display:flex;gap:8px;">
      <button id="lc-apply" style="flex:1;padding:8px;background:#0d9488;color:white;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;">✅ Appliquer</button>
      <button id="lc-reset" style="padding:8px 10px;background:#f1f5f9;color:#64748b;border:1px solid #e2e8f0;border-radius:8px;font-size:12px;cursor:pointer;">↺</button>
    </div>`;

  panel.innerHTML = html;
  document.querySelector('.map-wrapper').appendChild(panel);

  // Aperçu en temps réel de la couleur sur les marqueurs
  Object.keys(LABELS).forEach(key => {
    document.getElementById(`lc-color-${key}`).addEventListener('input', e => {
      STATUS_COLORS[key] = e.target.value;
      // Mettre à jour les dots de la légende immédiatement
      const dot = document.querySelector(`.map-legend-dot.${key}`);
      if (dot) dot.style.background = e.target.value;
      refresh();
    });
  });

  const radiusInput = document.getElementById('lc-radius');
  const radiusVal = document.getElementById('lc-radius-val');
  radiusInput.addEventListener('input', e => {
    _app.mapConfig.markerRadius = parseInt(e.target.value);
    radiusVal.textContent = _app.mapConfig.markerRadius;
    refresh();
  });

  document.getElementById('lc-apply').addEventListener('click', () => {
    saveLegendPrefs();
    updateLegendDots();
    panel.remove();
    showToastMsg('✅ Légende sauvegardée', 2000);
  });

  document.getElementById('lc-reset').addEventListener('click', () => {
    _app.mapConfig.reset();
    const defaults = _app.mapConfig.statusColors;
    Object.keys(defaults).forEach(k => {
      const el = document.getElementById(`lc-color-${k}`);
      if (el) el.value = defaults[k];
    });
    radiusInput.value = 6;
    radiusVal.textContent = 6;
    refresh();
    updateLegendDots();
  });
}

function updateLegendDots() {
  Object.entries(STATUS_COLORS).forEach(([key, color]) => {
    const dot = document.querySelector(`.map-legend-dot.${key}`);
    if (dot) dot.style.background = color;
  });
}

function showToastMsg(msg, duration=2000) {
  let t = document.getElementById('map-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'map-toast';
    t.style.cssText = 'position:fixed;bottom:24px;right:24px;background:#1e293b;color:white;padding:10px 18px;border-radius:10px;font-size:13px;font-weight:600;z-index:9999;opacity:0;transition:opacity 0.25s;pointer-events:none;';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.opacity = '0'; }, duration);
}
function clearActiveMarker() {
  if (!activeMarker) return; stopBlink();
  activeMarker.setStyle(activeMarkerData?getMarkerStyle(activeMarkerData.etat_correspondance_trello):{fillOpacity:0.9});
  activeMarker=null; activeMarkerData=null;
}
function selectMarker(d) {
  clearActiveMarker();
  const m=markers.get(d.id); if(!m) return;
  m.setStyle(ACTIVE_STYLE); activeMarker=m; activeMarkerData=d;
}
function zoomOn(d,zoom=12) {
  if(!d.latitude||!d.longitude) return;
  map.setView([d.latitude,d.longitude],zoom,{animate:true,duration:0.6});
}
function startBlink() {
  if (!activeMarker) return; stopBlink();
  let v=true;
  blinkTimer=setInterval(()=>{ activeMarker.setStyle({fillOpacity:v?0.2:1}); v=!v; },400);
}
function stopBlink() {
  if (blinkTimer){clearInterval(blinkTimer);blinkTimer=null;}
  if (activeMarker) activeMarker.setStyle({fillOpacity:1});
}

/* =====================================================
   ÉTAT UI — délègue à App.state
   
   Ces variables sont des aliases vers App.state.*.
   Le code existant continue de les lire/écrire
   directement ; App.state reste la source de vérité.
===================================================== */
const FILTER_KEYS = {
  zone_geo:'Zone géographique', societe:'Société',
  statut: 'Statut', consultation_cahors:'Consultation CAHORS'
};

// Aliases directs vers App.state (lecture/écriture transparentes)
const filters     = _state.filters;       // { zone_geo: Set, societe: Set, … }

// Ces variables scalaires sont lues/écrites via _state.* dans les fonctions.
// On les expose aussi comme variables locales pour la compatibilité des
// closures existantes (ex: renderActiveFilters, buildMontantFilter, etc.)
let activeStatFilter   = null;
let filterByMapBounds  = false;
let chartFilter        = { active: false, type: null, societe: null };
let searchQuery        = '';

// Synchroniser les scalaires locaux ↔ App.state avant chaque refresh
function _syncStateFromLocals() {
  _state.activeStatFilter  = activeStatFilter;
  _state.filterByMapBounds = filterByMapBounds;
  _state.chartFilter       = chartFilter;
  _state.searchQuery       = searchQuery;
  _state.montantFilter     = montantFilter;
}

/**
 * Construire les critères de filtrage depuis l'état UI courant.
 * Source unique — consommé par getFiltered() et le module Trello.
 */
function buildFilterCriteria() {
  return {
    query:       searchQuery,
    statut:      activeStatFilter,
    chartFilter: chartFilter,
    zones:       filters.zone_geo,
    societes:    filters.societe,
    statuses:    filters.statut,
    cahors:      filters.consultation_cahors,
    montant:     montantFilter,
  };
}

/**
 * Retourne les projets filtrés selon l'état UI courant.
 * Délègue la logique pure à ProjectUtils.filterProjects.
 */
function getFiltered() {
  let data = ProjectUtils.filterProjects(ALL, buildFilterCriteria());

  // Appliquer les filtres rapides depuis _state.quickFilters
  const qf = _state.quickFilters;
  if (qf.urgent)  data = data.filter(p => ProjectUtils.isUrgent(p));
  if (qf.cahors)  data = data.filter(p => ProjectUtils.isCahors(p));
  if (qf.notes)   data = data.filter(p => ProjectUtils.hasNotes(p));
  if (qf.overdue) data = data.filter(p => ProjectUtils.isOverdue(p));

  // Mode revue commerciale
  if (_state.reviewMode.active && _state.reviewMode.deadline) {
    data = data.filter(p => {
      const dl = ProjectUtils.parseDate(p.echeance);
      return dl && dl <= _state.reviewMode.deadline;
    });
  }

  return data;
}

function getFilteredByMapBounds() {
  const bounds = map.getBounds();
  return getFiltered().filter(d => {
    if (!d.latitude || !d.longitude) return false;
    const lat = Number(d.latitude), lng = Number(d.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
    return bounds.contains(L.latLng(lat, lng));
  });
}

function buildFilters() {
  Object.entries(FILTER_KEYS).forEach(([key, label]) => {
    const container = document.getElementById(`filter-${key}`); if (!container) return;
    container.innerHTML = `<strong>${label}</strong>`;
    [...new Set(ALL.map(d => d[key]).filter(v => v))].sort().forEach(v => {
      const l = document.createElement('label'); l.title = v;
      l.innerHTML = `<input type="checkbox"> ${shortenLabel(v, 22)}`;
      l.querySelector('input').onchange = e => {
        e.target.checked ? filters[key].add(v) : filters[key].delete(v);
        activeStatFilter = null; updateStatCards(); refresh();
      };
      container.appendChild(l);
    });
  });
}


function buildMontantFilter() {
  const vals=ALL.map(d=>parseMontant(d.montant)).filter(v=>v>0);
  if (!vals.length) return;
  const gMin=0, gMax=Math.max(...vals);

  let container=document.getElementById("filter-montant-range");
  if (container) container.remove();
  container=document.createElement("div");
  container.id="filter-montant-range";
  container.className="filter montant-range-filter";

  const fmt=v=>v>=1e6?(v/1e6).toFixed(1)+"M€":v>=1000?Math.round(v/1000)+"k€":v+"€";

  container.innerHTML=`
    <strong>💰 Filtre Montant</strong>
    <div class="range-track-wrap">
      <div class="range-labels"><span id="rng-min-lbl">${fmt(gMin)}</span><span id="rng-max-lbl">${fmt(gMax)}</span></div>
      <div class="range-sliders">
        <input type="range" id="rng-min" min="${gMin}" max="${gMax}" value="${gMin}" step="5000">
        <input type="range" id="rng-max" min="${gMin}" max="${gMax}" value="${gMax}" step="5000">
      </div>
    </div>
    <div id="rng-active-lbl" class="range-active-label" style="display:none"></div>
    <button id="rng-reset" class="range-reset-btn">✕ Réinitialiser</button>
  `;

  const filtersSection=document.getElementById("filters-section");
  if (filtersSection) filtersSection.appendChild(container);

  const minI=container.querySelector("#rng-min"), maxI=container.querySelector("#rng-max");
  const minL=container.querySelector("#rng-min-lbl"), maxL=container.querySelector("#rng-max-lbl");
  const activeL=container.querySelector("#rng-active-lbl");

  function updateRange() {
    let mn=parseInt(minI.value), mx=parseInt(maxI.value);
    if (mn>mx){mn=mx; minI.value=mn;}
    minL.textContent=fmt(mn); maxL.textContent=fmt(mx);
    const active=mn>gMin||mx<gMax;
    montantFilter={active,min:mn,max:mx};
    if (active){activeL.style.display="block"; activeL.textContent=`Filtre: ${fmt(mn)} — ${fmt(mx)}`;}
    else activeL.style.display="none";
    refresh();
  }
  minI.addEventListener("input",updateRange);
  maxI.addEventListener("input",updateRange);
  container.querySelector("#rng-reset").addEventListener("click",()=>{
    minI.value=gMin; maxI.value=gMax;
    montantFilter={active:false,min:0,max:Infinity};
    minL.textContent=fmt(gMin); maxL.textContent=fmt(gMax);
    activeL.style.display="none"; refresh();
  });
}

/* =====================================================
   STATS — délègue à ProjectUtils (computeKPIs + computePipelineKPIs)
===================================================== */
function updateStats() {
  const data = getFiltered();
  const kpi  = ProjectUtils.computeKPIs(data);
  // Pipeline : logique métier centralisée dans ProjectUtils
  const pipeline = ProjectUtils.computePipelineKPIs(data, kpi.tauxConversion);

  // Stats de base
  document.getElementById('stat-total').textContent  = kpi.total;
  document.getElementById('stat-obtenu').textContent = kpi.obtenu;
  document.getElementById('stat-perdu').textContent  = kpi.perdu;
  document.getElementById('stat-offre').textContent  = kpi.offre;

  const pct = v => kpi.total > 0 ? Math.round((v / kpi.total) * 100) + '%' : '0%';
  document.getElementById('stat-obtenu-pct').textContent = pct(kpi.obtenu);
  document.getElementById('stat-perdu-pct').textContent  = pct(kpi.perdu);
  document.getElementById('stat-offre-pct').textContent  = pct(kpi.offre);

  const caEl = document.getElementById('stat-ca-total');
  if (caEl) caEl.textContent = ProjectUtils.formatMontant(kpi.caTotal, true);

  const convEl = document.getElementById('kpi-conv-rate');
  if (convEl) convEl.textContent = kpi.tauxConversion !== null ? kpi.tauxConversion + '%' : '—';

  const caAvgEl = document.getElementById('kpi-ca-avg');
  if (caAvgEl) caAvgEl.textContent = kpi.caAvg !== null ? ProjectUtils.formatMontant(kpi.caAvg, true) : '—';

  const delayEl = document.getElementById('kpi-avg-delay');
  if (delayEl) delayEl.textContent = kpi.delaiMoyen !== null ? kpi.delaiMoyen + ' j' : '—';

  const overdueEl = document.getElementById('kpi-overdue');
  if (overdueEl) {
    overdueEl.textContent = kpi.overdueCount;
    overdueEl.parentElement?.classList.toggle('kpi-alert', kpi.overdueCount > 0);
  }

  // KPIs pipeline (désormais calculés par ProjectUtils)
  const caPlEl = document.getElementById('kpi-ca-pipeline');
  if (caPlEl) caPlEl.textContent = pipeline.caPipeline > 0
    ? ProjectUtils.formatMontant(pipeline.caPipeline, true) : '—';

  const topEl = document.getElementById('kpi-top-client');
  if (topEl && pipeline.topClient) {
    const name = pipeline.topClient.societe.length > 18
      ? pipeline.topClient.societe.slice(0,15) + '...'
      : pipeline.topClient.societe;
    topEl.textContent = `${name} (${pipeline.topClient.count})`;
    topEl.title = `${pipeline.topClient.societe} — ${pipeline.topClient.count} offres actives`;
  } else if (topEl) { topEl.textContent = '—'; }

  const dtEl = document.getElementById('kpi-decision-time');
  if (dtEl) dtEl.textContent = pipeline.avgDecisionDays !== null
    ? pipeline.avgDecisionDays + ' j' : '—';
}

function updateStatCards() {
  ["stat-total","stat-obtenu","stat-perdu","stat-offre"].forEach(id=>{
    const card=document.getElementById(id)?.parentElement; if(!card) return;
    const t=id.replace("stat-","");
    card.classList.toggle("active",activeStatFilter===t||(t==="total"&&!activeStatFilter));
  });
}
function setupStatClickHandlers() {
  document.querySelectorAll(".stat-card").forEach(card=>{
    card.addEventListener("click",()=>{
      let nf=null;
      if(card.classList.contains("obtenu")) nf="obtenu";
      else if(card.classList.contains("perdu"))  nf="perdu";
      else if(card.classList.contains("offre"))  nf="offre";
      activeStatFilter=activeStatFilter===nf?null:nf;
      chartFilter={active:false,type:null,societe:null};
      updateStatCards(); refresh();
    });
  });
}

/* =====================================================
   CHARTS
===================================================== */
let chartPerdu=null,chartObtenu=null,chartObtenuZone=null;
let chartMontant=null,chartMontantStatut=null;

function updateCharts() {
  const data=getFiltered();
  const perduByS={},obtenuByS={},obtenuByZ={};
  data.forEach(d=>{
    const s=d.statut?.toLowerCase()||"";
    const sc=d.societe||"—", z=d.zone_geo||"—";
    if(s.includes("perdu"))  perduByS[sc]=(perduByS[sc]||0)+1;
    if(s.includes("obtenu")){obtenuByS[sc]=(obtenuByS[sc]||0)+1; obtenuByZ[z]=(obtenuByZ[z]||0)+1;}
  });
  const perduSorted=Object.entries(perduByS).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const obtenuSorted=Object.entries(obtenuByS).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const zoneSorted=Object.entries(obtenuByZ).sort((a,b)=>b[1]-a[1]).slice(0,10);
  [chartPerdu,chartObtenu,chartObtenuZone,chartMontant,chartMontantStatut].forEach(c=>c&&c.destroy());

  const mkBar=(id,label,sorted,color,hover,horiz,clickCb)=>{
    const ctx=document.getElementById(id)?.getContext("2d"); if(!ctx) return null;
    return new Chart(ctx,{type:"bar",data:{
      labels:sorted.map(e=>shortenLabel(e[0],16)),
      datasets:[{label,data:sorted.map(e=>e[1]),backgroundColor:color,borderRadius:6,hoverBackgroundColor:hover}]
    },options:{responsive:true,maintainAspectRatio:true,indexAxis:horiz?"y":"x",onClick:clickCb,
      plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`${horiz?c.parsed.x:c.parsed.y} projet(s)`}}},
      scales:horiz?{x:{beginAtZero:true,ticks:{stepSize:1}}}:{y:{beginAtZero:true,ticks:{stepSize:1}}}}});
  };

  chartPerdu=mkBar("chart-perdu","Perdus",perduSorted,"#ef4444","#dc2626",false,(ev,els)=>{
    if(!els.length) return;
    const sc=perduSorted[els[0].index][0];
    chartFilter=(chartFilter.active&&chartFilter.type==="perdu"&&chartFilter.societe===sc)?
      {active:false,type:null,societe:null}:{active:true,type:"perdu",societe:sc};
    activeStatFilter=null; updateStatCards(); refresh();
  });
  chartObtenu=mkBar("chart-obtenu","Obtenus",obtenuSorted,"#10b981","#059669",false,(ev,els)=>{
    if(!els.length) return;
    const sc=obtenuSorted[els[0].index][0];
    chartFilter=(chartFilter.active&&chartFilter.type==="obtenu"&&chartFilter.societe===sc)?
      {active:false,type:null,societe:null}:{active:true,type:"obtenu",societe:sc};
    activeStatFilter=null; updateStatCards(); refresh();
  });
  chartObtenuZone=mkBar("chart-obtenu-zone","Par zone",zoneSorted,"#0d9488","#0f766e",true);

  // Montant par société
  const mByS={};
  data.forEach(d=>{if(!d.montant)return; const sc=d.societe||"—"; mByS[sc]=(mByS[sc]||0)+parseMontant(d.montant);});
  const mSorted=Object.entries(mByS).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const palette=["#6366f1","#0d9488","#f59e0b","#ef4444","#10b981","#3b82f6","#ec4899","#8b5cf6"];
  const ctxM=document.getElementById("chart-montant")?.getContext("2d");
  if(ctxM) chartMontant=new Chart(ctxM,{type:"bar",data:{
    labels:mSorted.map(e=>shortenLabel(e[0],16)),
    datasets:[{label:"Montant (€)",data:mSorted.map(e=>e[1]),backgroundColor:mSorted.map((_,i)=>palette[i%8]),borderRadius:6}]
  },options:{responsive:true,maintainAspectRatio:true,indexAxis:"y",
    onClick:(ev,els)=>{
      if(!els.length) return;
      const sc=mSorted[els[0].index][0];
      chartFilter=(chartFilter.active&&chartFilter.type==="montant"&&chartFilter.societe===sc)?
        {active:false,type:null,societe:null}:{active:true,type:"montant",societe:sc};
      activeStatFilter=null; updateStatCards(); refresh();
    },
    plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`${c.parsed.x.toLocaleString("fr-FR")} €`}}},
    scales:{x:{beginAtZero:true,ticks:{callback:v=>v>=1e6?(v/1e6).toFixed(1)+"M€":v>=1000?Math.round(v/1000)+"k€":v+"€"}}}}});

  // Donut montant par statut
  const mBySt={obtenu:0,perdu:0,offre:0,autre:0};
  data.forEach(d=>{if(!d.montant)return; mBySt[getStatusKey(d.statut)]+=parseMontant(d.montant);});
  const ctxMS=document.getElementById("chart-montant-statut")?.getContext("2d");
  if(ctxMS) chartMontantStatut=new Chart(ctxMS,{type:"doughnut",data:{
    labels:["Obtenus","Perdus","Offres","Autres"],
    datasets:[{data:[mBySt.obtenu,mBySt.perdu,mBySt.offre,mBySt.autre],
      backgroundColor:["#10b981","#ef4444","#3b82f6","#f59e0b"],borderWidth:3,borderColor:"#fff",hoverOffset:8}]
  },options:{responsive:true,maintainAspectRatio:true,plugins:{
    legend:{position:"bottom",labels:{font:{size:11},padding:10}},
    tooltip:{callbacks:{label:c=>{const t=c.dataset.data.reduce((a,b)=>a+b,0);const p=t>0?((c.parsed/t)*100).toFixed(1):0;return ` ${c.label}: ${c.parsed.toLocaleString("fr-FR")} \u20ac (${p}%)`;}}}
  }}});
}

/* =====================================================
   ACTIVE FILTERS DISPLAY
===================================================== */
function renderActiveFilters() {
  const c=document.getElementById("active-filters"); c.innerHTML="";
  const mkPill=(txt,cb)=>{
    const p=document.createElement("div"); p.className="filter-pill";
    p.innerHTML=`${txt} <span>×</span>`; p.onclick=cb; c.appendChild(p);
  };
  if(activeStatFilter) mkPill(`Statut: ${activeStatFilter}`,()=>{activeStatFilter=null;updateStatCards();refresh();});
  if(chartFilter.active) mkPill(`${chartFilter.type==="perdu"?"Perdus":chartFilter.type==="montant"?"CA":"Obtenus"}: ${shortenLabel(chartFilter.societe,20)}`,()=>{chartFilter={active:false,type:null,societe:null};refresh();});
  if(searchQuery) mkPill(`"${searchQuery}"`,()=>{searchQuery="";document.getElementById("search-input").value="";document.getElementById("clear-search").classList.remove("visible");refresh();});
  if(montantFilter.active){
    const fmt=v=>v>=1e6?(v/1e6).toFixed(1)+"M€":v>=1000?Math.round(v/1000)+"k€":v+"€";
    mkPill(`Montant: ${fmt(montantFilter.min)}–${fmt(montantFilter.max)}`,()=>{
      montantFilter={active:false,min:0,max:Infinity};
      const mi=document.getElementById("rng-min"),ma=document.getElementById("rng-max");
      if(mi){mi.value=mi.min;document.getElementById("rng-min-lbl").textContent=fmt(0);}
      if(ma){ma.value=ma.max;} const al=document.getElementById("rng-active-lbl"); if(al)al.style.display="none";
      refresh();
    });
  }
  Object.entries(filters).forEach(([key,set])=>set.forEach(value=>mkPill(`${FILTER_KEYS[key]}: ${shortenLabel(value,20)}`,()=>{
    set.delete(value);
    const cb=[...document.querySelectorAll(`#filter-${key} input`)].find(cb=>cb.parentElement.textContent.trim().startsWith(shortenLabel(value,22)));
    if(cb) cb.checked=false; refresh();
  })));
  if(filterByMapBounds) mkPill("Vue carte",()=>{filterByMapBounds=false;updateMapFilterButton();refresh();});
}

/* =====================================================
   RESET
===================================================== */
document.getElementById("reset").onclick=()=>{
  // Réinitialiser via App
  Object.values(filters).forEach(s=>s.clear());
  activeStatFilter=null; filterByMapBounds=false;
  chartFilter={active:false,type:null,societe:null};
  searchQuery=""; montantFilter.active=false; montantFilter.min=0; montantFilter.max=Infinity;
  document.getElementById("search-input").value="";
  document.getElementById("clear-search").classList.remove("visible");
  document.querySelectorAll(".filter input[type=checkbox]").forEach(cb=>(cb.checked=false));
  const mi=document.getElementById("rng-min"),ma=document.getElementById("rng-max");
  if(mi)mi.value=mi.min; if(ma)ma.value=ma.max;
  const al=document.getElementById("rng-active-lbl"); if(al)al.style.display="none";
  updateMapFilterButton(); updateStatCards(); refresh();
};

/* =====================================================
   COLLAPSIBLE SECTIONS
===================================================== */
document.getElementById("stats-header")?.addEventListener("click",()=>{
  document.getElementById("stats-section").classList.toggle("collapsed");
  document.getElementById("stats-header").classList.toggle("collapsed");
});
document.getElementById("filters-header")?.addEventListener("click",()=>{
  document.getElementById("filters-section").classList.toggle("collapsed");
  document.getElementById("filters-header").classList.toggle("collapsed");
});

/* =====================================================
   TOGGLES UI
===================================================== */
document.getElementById("toggle-sidebar").onclick=()=>{document.querySelector(".layout").classList.toggle("sidebar-collapsed");setTimeout(()=>map.invalidateSize(),350);};
document.getElementById("toggle-details").onclick=()=>{document.querySelector(".layout").classList.toggle("details-collapsed");setTimeout(()=>map.invalidateSize(),350);};
document.getElementById("toggle-table").onclick=()=>{document.querySelector(".layout").classList.toggle("table-collapsed");setTimeout(()=>map.invalidateSize(),350);};

const toggleMapFilterBtn=document.getElementById("toggle-map-filter");
toggleMapFilterBtn.onclick=()=>{filterByMapBounds=!filterByMapBounds;updateMapFilterButton();refresh();};
function updateMapFilterButton(){
  if(filterByMapBounds){toggleMapFilterBtn.textContent="✓ Filtre carte activé";toggleMapFilterBtn.style.background="linear-gradient(135deg,#10b981 0%,#059669 100%)";}
  else{toggleMapFilterBtn.textContent="🗺️ Filtrer par vue carte";toggleMapFilterBtn.style.background="";}
}

const toggleSatBtn=document.getElementById("toggle-satellite");
const toggleHeatBtn=document.getElementById("toggle-heatmap");
toggleSatBtn.onclick=()=>{
  satelliteVisible=!satelliteVisible;
  if(satelliteVisible){map.removeLayer(osmLayer);satelliteLayer.addTo(map);toggleSatBtn.classList.add("active");}
  else{map.removeLayer(satelliteLayer);osmLayer.addTo(map);toggleSatBtn.classList.remove("active");}
};
toggleHeatBtn.onclick=()=>{
  heatmapVisible=!heatmapVisible;
  if(heatmapVisible){updateHeatmap();toggleHeatBtn.classList.add("active");}
  else{if(heatmapLayer){map.removeLayer(heatmapLayer);heatmapLayer=null;}toggleHeatBtn.classList.remove("active");}
};
function updateHeatmap(){
  if(heatmapLayer) map.removeLayer(heatmapLayer);
  const pts=(filterByMapBounds?getFilteredByMapBounds():getFiltered()).filter(d=>d.latitude&&d.longitude).map(d=>{
    const s=d.statut?.toLowerCase()||"";
    let i=0.5; if(s.includes("obtenu"))i=1.0; else if(s.includes("perdu"))i=0.7; else if(s.includes("offre"))i=0.8;
    return[Number(d.latitude),Number(d.longitude),i];
  });
  if(pts.length>0) heatmapLayer=L.heatLayer(pts,{radius:25,blur:15,maxZoom:10,max:1.0,gradient:{"0.0":"#3b82f6","0.5":"#f59e0b","0.7":"#ef4444","1.0":"#10b981"}}).addTo(map);
}
function updateTableOnMapMove(){if(filterByMapBounds)refresh();}
map.on("moveend",updateTableOnMapMove); map.on("zoomend",updateTableOnMapMove);

/* =====================================================
   DETAILS PANEL
===================================================== */
let currentDetailData=null;
function detailField(label,value,key){
  const disp=(key==="creation"||key==="echeance")&&value?formatDateDisplay(value):(value??"—");
  return `<div class="label">${label}</div><div class="value" data-key="${key}" title="${value??""}">${escapeHtml(String(disp))}</div>`;
}

function showDetails(d){
  currentDetailData=d; selectMarker(d);
  const mapsUrl=d.latitude&&d.longitude?`https://www.google.com/maps?q=${d.latitude},${d.longitude}`:null;
  const customFields=customColumns.map(c=>detailField(c.label,d[c.key]??"",c.key)).join("");
  document.getElementById("details").innerHTML=`
    <h2 title="${d.projet||""}">${d.projet||"—"}</h2>
    <div class="details-actions">
      <button id="zoom-btn">🎯 Zoom</button>
      <button id="blink-btn">✨ Clignoter</button>
      <button id="stop-btn">⛔ Stop</button>
      ${mapsUrl?`<a class="maps-link" href="${mapsUrl}" target="_blank">📍 Maps</a>`:""}
    </div>
    ${d.montant?`<div class="detail-montant-banner">💰 ${d.montant}</div>`:""}
    <div class="details-grid">
      ${detailField("Société",d.societe,"societe")}
      ${detailField("AO",d.ao,"ao")}
      ${detailField("Année",d.annee,"annee")}
      ${detailField("Zone",d.zone_geo,"zone_geo")}
      ${detailField("Statut",d.statut,"statut")}
      ${detailField("Consultation CAHORS",d.consultation_cahors,"consultation_cahors")}
      ${detailField("Création",d.creation,"creation")}
      ${detailField("Échéance",d.echeance,"echeance")}
      ${detailField("Montant",d.montant,"montant")}
      ${customFields}
    </div>
    <div class="notes-section">
      <h3>📝 Notes</h3>
      <div class="notes-container">
        <div id="notes-display">
          ${d.notes?`<div class="notes-display">${escapeHtml(d.notes)}</div>`:`<div class="notes-empty">Aucune note</div>`}
        </div>
        <button id="notes-edit-btn" class="notes-edit-btn">✏️ ${d.notes?"Modifier":"Ajouter"} une note</button>
      </div>
    </div>
  `;
  document.getElementById("zoom-btn").onclick=()=>zoomOn(d);
  document.getElementById("blink-btn").onclick=startBlink;
  document.getElementById("stop-btn").onclick=stopBlink;
  document.getElementById("notes-edit-btn").onclick=()=>editNote(d);
  if(editMode) enableDetailEditing(d);
}

function enableDetailEditing(d){
  document.querySelectorAll(".details-grid .value").forEach(el=>{
    const key=el.getAttribute("data-key"); if(!key) return;
    el.style.cursor="pointer"; el.title="Cliquer pour éditer";
    el.onmouseenter=()=>el.style.background="var(--primary-light)";
    el.onmouseleave=()=>el.style.background="";
    el.onclick=()=>{
      if(key==="statut") showStatusSelect(el,d,key,d[key]||"");
      else showEditInput(el,d,key,d[key]||"");
    };
  });
}
function showStatusSelect(el,d,key,current){
  const all=[...new Set(ALL.map(i=>i.statut).filter(v=>v))].sort();
  const orig=el.innerHTML;
  const sel=document.createElement("select");
  sel.style.cssText="width:100%;padding:6px;border:2px solid var(--primary);border-radius:6px;font-size:13px;font-family:inherit;background:white;";
  [current,...all.filter(s=>s!==current),"__NEW__"].forEach(s=>{
    const o=document.createElement("option"); o.value=s; o.textContent=s==="__NEW__"?"+ Nouvelle...":s||"—"; o.selected=s===current; sel.appendChild(o);
  });
  el.innerHTML=""; el.appendChild(sel); sel.focus();
  sel.onchange=()=>{
    if(sel.value==="__NEW__"){const nv=prompt("Nouveau statut:",current); if(nv?.trim()) updateDetailField(d,key,nv.trim(),el,orig); else{el.innerHTML=orig;enableDetailEditing(d);}}
    else updateDetailField(d,key,sel.value,el,orig);
  };
  sel.onblur=()=>setTimeout(()=>{if(sel.parentElement){el.innerHTML=orig;enableDetailEditing(d);}},200);
}
function showEditInput(el,d,key,current){
  const display=(key==="creation"||key==="echeance")&&current?formatDateDisplay(current):current;
  const orig=el.innerHTML;
  const inp=document.createElement("input"); inp.type="text"; inp.value=display;
  inp.style.cssText="width:100%;padding:6px;border:2px solid var(--primary);border-radius:6px;font-size:13px;font-family:inherit;";
  el.innerHTML=""; el.appendChild(inp); inp.focus(); inp.select();
  const sv=()=>updateDetailField(d,key,inp.value.trim(),el,orig);
  inp.onblur=sv;
  inp.onkeydown=e=>{if(e.key==="Enter")sv(); else if(e.key==="Escape"){el.innerHTML=orig;enableDetailEditing(d);}};
}
function updateDetailField(d, key, newValue, el, orig) {
  const isDate = key === 'creation' || key === 'echeance';
  const stored = isDate ? formatDateStorage(newValue) : newValue;
  d[key] = stored;
  // Déléguer la persistance et la synchronisation à App.data
  _data.updateField(d.id, key, newValue);
  // updateField appelle save() + emit('change') — refresh() est abonné à 'change'
  showDetails(d);
}
function editNote(d){
  const nc=document.querySelector(".notes-container");
  nc.innerHTML=`
    <textarea class="notes-textarea" id="notes-input" placeholder="Notes...">${d.notes||""}</textarea>
    <div class="notes-actions">
      <button id="notes-save" class="notes-save">💾 Enregistrer</button>
      <button id="notes-cancel" class="notes-cancel">❌ Annuler</button>
    </div>
    <div id="auto-save-indicator" style="text-align:center;margin-top:8px;font-size:11px;color:var(--muted);"></div>
  `;
  const ta=document.getElementById("notes-input"),ind=document.getElementById("auto-save-indicator");
  ta.focus(); ta.setSelectionRange(ta.value.length,ta.value.length);
  let timer=null,dirty=false;
  ta.addEventListener("input",()=>{
    dirty=true; ind.textContent="✏️ En cours..."; ind.style.color="#f59e0b";
    clearTimeout(timer);
    timer=setTimeout(()=>{saveNote(d,ta.value.trim(),false);dirty=false;ind.textContent="✅ Auto-sauvegardé";ind.style.color="#10b981";setTimeout(()=>ind.textContent="",2000);},1000);
  });
  document.getElementById("notes-save").onclick=()=>{clearTimeout(timer);saveNote(d,ta.value.trim(),true);};
  document.getElementById("notes-cancel").onclick=()=>{clearTimeout(timer);if(dirty&&!confirm("Modifications non sauvegardées. Annuler ?"))return;showDetails(d);};
}
function saveNote(d,note,show){
  _data.saveNote(d.id, note);
  d.notes = note; // garder la référence locale en sync
  if(show) setTimeout(()=>showDetails(d),500);
}

/* =====================================================
   REFRESH — tableau + carte
===================================================== */
function refresh(){
  markers.forEach(m=>map.removeLayer(m)); markers.clear(); clearActiveMarker();
  const allFiltered=getFiltered();
  const tableData=filterByMapBounds?getFilteredByMapBounds():allFiltered;
  const sorted=applySortToData(tableData);
  const bounds=[];

  allFiltered.forEach(d=>{
    if(!d.latitude||!d.longitude) return;
    const lat=Number(d.latitude),lng=Number(d.longitude);
    if(!Number.isFinite(lat)||!Number.isFinite(lng)) return;
    const m=L.circleMarker([lat,lng],getMarkerStyle(d.statut)).addTo(map);
    m.on("click",()=>showDetails(d)); markers.set(d.id,m); bounds.push([lat,lng]);
  });
  if(!filterByMapBounds&&bounds.length>0) map.fitBounds(bounds,{padding:[40,40],animate:false});
  if(heatmapVisible) updateHeatmap();

  const tbody=document.getElementById("table-body"); tbody.innerHTML="";
  sorted.forEach(d=>{
    const tr=document.createElement("tr");
    tr.classList.add(`status-${getStatusKey(d.statut)}`);
    TABLE_COLUMNS.forEach(k=>{
      if(!visibleColumns[k]) return;
      const td=document.createElement("td"); td.dataset.column=k;
      const type=getColumnType(k);
      if(type==="coord") td.textContent=d[k]!=null?Number(d[k]).toFixed(4):"";
      else if(type==="date") td.textContent=d[k]?formatDateDisplay(d[k]):"";
      else if(k==="statut"){
        const badge=document.createElement("span");
        badge.className=`status-badge ${getStatusKey(d[k])}`; badge.textContent=d[k]||"—"; td.appendChild(badge);
      }
      else if(type==="montant"||k==="montant"){td.className=d[k]?"montant-cell":""; td.textContent=d[k]||"—";}
      else if(type==="number"){td.textContent=d[k]!=null?d[k]:"—"; td.style.textAlign="right";}
      else td.textContent=d[k]??"";
      tr.appendChild(td);
    });
    tr.onclick=()=>showDetails(d);
    tbody.appendChild(tr);
  });

  updateStats(); renderActiveFilters(); updateCharts();
  renderTableHeader(); // met à jour les flèches de tri
}

/* =====================================================
   EDIT MODE
===================================================== */
let editMode=false;
const toggleEditBtn=document.getElementById("toggle-edit");
toggleEditBtn.onclick=()=>{
  editMode=!editMode;
  toggleEditBtn.textContent=editMode?"💾 Sauvegarder":"✏️ Activer modification";
  toggleEditBtn.style.background=editMode?"linear-gradient(135deg,#16a34a 0%,#15803d 100%)":"linear-gradient(135deg,#1e293b 0%,#0f172a 100%)";
  if(editMode){enableEditMode();if(currentDetailData)enableDetailEditing(currentDetailData);}
  else{disableEditMode();save();refresh();}
};
function enableEditMode(){
  document.querySelectorAll("#table-body tr").forEach((tr,i)=>{
    const d=applySortToData(filterByMapBounds?getFilteredByMapBounds():getFiltered())[i]; if(!d) return;
    tr.querySelectorAll("td").forEach(td=>{
      const col=td.getAttribute("data-column");
      if(!col||col==="latitude"||col==="longitude") return;
      td.contentEditable=true;
      td.style.cssText="cursor:text;background:#fffbeb;outline:1px solid #fbbf24;";
      td.addEventListener("blur",function(){
        let v=td.textContent.trim();
        if(col==="creation"||col==="echeance") v=formatDateStorage(v);
        d[col]=v; const idx=ALL.findIndex(i=>i.id===d.id); if(idx!==-1) ALL[idx][col]=v;
      });
    });
  });
}
function disableEditMode(){
  document.querySelectorAll("#table-body td").forEach(td=>{
    td.contentEditable=false; td.style.cursor=""; td.style.background=""; td.style.outline="";
  });
}

/* =====================================================
   GESTION COLONNES CUSTOM — délègue à App.columns
===================================================== */
function addCustomColumn(key,label,type){
  if(!key||!label) return;
  if(!_cols.addCustom(key, label, type)) {
    alert(`❌ La clé "${key}" existe déjà.`); return;
  }
  buildColumnToggles(); renderTableHeader(); refresh();
}

function deleteCustomColumn(key){
  if(_cols.isSystem(key)){alert("❌ Colonne système non supprimable.");return;}
  if(!confirm(`Supprimer la colonne "${_cols.getLabel(key)}" ?\n⚠️ Toutes les données de cette colonne seront perdues.`)) return;
  _cols.removeCustom(key);
  buildColumnToggles(); renderTableHeader(); refresh();
}

/* =====================================================
   COLUMN TOGGLES — avec drag & drop et suppression
===================================================== */
function buildColumnToggles(){
  const container=document.getElementById("column-toggles"); if(!container) return;
  container.innerHTML="";

  TABLE_COLUMNS.forEach(col=>{
    const label=document.createElement("label");
    label.className="column-toggle"; label.draggable=true; label.dataset.col=col;

    const checkbox=document.createElement("input"); checkbox.type="checkbox"; checkbox.checked=!!visibleColumns[col];
    checkbox.onchange=()=>{
      _cols.setVisible(col, checkbox.checked);
      renderTableHeader(); refresh();
    };

    const txt=document.createElement("span"); txt.textContent=getColumnLabel(col); txt.style.flex="1";

    const grip=document.createElement("span"); grip.textContent="⠿";
    grip.style.cssText="color:var(--muted);cursor:grab;font-size:14px;padding:0 4px;";

    label.appendChild(checkbox); label.appendChild(txt);

    if(!isSystemCol(col)){
      const del=document.createElement("button"); del.textContent="🗑";
      del.title="Supprimer cette colonne";
      del.style.cssText="background:none;border:none;cursor:pointer;font-size:12px;padding:0 2px;opacity:0.6;";
      del.onclick=e=>{e.preventDefault();e.stopPropagation();deleteCustomColumn(col);};
      label.appendChild(del);
    }
    label.appendChild(grip);
    container.appendChild(label);
  });

  // Drag & drop pour réordonner
  let dragSrc=null;
  container.querySelectorAll(".column-toggle").forEach(el=>{
    el.addEventListener("dragstart",e=>{dragSrc=el;e.dataTransfer.effectAllowed="move";el.classList.add("dragging");});
    el.addEventListener("dragend",()=>el.classList.remove("dragging"));
    el.addEventListener("dragover",e=>{e.preventDefault();e.dataTransfer.dropEffect="move";el.classList.add("drag-over");});
    el.addEventListener("dragleave",()=>el.classList.remove("drag-over"));
    el.addEventListener("drop",e=>{
      e.preventDefault(); el.classList.remove("drag-over");
      if(dragSrc===el) return;
      const si=TABLE_COLUMNS.indexOf(dragSrc.dataset.col), di=TABLE_COLUMNS.indexOf(el.dataset.col);
      if(si===-1||di===-1) return;
      TABLE_COLUMNS.splice(si,1); TABLE_COLUMNS.splice(di,0,dragSrc.dataset.col);
      _cols.setOrder([...TABLE_COLUMNS]);
      buildColumnToggles(); renderTableHeader(); refresh();
    });
  });
}

/* =====================================================
   MODALE AJOUT COLONNE
===================================================== */
function showAddColumnModal(){
  const modal=document.createElement("div");
  modal.style.cssText="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;z-index:10000;backdrop-filter:blur(4px);";
  modal.innerHTML=`
    <div style="background:white;padding:32px;border-radius:20px;max-width:440px;width:90%;box-shadow:0 25px 50px rgba(0,0,0,0.35);">
      <h2 style="margin:0 0 20px;font-size:20px;font-weight:900;color:var(--primary);">➕ Nouvelle colonne</h2>
      <div style="display:grid;gap:14px;">
        <div>
          <label style="display:block;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;margin-bottom:6px;">Nom d'affichage *</label>
          <input id="col-label" type="text" placeholder="Ex: Chargé d'affaire" style="width:100%;padding:10px;border:2px solid var(--border);border-radius:10px;font-size:14px;font-family:inherit;box-sizing:border-box;">
        </div>
        <div>
          <label style="display:block;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;margin-bottom:4px;">Clé interne (sans espaces)</label>
          <input id="col-key" type="text" placeholder="Ex: charge_affaire" style="width:100%;padding:10px;border:2px solid var(--border);border-radius:10px;font-size:14px;font-family:inherit;box-sizing:border-box;">
          <small style="color:var(--muted);font-size:11px;">Générée automatiquement — modifiable</small>
        </div>
        <div>
          <label style="display:block;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;margin-bottom:6px;">Type</label>
          <select id="col-type" style="width:100%;padding:10px;border:2px solid var(--border);border-radius:10px;font-size:14px;font-family:inherit;background:white;">
            <option value="text">📝 Texte libre</option>
            <option value="number">🔢 Nombre</option>
            <option value="date">📅 Date (JJ/MM/AA)</option>
            <option value="montant">💰 Montant (€)</option>
          </select>
        </div>
      </div>
      <div style="display:flex;gap:10px;margin-top:24px;">
        <button id="col-add-confirm" style="flex:1;padding:12px;background:linear-gradient(135deg,var(--primary),var(--primary-hover));color:white;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;">✅ Créer</button>
        <button id="col-add-cancel" style="flex:1;padding:12px;background:linear-gradient(135deg,#6b7280,#4b5563);color:white;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;">❌ Annuler</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const labelI=modal.querySelector("#col-label"), keyI=modal.querySelector("#col-key");
  labelI.focus();

  // Auto-génération de la clé
  labelI.addEventListener("input",()=>{
    if(!keyI._edited) keyI.value=labelI.value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"");
  });
  keyI.addEventListener("input",()=>{keyI._edited=true;});

  modal.querySelector("#col-add-confirm").onclick=()=>{
    const label=labelI.value.trim();
    const key=keyI.value.trim().toLowerCase().replace(/[^a-z0-9_]/g,"");
    const type=modal.querySelector("#col-type").value;
    if(!label||!key){alert("Nom et clé requis.");return;}
    addCustomColumn(key,label,type);
    document.body.removeChild(modal);
  };
  modal.querySelector("#col-add-cancel").onclick=()=>document.body.removeChild(modal);
  modal.addEventListener("click",e=>{if(e.target===modal)document.body.removeChild(modal);});
}

function buildAddColumnButton(){
  let wrap=document.getElementById("add-column-wrap"); if(wrap) return;
  wrap=document.createElement("div"); wrap.id="add-column-wrap"; wrap.style.marginTop="12px";
  const btn=document.createElement("button"); btn.id="add-column-btn";
  btn.textContent="➕ Ajouter une colonne";
  btn.style.cssText="width:100%;padding:10px;font-size:12px;font-weight:700;background:linear-gradient(135deg,#6366f1,#4f46e5);color:white;border:none;border-radius:10px;cursor:pointer;letter-spacing:0.04em;";
  btn.onclick=showAddColumnModal;
  wrap.appendChild(btn);
  const ct=document.getElementById("column-toggles"); if(ct) ct.parentElement.appendChild(wrap);
}

/* =====================================================
   SEARCH
===================================================== */
const searchInput=document.getElementById("search-input");
const clearSearchBtn=document.getElementById("clear-search");
searchInput.addEventListener("input",e=>{searchQuery=e.target.value;clearSearchBtn.classList.toggle("visible",searchQuery.length>0);refresh();});
clearSearchBtn.addEventListener("click",()=>{searchQuery="";searchInput.value="";clearSearchBtn.classList.remove("visible");refresh();});

/* =====================================================
   EXPORTS
===================================================== */
document.getElementById("export-csv").addEventListener("click",()=>{
  const data=applySortToData(getFiltered());
  const cols=TABLE_COLUMNS.filter(c=>visibleColumns[c]);
  const hdr=cols.map(c=>getColumnLabel(c)).join(",");
  const rows=data.map(d=>cols.map(c=>{
    let v=d[c]??""; const t=getColumnType(c);
    if(t==="date"&&v) v=formatDateDisplay(v);
    v=String(v); if(v.includes(",")||v.includes('"')||v.includes("\n")) v=`"${v.replace(/"/g,'""')}"`;
    return v;
  }).join(","));
  downloadFile([hdr,...rows].join("\n"),"cahors-export.csv","text/csv;charset=utf-8;");
  flashBtn("export-csv");
});
document.getElementById("export-json").addEventListener("click",()=>{
  downloadFile(JSON.stringify(applySortToData(getFiltered()),null,2),"cahors-export.json","application/json");
});
document.getElementById("export-excel").addEventListener("click",()=>{
  const data=applySortToData(getFiltered());
  const cols=TABLE_COLUMNS.filter(c=>visibleColumns[c]);
  const excelData=data.map(d=>{
    const row={};
    cols.forEach(c=>{let v=d[c]??""; const t=getColumnType(c); if(t==="date"&&v)v=formatDateDisplay(v); row[getColumnLabel(c)]=v;});
    return row;
  });
  const wb=XLSX.utils.book_new(), ws=XLSX.utils.json_to_sheet(excelData);
  const range=XLSX.utils.decode_range(ws["!ref"]);
  for(let C=range.s.c;C<=range.e.c;++C){
    const addr=XLSX.utils.encode_col(C)+"1"; if(!ws[addr]) continue;
    ws[addr].s={font:{bold:true,color:{rgb:"FFFFFF"}},fill:{fgColor:{rgb:"0d9488"}},alignment:{horizontal:"center"}};
  }
  for(let R=range.s.r+1;R<=range.e.r;++R){
    const rd=data[R-1]; const s=rd.statut?.toLowerCase()||"";
    const bg=s.includes("obtenu")?"d1fae5":s.includes("perdu")?"fee2e2":s.includes("offre")?"dbeafe":"fef3c7";
    for(let C=range.s.c;C<=range.e.c;++C){
      const addr=XLSX.utils.encode_col(C)+(R+1); if(!ws[addr])ws[addr]={t:"s",v:""};
      ws[addr].s={fill:{fgColor:{rgb:bg}},alignment:{vertical:"center"}};
    }
  }
  ws["!cols"]=cols.map(c=>{
    if(["projet","notes"].includes(c)) return{wch:38};
    if(c==="societe") return{wch:26};
    if(c==="statut") return{wch:20};
    if(c==="montant") return{wch:18};
    return{wch:13};
  });
  ws["!freeze"]={ySplit:1}; ws["!autofilter"]={ref:ws["!ref"]};
  XLSX.utils.book_append_sheet(wb,ws,"Projets CAHORS");
  XLSX.writeFile(wb,`cahors-${new Date().toISOString().slice(0,10)}.xlsx`);
  flashBtn("export-excel");
});
document.getElementById("export-datajs").addEventListener("click",()=>{
  downloadFile(`const DATA = ${JSON.stringify(ALL,null,2)};`,"data.js","text/javascript");
  flashBtn("export-datajs");
});

/* =====================================================
   NOUVEAU PROJET — délègue à App.data.addProject
===================================================== */
function createNewProject(values) {
  const raw = {
    annee:  values.annee  || '',
    ao:     values.ao     || '',
    societe: values.societe || '',
    projet:  values.projet  || '',
    etat_correspondance_trello: values.etat_correspondance_trello || '',
    zone_geo: values.zone_geo || '',
    consultation_cahors: values.consultation_cahors || '',
    creation: values.creation || '',
    echeance: values.echeance || '',
    montant:  values.montant  || null,
    latitude:  values.latitude  ? Number(values.latitude)  : null,
    longitude: values.longitude ? Number(values.longitude) : null,
    notes: values.notes || '',
  };
  customColumns.forEach(c => { raw[c.key] = values[c.key] || ''; });

  const proj = _data.addProject(raw);
  // addProject() appelle save() + emit('change') → refresh() automatique
  showDetails(proj);
  if (proj.latitude && proj.longitude) zoomOn(proj, 14);
}

function showNewProjectForm(){
  const modal=document.createElement("div");
  modal.style.cssText="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:10000;backdrop-filter:blur(4px);";
  const inp=(name,label,type="text",ph="")=>`
    <div>
      <label style="display:block;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;margin-bottom:5px;">${label}</label>
      <input type="${type}" name="${name}" placeholder="${ph}" style="width:100%;padding:10px;border:2px solid var(--border);border-radius:10px;font-size:14px;font-family:inherit;box-sizing:border-box;">
    </div>`;
  const sel=(name,label,opts)=>`
    <div>
      <label style="display:block;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;margin-bottom:5px;">${label}</label>
      <select name="${name}" style="width:100%;padding:10px;border:2px solid var(--border);border-radius:10px;font-size:14px;font-family:inherit;background:white;">
        <option value="">-- Sélectionner --</option>
        ${opts.map(o=>`<option value="${o}">${o}</option>`).join("")}
      </select>
    </div>`;
  const customFields=customColumns.map(c=>inp(c.key,c.label,"text",c.type==="date"?"JJ/MM/AA":"")).join("");
  modal.innerHTML=`
    <div style="background:white;padding:32px;border-radius:20px;max-width:620px;width:90%;max-height:90vh;overflow-y:auto;box-shadow:0 25px 50px rgba(0,0,0,0.4);">
      <h2 style="margin:0 0 20px;font-size:22px;font-weight:900;background:linear-gradient(135deg,var(--primary),var(--accent));-webkit-background-clip:text;-webkit-text-fill-color:transparent;">✨ Nouveau projet</h2>
      <form id="new-project-form" style="display:grid;gap:12px;">
        ${inp("projet","Projet *","text","Nom du projet")}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          ${inp("societe","Société","text","Société")}
          ${inp("zone_geo","Zone","text","ex: Nord-Est")}
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          ${inp("ao","AO","text","ex: 250507")}
          ${inp("annee","Année","number","2025")}
        </div>
        ${sel("statut","Statut",["Offre remise","PROJET  obtenu","PROJET  perdu"])}
        ${sel("consultation_cahors","Consultation CAHORS",["Oui","Non"])}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          ${inp("creation","Création","text","JJ/MM/AA")}
          ${inp("echeance","Échéance","text","JJ/MM/AA")}
        </div>
        ${inp("montant","Montant (€)","text","ex: 500 000 €")}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          ${inp("latitude","Latitude","number","48.8566")}
          ${inp("longitude","Longitude","number","2.3522")}
        </div>
        ${customFields?`<div style="border-top:2px solid var(--border);padding-top:10px;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;">Champs personnalisés</div>${customFields}`:""}
        <div>
          <label style="display:block;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;margin-bottom:5px;">Notes</label>
          <textarea name="notes" rows="2" style="width:100%;padding:10px;border:2px solid var(--border);border-radius:10px;font-size:14px;font-family:inherit;resize:vertical;box-sizing:border-box;" placeholder="Notes..."></textarea>
        </div>
        <div style="display:flex;gap:10px;margin-top:8px;">
          <button type="submit" style="flex:1;padding:13px;background:linear-gradient(135deg,var(--primary),var(--primary-hover));color:white;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;">✅ Créer</button>
          <button type="button" id="cancel-new-project" style="flex:1;padding:13px;background:linear-gradient(135deg,#6b7280,#4b5563);color:white;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;">❌ Annuler</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(modal);
  setTimeout(()=>modal.querySelector("input[name='projet']").focus(),80);
  modal.querySelector("#new-project-form").addEventListener("submit",e=>{
    e.preventDefault();
    const fd=new FormData(modal.querySelector("#new-project-form")),values={};
    for(const[k,v]of fd.entries()) values[k]=v.trim();
    createNewProject(values); document.body.removeChild(modal);
  });
  modal.querySelector("#cancel-new-project").onclick=()=>document.body.removeChild(modal);
  modal.addEventListener("click",e=>{if(e.target===modal)document.body.removeChild(modal);});
}

const dataActionsDiv=document.querySelector(".data-actions");
if(dataActionsDiv){
  const btn=document.createElement("button"); btn.id="add-project-btn"; btn.textContent="✨ Nouveau projet";
  btn.style.cssText="background:linear-gradient(135deg,#8b5cf6,#7c3aed);color:white;";
  btn.onclick=showNewProjectForm; dataActionsDiv.insertBefore(btn,dataActionsDiv.firstChild);
}

/* =====================================================
   SAUVEGARDE / IMPORT — délègue à App.backup
===================================================== */
document.getElementById("save-backup").addEventListener("click",()=>{
  const bk = _app.backup.export();
  downloadFile(JSON.stringify(bk,null,2),`cahors-backup-${new Date().toISOString().slice(0,10)}.json`,"application/json");
  flashBtn("save-backup","✅ Sauvegardé !");
});
document.getElementById("import-backup").addEventListener("change",e=>{
  const file=e.target.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=ev=>{
    try{
      const bk=JSON.parse(ev.target.result);
      if(!bk.data||!Array.isArray(bk.data)){alert("❌ Format invalide");return;}
      const nc=bk.data.filter(d=>d.notes?.trim()).length;
      if(!confirm(`Importer ?\n\nDate: ${bk.timestamp?new Date(bk.timestamp).toLocaleString("fr-FR"):"?"}\nProjets: ${bk.data.length}\nNotes: ${nc}\n\n⚠️ Remplace les données actuelles !`)){e.target.value="";return;}
      _app.backup.import(bk);
      // Réinitialiser les scalaires UI locaux
      activeStatFilter=null;filterByMapBounds=false;chartFilter={active:false,type:null,societe:null};
      searchQuery="";searchInput.value="";clearSearchBtn.classList.remove("visible");
      buildColumnToggles();buildFilters();renderTableHeader();buildMontantFilter();refresh();
      alert(`✅ Importé ! ${bk.data.length} projets.`);
    }catch(err){console.error(err);alert("❌ Erreur de lecture");}
    e.target.value="";
  };
  reader.onerror=()=>{alert("❌ Erreur fichier");e.target.value="";};
  reader.readAsText(file);
});

/* =====================================================
   VUE CALENDRIER DES ÉCHÉANCES
===================================================== */
let calendarVisible = false;
let calendarCurrentMonth = new Date();
calendarCurrentMonth.setDate(1);

function buildCalendarView() {
  // Créer le conteneur s'il n'existe pas
  let wrap = document.getElementById("calendar-view");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.id = "calendar-view";
    wrap.className = "calendar-view";
    wrap.style.display = "none";
    // Insérer après la table-wrapper
    document.querySelector(".table-wrapper")?.after(wrap);
  }
  renderCalendar();
}

function renderCalendar() {
  const wrap = document.getElementById("calendar-view");
  if (!wrap) return;

  const year  = calendarCurrentMonth.getFullYear();
  const month = calendarCurrentMonth.getMonth();
  const today = new Date(); today.setHours(0,0,0,0);

  // Projets avec échéance ce mois
  const data = getFiltered();
  const byDay = {};
  data.forEach(d => {
    if (!d.echeance) return;
    const dt = new Date(d.echeance);
    if (dt.getFullYear() === year && dt.getMonth() === month) {
      const day = dt.getDate();
      if (!byDay[day]) byDay[day] = [];
      byDay[day].push(d);
    }
  });

  const MONTHS_FR = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
  const DAYS_FR   = ["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];

  // Nombre de jours dans le mois + premier jour (lundi=0)
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let firstDay = new Date(year, month, 1).getDay(); // 0=dim
  firstDay = firstDay === 0 ? 6 : firstDay - 1;    // → lundi=0

  // Compte de projets ce mois
  const totalThisMonth = Object.values(byDay).flat().length;

  let html = `
    <div class="cal-header">
      <button class="cal-nav" id="cal-prev">◀</button>
      <div class="cal-title">
        <span class="cal-month-name">${MONTHS_FR[month]} ${year}</span>
        ${totalThisMonth > 0 ? `<span class="cal-count-badge">${totalThisMonth} échéance${totalThisMonth > 1 ? "s" : ""}</span>` : ""}
      </div>
      <button class="cal-nav" id="cal-next">▶</button>
      <button class="cal-today-btn" id="cal-today">Aujourd'hui</button>
      <button class="cal-close-btn" id="cal-close">✕ Fermer</button>
    </div>
    <div class="cal-grid">
      ${DAYS_FR.map(d => `<div class="cal-day-label">${d}</div>`).join("")}
      ${Array(firstDay).fill('<div class="cal-cell empty"></div>').join("")}
  `;

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const isToday = date.getTime() === today.getTime();
    const isPast  = date < today;
    const projects = byDay[day] || [];
    const hasProj  = projects.length > 0;

    let cellClass = "cal-cell";
    if (isToday) cellClass += " cal-today";
    if (isPast && !isToday) cellClass += " cal-past";
    if (hasProj) cellClass += " cal-has-projects";

    const dots = projects.map(p => {
      const sk = getStatusKey(p.etat_correspondance_trello);
      const overdue = date < today && (sk === "offre" || sk === "autre");
      return `<span class="cal-dot cal-dot-${sk}${overdue ? " overdue" : ""}" title="${p.projet} (${p.societe || "—"})"></span>`;
    }).join("");

    const badges = projects.slice(0, 2).map(p => {
      const sk = getStatusKey(p.etat_correspondance_trello);
      return `<div class="cal-badge cal-badge-${sk}" title="${p.projet}">${p.projet.length > 14 ? p.projet.slice(0,13) + "…" : p.projet}</div>`;
    }).join("");
    const moreTag = projects.length > 2 ? `<div class="cal-badge cal-badge-more">+${projects.length - 2} autres</div>` : "";

    html += `
      <div class="${cellClass}" data-day="${day}">
        <span class="cal-day-num">${day}</span>
        <div class="cal-dots">${dots}</div>
        <div class="cal-badges">${badges}${moreTag}</div>
      </div>
    `;
  }

  html += `</div>`;

  // Mini-liste du jour sélectionné
  html += `<div class="cal-detail" id="cal-detail"><p class="cal-detail-hint">Cliquez sur un jour pour voir les projets</p></div>`;

  wrap.innerHTML = html;

  // Navigation
  document.getElementById("cal-prev").onclick = () => {
    calendarCurrentMonth.setMonth(calendarCurrentMonth.getMonth() - 1);
    renderCalendar();
  };
  document.getElementById("cal-next").onclick = () => {
    calendarCurrentMonth.setMonth(calendarCurrentMonth.getMonth() + 1);
    renderCalendar();
  };
  document.getElementById("cal-today").onclick = () => {
    calendarCurrentMonth = new Date(); calendarCurrentMonth.setDate(1);
    renderCalendar();
  };
  document.getElementById("cal-close").onclick = toggleCalendarView;

  // Clic sur une cellule
  wrap.querySelectorAll(".cal-cell[data-day]").forEach(cell => {
    cell.addEventListener("click", () => {
      const day = parseInt(cell.dataset.day);
      const projects = byDay[day] || [];
      const detail = document.getElementById("cal-detail");
      if (!detail) return;
      // Highlight
      wrap.querySelectorAll(".cal-cell").forEach(c => c.classList.remove("selected"));
      cell.classList.add("selected");
      if (projects.length === 0) {
        detail.innerHTML = `<p class="cal-detail-hint">Aucune échéance le ${day} ${MONTHS_FR[month]}</p>`;
        return;
      }
      detail.innerHTML = `
        <h4 class="cal-detail-title">📅 ${day} ${MONTHS_FR[month]} — ${projects.length} projet${projects.length > 1 ? "s" : ""}</h4>
        ${projects.map(p => {
          const sk = getStatusKey(p.etat_correspondance_trello);
          return `
            <div class="cal-detail-item cal-detail-${sk}" onclick="showDetails(${JSON.stringify(p).replace(/"/g,"&quot;")})">
              <span class="cal-detail-dot cal-dot-${sk}"></span>
              <div>
                <strong>${p.projet || "—"}</strong>
                <span>${p.societe || "—"} · ${p.zone_geo || "—"}</span>
                ${p.montant ? `<span class="cal-detail-montant">💰 ${p.montant}</span>` : ""}
              </div>
            </div>
          `;
        }).join("")}
      `;
    });
  });
}

function toggleCalendarView() {
  calendarVisible = !calendarVisible;
  const wrap = document.getElementById("calendar-view");
  const btn  = document.getElementById("toggle-calendar");
  if (wrap) wrap.style.display = calendarVisible ? "block" : "none";
  if (btn) {
    btn.textContent = calendarVisible ? "📅 Fermer calendrier" : "📅 Calendrier";
    btn.classList.toggle("active", calendarVisible);
  }
  if (calendarVisible) renderCalendar();
  setTimeout(() => map.invalidateSize(), 350);
}


buildFilters();
buildColumnToggles();
buildAddColumnButton();
buildMontantFilter();
setupStatClickHandlers();
updateMapFilterButton();
updateStatCards();
renderTableHeader();
refresh();
buildCalendarView();

/* =====================================================
   FILTRES RAPIDES + MODE REVUE COMMERCIALE
===================================================== */
(function setupQuickFilters() {
  const btnMap = {
    'qf-urgent':  'urgent',
    'qf-cahors':  'cahors',
    'qf-notes':   'notes',
    'qf-overdue': 'overdue',
  };
  Object.entries(btnMap).forEach(([id, key]) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('click', () => {
      _state.quickFilters[key] = !_state.quickFilters[key];
      btn.classList.toggle('active', _state.quickFilters[key]);
      if (_state.quickFilters[key] && _state.reviewMode.active) {
        _state.reviewMode.active = false;
        document.getElementById('mode-review')?.classList.remove('active');
      }
      refresh();
    });
  });

  const reviewBtn = document.getElementById('mode-review');
  if (reviewBtn) {
    reviewBtn.addEventListener('click', () => {
      _state.reviewMode.active = !_state.reviewMode.active;
      reviewBtn.classList.toggle('active', _state.reviewMode.active);
      if (_state.reviewMode.active) {
        const d = new Date(); d.setDate(d.getDate() + 30);
        _state.reviewMode.deadline = d;
        Object.keys(_state.quickFilters).forEach(k => {
          _state.quickFilters[k] = false;
          document.getElementById('qf-' + k)?.classList.remove('active');
        });
        _state.sortState.col = 'echeance';
        _state.sortState.dir = 'asc';
      } else {
        _state.reviewMode.deadline = null;
        _state.sortState.col = null;
      }
      refresh();
    });
  }
})();

// Appliquer les couleurs de légende personnalisées dès le chargement
updateLegendDots();

// Clic sur le h4 de la légende pour ouvrir le customiseur
document.querySelector('.map-legend h4')?.addEventListener('click', buildLegendCustomizer);
document.querySelector('.map-legend h4').style.cursor = 'pointer';
document.querySelector('.map-legend h4').title = 'Cliquer pour personnaliser les couleurs et la taille';

// Ajouter bouton calendrier dans la sidebar-actions
(function() {
  const actionsDiv = document.querySelector(".sidebar-actions");
  if (actionsDiv) {
    const btn = document.createElement("button");
    btn.id = "toggle-calendar";
    btn.textContent = "📅 Calendrier";
    const resetBtn = document.getElementById("reset");
    actionsDiv.insertBefore(btn, resetBtn);
    btn.addEventListener("click", toggleCalendarView);
  }
})();

// ── Abonnements au bus App ─────────────────────────────────────
// Les modules externes (Trello, futur Revue…) peuvent émettre
// 'change' via App.emit('change') pour déclencher un refresh.
_app.on('change', () => {
  // Synchroniser les scalaires locaux → App.state avant chaque render
  _state.activeStatFilter  = activeStatFilter;
  _state.searchQuery       = searchQuery;
  _state.chartFilter       = chartFilter;
  _state.filterByMapBounds = filterByMapBounds;
  refresh();
});

// columnsChanged : reconstruire les toggles et l'en-tête sans refresh complet
_app.on('columnsChanged', () => {
  buildColumnToggles();
  renderTableHeader();
});

setTimeout(() => map.invalidateSize(), 300);
