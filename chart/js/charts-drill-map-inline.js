(function() {
  'use strict';

  // Filtres additionnels injectés dans le DrillDown pour certains graphiques
  // dont les données source sont déjà pré-filtrées par statut
  // Exposé sur window pour que ChartFilterController et CM.create puissent y accéder
  window.EXTRA_FILTERS_MAP = {
    'chart-perdu':       { status: 'perdu'  },
    'chart-obtenu':      { status: 'obtenu' },
    'chart-obtenu-zone': { status: 'obtenu' },
  };
  var EXTRA_FILTERS_MAP = window.EXTRA_FILTERS_MAP;
  var MONTHS_FR = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];

  function _projectMonthLabel(project) {
    var raw = project ? project['Date réception'] : null;
    if (!raw) return null;
    var d = (typeof ProjectUtils !== 'undefined' && ProjectUtils.parseDate)
      ? ProjectUtils.parseDate(raw)
      : new Date(raw);
    return d && !isNaN(d.getTime()) ? MONTHS_FR[d.getMonth()] : null;
  }

  var DRILL_MAP = {
    'chart-monthly':           { fk:'_mois',   filterFn:function(p,l){ return _projectMonthLabel(p) === l; } },
    'chart-ca-trend':          { fk:'_annee',  filterFn:function(p,l){ return String(p._annee)===String(l); } },
    'chart-conv-trend':        { fk:'_annee',  filterFn:function(p,l){ return String(p._annee)===String(l); } },
    'chart-type-perf':         { fk:'Type de projet (Activité)' },
    'chart-cycle-time':        { fk:'Zone Géographique', filterFn:function(p,l){ var st=typeof ProjectUtils!=='undefined'?ProjectUtils.getStatus(p):''; return (p['Zone Géographique']||'')===l&&(st==='obtenu'||st==='perdu'); } },
    'chart-scatter-conv-ca':   { fk:'Client',  labelFn:function(ch,i){ var d=ch.data.datasets[0]&&ch.data.datasets[0].data[i]; return d&&(d.filterValue||d.label||d.client)?(d.filterValue||d.label||d.client):'?'; } },
    'chart-ca-by-month':       { fk:'_mois',   filterFn:function(p,l){ return _projectMonthLabel(p) === l; } },
    'chart-ca-histogram':      { fk:'_tranche',filterFn:function(p,l){ var T=[{l:'< 100k€',max:100e3},{l:'100-250k€',max:250e3},{l:'250-500k€',max:500e3},{l:'500k-1M€',max:1e6},{l:'1M-5M€',max:5e6},{l:'> 5M€',max:Infinity}]; var bud=parseFloat(String(p['Bud']||'').replace(/[^0-9.]/g,''))||0; var t=T.find(function(t){return t.l===l;}); return t?bud<t.max&&bud>=(T[T.indexOf(t)-1]||{max:0}).max:false; } },
    'chart-ca-multidim':       { fk:'_annee',  filterFn:function(p,l){ return String(p._annee)===String(l); } },
    'chart-cumulative-growth': { fk:'_annee',  filterFn:function(p,l){ return String(p._annee)===String(l); } },
    'chart-delay-status':      { fk:'Statut',  filterFn:function(p,l){ var st=typeof ProjectUtils!=='undefined'?ProjectUtils.getStatus(p):''; var m={'Obtenu':'obtenu','Perdu':'perdu','Offre':'offre'}; return st===(m[l]||l.toLowerCase()); } },
    'chart-funnel-ca':         { fk:'Statut',  filterFn:function(p,l){ var st=typeof ProjectUtils!=='undefined'?ProjectUtils.getStatus(p):''; var m={'Étudié':'offre','Gagné':'obtenu','Perdu':'perdu'}; return m[l]?st===m[l]:true; } },
    'chart-montant-statut':    { fk:'Statut',  filterFn:function(p,l){ var st=typeof ProjectUtils!=='undefined'?ProjectUtils.getStatus(p):''; var m={'Obtenu':'obtenu','Perdu':'perdu','Offre':'offre'}; return st===(m[l]||l.toLowerCase()); } },
    'chart-offer-type-analysis':{ fk:'Type de projet (Activité)' },
    'chart-pipeline-stage':    { fk:'Statut',  filterFn:function(p,l){ return (p['Statut']||'').trim()===l||(p['Statut']||'').trim().toLowerCase()===l.toLowerCase(); } },
    'chart-pipeline-weighted': { fk:'_mois',   filterFn:function(p,l){ var st=typeof ProjectUtils!=='undefined'?ProjectUtils.getStatus(p):''; if(st!=='offre')return false; return _projectMonthLabel(p) === l; } },
    'chart-scatter-power-ca':  { fk:'Client',  labelFn:function(ch,i){ var d=ch.data.datasets[0]&&ch.data.datasets[0].data[i]; return d&&(d.filterValue||d.label||d.client)?(d.filterValue||d.label||d.client):'?'; } },
    'chart-win-rate-client':   { fk:'Client' },
    'chart-winrate-month':     { fk:'_mois',   filterFn:function(p,l){ var st=typeof ProjectUtils!=='undefined'?ProjectUtils.getStatus(p):''; if(st!=='obtenu'&&st!=='perdu')return false; return _projectMonthLabel(p) === l; } },
    'chart-year-comparison':   { fk:'_annee',  filterFn:function(p,l){ return String(p._annee)===String(l); } },
    'chart-ca-gagne-vs-etudie':{ fk:'_annee',  filterFn:function(p,l){ return String(p._annee)===String(l); } },
    'chart-conversion-societe':{ fk:'Client' },
    'chart-delai-moyen':       { fk:'_annee',  filterFn:function(p,l){ var st=typeof ProjectUtils!=='undefined'?ProjectUtils.getStatus(p):''; return (st==='obtenu'||st==='perdu')&&String(p._annee)===String(l); } },
    'chart-budget-distribution':{ fk:'_tranche',filterFn:function(p,l){ var T=[{l:'< 50k€',min:0,max:50e3},{l:'50–100k€',min:50e3,max:100e3},{l:'100–250k€',min:100e3,max:250e3},{l:'250–500k€',min:250e3,max:500e3},{l:'500k–1M€',min:500e3,max:1e6},{l:'1M–5M€',min:1e6,max:5e6},{l:'> 5M€',min:5e6,max:Infinity}]; var bud=parseFloat(String(p['Bud']||'').replace(/[^0-9.,]/g,'').replace(',','.'))||0; var t=T.find(function(t){return t.l===l;}); return t?bud>=t.min&&bud<t.max:false; } },
    'chart-ca-cumule':         { fk:'_mois',   filterFn:function(p,l){ var st=typeof ProjectUtils!=='undefined'?ProjectUtils.getStatus(p):''; if(st!=='obtenu')return false; return _projectMonthLabel(p) === l; } },
    'chart-pipeline-mensuel':  { fk:'_mois',   filterFn:function(p,l){ var st=typeof ProjectUtils!=='undefined'?ProjectUtils.getStatus(p):''; if(st!=='offre')return false; return _projectMonthLabel(p) === l; } },
    'chart-pertes-client':     { fk:'Client',  filterFn:function(p,l){ var st=typeof ProjectUtils!=='undefined'?ProjectUtils.getStatus(p):''; return (p['Client']||'')===l&&st==='perdu'; } },
    'chart-statuts-reels':     { fk:'Statut',  filterFn:function(p,l){ return (p['Statut']||'').trim()===l; } },
    'chart-conv-par-type':     { fk:'Type de projet (Activité)', filterFn:function(p,l){ var st=typeof ProjectUtils!=='undefined'?ProjectUtils.getStatus(p):''; return (p['Type de projet (Activité)']||'')===l&&(st==='obtenu'||st==='perdu'); } },
    'chart-heatmap-zone-statut':{ skip:true },
    'chart-montant-statut':    { fk:'Statut',  filterFn:function(p,l){ var st=typeof ProjectUtils!=='undefined'?ProjectUtils.getStatus(p):''; var MAP={'Obtenu':'obtenu','Perdu':'perdu','Offre':'offre','En cours':'offre','Gagné':'obtenu'}; return st===(MAP[l]||l.toLowerCase()); } },
    'chart-delay-status':      { fk:'Statut',  filterFn:function(p,l){ var st=typeof ProjectUtils!=='undefined'?ProjectUtils.getStatus(p):''; var MAP={'✅ Obtenu':'obtenu','❌ Perdu':'perdu','📋 Offre':'offre'}; return st===(MAP[l]||l.toLowerCase()); } },
    'chart-win-rate-client':   { fk:'Client' },
    'chart-partner':           { fk:'Client' },
    'chart-machines-zone':     { fk:'Zone Géographique' },
    'chart-power-status':      { fk:'Statut', filterFn:function(p,l){ var st=typeof ProjectUtils!=='undefined'?ProjectUtils.getStatus(p):''; var MAP={'✅ Obtenu':'obtenu','❌ Perdu':'perdu','📋 Offre':'offre'}; return st===(MAP[l]||l.toLowerCase()); } },
    'chart-ca-by-year-v2':     { fk:'_annee', filterFn:function(p,l){ return String(p._annee)===String(l); } },
    'chart-win-rate-zone':     { fk:'Zone Géographique' },
    'chart-offer-type':        { fk:'Type de projet (Activité)' },
    'chart-ca-zone':           { fk:'Zone Géographique' },
  };

  /* ── PONT DRILL_MAP → ChartDrillDown.registerFilter ──────────────────
   * Enregistre toutes les filterFn custom du DRILL_MAP dans ChartDrillDown
   * pour qu'elles soient utilisées en priorité dans _matchProject().
   * Sans ce pont : _mois, _tranche, cycle-time, funnel-ca, etc. → vide.
   * ─────────────────────────────────────────────────────────────────── */
  (function _bridgeDrillMap() {
    if (typeof ChartDrillDown === 'undefined' || typeof ChartDrillDown.registerFilter !== 'function') {
      // ChartDrillDown chargé après — réessayer après le DOM
      document.addEventListener('DOMContentLoaded', _bridgeDrillMap);
      return;
    }
    var bridged = 0;
    Object.keys(DRILL_MAP).forEach(function(chartId) {
      var cfg = DRILL_MAP[chartId];
      if (cfg && typeof cfg.filterFn === 'function') {
        ChartDrillDown.registerFilter(chartId, cfg.filterFn);
        bridged++;
      }
    });
    console.log('[DrillBridge] ' + bridged + ' filterFn enregistrées dans ChartDrillDown');
  })();

  function _getAll(cfg, labelValue) {
    var all = (typeof DataFilterEngine!=='undefined'&&DataFilterEngine.getFilteredData) ? DataFilterEngine.getFilteredData() : (window.DATA||[]);
    if (cfg.filterFn) return all.filter(function(p){ return cfg.filterFn(p, labelValue); });
    return all.filter(function(p){ var v=String(p[cfg.fk]||'').trim(); return v===String(labelValue).trim()||v.toLowerCase()===String(labelValue).toLowerCase(); });
  }

  function _exportChart(projects, label) {
    if (typeof exportExcel !== 'undefined') {
      var fn = 'export_' + label.replace(/[^\w\s\-]/g,'').trim().slice(0,30) + '_' + new Date().toISOString().slice(0,10) + '.xlsx';
      exportExcel(projects, fn, label.slice(0,31));
    }
  }

  function _bindCanvas(id, ch) {
    if (!ch||!ch.canvas) return;
    var cfg = DRILL_MAP[id];
    if (!cfg||cfg.skip) return;
    if (ch.canvas._cfcChartFilterController) {
      _injectChartExcelBtn(id, ch, cfg);
      return;
    }
    if (ch.canvas._uniDrillBound) return;
    ch.canvas._uniDrillBound = true;
    ch.canvas.style.cursor = 'pointer';

    ch.canvas.addEventListener('click', function(e) {
      var els = ch.getElementsAtEventForMode(e,'nearest',{intersect:true},true);
      if (!els.length) { if (typeof ChartDrillDown!=='undefined') ChartDrillDown.hide(id); return; }
      var idx = els[0].index;
      var lv  = cfg.labelFn ? cfg.labelFn(ch,idx) : (ch.data.labels&&ch.data.labels[idx]);
      if (lv==null||lv==='?') return;
      if (typeof ChartDrillDown!=='undefined') {
        var ef = EXTRA_FILTERS_MAP[id] || null;
        var opts = ef ? { extraFilters: ef } : undefined;
        ChartDrillDown.show(id, cfg.fk, String(lv), String(lv), opts);
      }
    });

    // Bouton 📥 Excel sur la chart-card
    _injectChartExcelBtn(id, ch, cfg);
  }

  /* ── Injecter un bouton Excel permanent sur chaque chart-card ─────── */
  function _injectChartExcelBtn(id, ch, cfg) {
    var canvas = document.getElementById(id);
    if (!canvas) return;
    var card = canvas.closest('[data-chart-id]');
    if (!card) return;
    if (card.querySelector('.chart-excel-btn-uni')) return; // déjà injecté

    var actions = card.querySelector('.chart-title-actions');
    if (!actions) return;

    var btn = document.createElement('button');
    btn.className = 'chart-excel-btn-uni';
    btn.title = 'Exporter les données de ce graphique en Excel';
    btn.innerHTML = '📥';
    btn.style.cssText = 'background:rgba(0,212,170,.1);border:1px solid rgba(0,212,170,.3);border-radius:6px;color:#00d4aa;padding:.2rem .45rem;cursor:pointer;font-size:.82rem;transition:background .15s;';
    btn.onmouseover = function(){ this.style.background='rgba(0,212,170,.22)'; };
    btn.onmouseout  = function(){ this.style.background='rgba(0,212,170,.1)'; };

    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var all = (typeof DataFilterEngine!=='undefined'&&DataFilterEngine.getFilteredData) ? DataFilterEngine.getFilteredData() : (window.DATA||[]);
      var label = (card.querySelector('.chart-title')||{}).textContent || id;
      label = label.replace(/[ⓘ]/g,'').trim().slice(0,30);
      _exportChart(all, label);
      btn.innerHTML = '✅';
      setTimeout(function(){ btn.innerHTML = '📥'; }, 2000);
    });

    // Insérer AVANT le bouton 💾
    var first = actions.querySelector('button');
    if (first) actions.insertBefore(btn, first);
    else actions.appendChild(btn);
  }

  function _scan() {
    if (typeof Chart==='undefined') return;
    var inst = Chart.instances;
    if (!inst) return;
    Object.keys(inst).forEach(function(k) {
      var ch = inst[k];
      if (!ch||!ch.canvas) return;
      var id = ch.canvas.id;
      // Aussi injecter sur les charts déjà cliquables via CM.create
      if (id && ch.canvas && !ch.canvas.style.cursor) ch.canvas.style.cursor = 'pointer';
      if (id) _injectChartExcelBtn(id, ch, DRILL_MAP[id]||{});
      if (id && DRILL_MAP[id]) _bindCanvas(id, ch);
    });
  }

  // Hook sur window.update pour rescanner après chaque refresh
  var _orig = window.update;
  if (typeof _orig === 'function') {
    window.update = function() {
      var r = _orig.apply(this, arguments);
      setTimeout(_scan, 500);
      return r;
    };
  }

  if (document.readyState==='loading') {
    document.addEventListener('DOMContentLoaded', function(){ setTimeout(_scan, 900); });
  } else {
    setTimeout(_scan, 900);
  }

  window._uniDrill = { scan:_scan, map:DRILL_MAP };
})();
