(function () {
  'use strict';

  /**
   * Créer / mettre à jour les nouveaux graphiques ChartsEnrichis.
   * Appelé à chaque update() de l'AE engine.
   */
  /* ══════════════════════════════════════════════════════
     CHART CONFIG ENGINE — Écrous de configuration dynamique
  ══════════════════════════════════════════════════════ */
  var _chartCfgState = {};  // { chartId: { axis: {}, defaults: {} } }

  function _initChartCfgEngine() {
    // Recueillir tous les defaults des selects
    document.querySelectorAll('.chart-cfg-panel select[data-cfg-key]').forEach(function(sel) {
      var id   = sel.dataset.cfgKey;
      var axis = sel.dataset.cfgAxis;
      if (!_chartCfgState[id]) _chartCfgState[id] = { axis: {}, defaults: {} };
      _chartCfgState[id].defaults[axis] = sel.value;
      _chartCfgState[id].axis[axis]     = sel.value;
    });

    // Boutons d'ouverture/fermeture
    document.querySelectorAll('.chart-cfg-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var id = btn.dataset.cfg;
        var panel = document.getElementById('cfg-' + id);
        if (!panel) return;
        var isOpen = panel.classList.contains('open');
        // Fermer tous les panels
        document.querySelectorAll('.chart-cfg-panel.open').forEach(function(p) { p.classList.remove('open'); });
        if (!isOpen) panel.classList.add('open');
      });
    });

    // Fermer en cliquant ailleurs
    document.addEventListener('click', function() {
      document.querySelectorAll('.chart-cfg-panel.open').forEach(function(p) { p.classList.remove('open'); });
    });
    document.querySelectorAll('.chart-cfg-panel').forEach(function(p) {
      p.addEventListener('click', function(e) { e.stopPropagation(); });
    });

    // Mettre à jour l'état en temps réel
    document.querySelectorAll('.chart-cfg-panel select[data-cfg-key]').forEach(function(sel) {
      sel.addEventListener('change', function() {
        var id   = sel.dataset.cfgKey;
        var axis = sel.dataset.cfgAxis;
        if (_chartCfgState[id]) _chartCfgState[id].axis[axis] = sel.value;
      });
    });

    // Boutons Appliquer
    document.querySelectorAll('.chart-cfg-apply').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var id = btn.dataset.cfgApply;
        // Fermer le panel
        var panel = document.getElementById('cfg-' + id);
        if (panel) panel.classList.remove('open');
        // Rafraîchir uniquement ce graphique
        var data = (typeof AE !== 'undefined') ? AE.getFiltered() : (window.DATA || []);
        _renderConfigurableChart(id, data);
      });
    });

    // Boutons Reset
    document.querySelectorAll('.chart-cfg-reset').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var id = btn.dataset.cfgReset;
        if (!_chartCfgState[id]) return;
        // Restaurer les defaults
        var defaults = _chartCfgState[id].defaults;
        _chartCfgState[id].axis = Object.assign({}, defaults);
        // Remettre les selects
        document.querySelectorAll('.chart-cfg-panel select[data-cfg-key="' + id + '"]').forEach(function(sel) {
          sel.value = defaults[sel.dataset.cfgAxis] || sel.options[0].value;
        });
        var data = (typeof AE !== 'undefined') ? AE.getFiltered() : (window.DATA || []);
        _renderConfigurableChart(id, data);
      });
    });
  }

  /* ── Accès à la config d'un graphique ── */
  function _cfg(chartId, axis, fallback) {
    return (_chartCfgState[chartId] && _chartCfgState[chartId].axis[axis]) || fallback;
  }

  /* ── Méthode centrale : redessiner un graphique spécifique ── */
  function _renderConfigurableChart(chartId, data) {
    var cm = (typeof AE !== 'undefined') ? AE.getCAMode() : 'Bud';
    switch(chartId) {
      case 'chart-top-clients-ca': _renderTopClientsCa(data, cm); break;
      case 'chart-conv-trend':     _renderConvTrend(data); break;
      case 'chart-type-perf':      _renderTypePerf(data, cm); break;
      case 'chart-cycle-time':     _renderCycleTime(data); break;
      case 'chart-scatter-conv-ca':_renderScatterConvCa(data, cm); break;
      case 'chart-ca-year':        /* géré par createAllCharts */ if(typeof window.update==='function') window.update(); break;
    }
  }

  function _schemaFor(chartId) {
    if (!_chartCfgState[chartId]) return null;
    var schema = {};
    document.querySelectorAll('.chart-cfg-panel select[data-cfg-key="' + chartId + '"]').forEach(function(sel) {
      var axis = sel.dataset.cfgAxis;
      schema[axis] = {
        label: (sel.closest('.chart-cfg-row') && sel.closest('.chart-cfg-row').querySelector('label'))
          ? sel.closest('.chart-cfg-row').querySelector('label').textContent.trim()
          : axis,
        current: _chartCfgState[chartId].axis[axis],
        defaultValue: _chartCfgState[chartId].defaults[axis],
        options: Array.from(sel.options || []).map(function(opt) {
          return { value: opt.value, label: opt.textContent.trim() };
        })
      };
    });
    return schema;
  }

  function _applyConfigState(chartId, partial, opts) {
    if (!_chartCfgState[chartId]) return false;
    _chartCfgState[chartId].axis = Object.assign({}, _chartCfgState[chartId].axis, partial || {});
    document.querySelectorAll('.chart-cfg-panel select[data-cfg-key="' + chartId + '"]').forEach(function(sel) {
      var axis = sel.dataset.cfgAxis;
      if (_chartCfgState[chartId].axis[axis] != null) {
        sel.value = _chartCfgState[chartId].axis[axis];
      }
    });
    if (opts && opts.skipRender) return true;
    var data = (typeof AE !== 'undefined') ? AE.getFiltered() : (window.DATA || []);
    _renderConfigurableChart(chartId, data);
    return true;
  }

  function _resetConfigState(chartId) {
    if (!_chartCfgState[chartId]) return false;
    _chartCfgState[chartId].axis = Object.assign({}, _chartCfgState[chartId].defaults);
    return _applyConfigState(chartId, _chartCfgState[chartId].axis);
  }

  window.ChartConfigBridge = {
    hasChart: function(chartId) {
      return !!_chartCfgState[chartId];
    },
    listCharts: function() {
      return Object.keys(_chartCfgState);
    },
    getConfig: function(chartId) {
      return _chartCfgState[chartId] ? Object.assign({}, _chartCfgState[chartId].axis) : null;
    },
    getDefaults: function(chartId) {
      return _chartCfgState[chartId] ? Object.assign({}, _chartCfgState[chartId].defaults) : null;
    },
    getSchema: function(chartId) {
      return _schemaFor(chartId);
    },
    applyConfig: function(chartId, partial, opts) {
      return _applyConfigState(chartId, partial, opts);
    },
    resetConfig: function(chartId) {
      return _resetConfigState(chartId);
    },
    rerender: function(chartId) {
      var data = (typeof AE !== 'undefined') ? AE.getFiltered() : (window.DATA || []);
      _renderConfigurableChart(chartId, data);
    }
  };

  /* ── Helpers ── */
  function _groupBy(data, field, valueFn) {
    var map = {};
    data.forEach(function(p) {
      var key = p[field] || '(N/D)';
      if (!map[key]) map[key] = { key: key, items: [] };
      map[key].items.push(p);
    });
    return Object.values(map);
  }

  function _computeMetric(items, metric, cm) {
    switch(metric) {
      case 'ca_gagne':   return items.filter(function(p){ return typeof ProjectUtils!=='undefined'&&ProjectUtils.getStatus(p)==='obtenu'; }).reduce(function(s,p){ return s+getBud(p); }, 0);
      case 'ca_etudie':  return items.reduce(function(s,p){ return s+getBud(p); }, 0);
      case 'ca_mode':    return items.reduce(function(s,p){ return s+getCAValue(p,cm); }, 0);
      case 'ca_moyen': {
        var won = items.filter(function(p){ return typeof ProjectUtils!=='undefined'&&ProjectUtils.getStatus(p)==='obtenu'; });
        return won.length > 0 ? won.reduce(function(s,p){ return s+getBud(p); },0)/won.length : 0;
      }
      case 'ca_total':   return items.reduce(function(s,p){ return s+getBud(p); }, 0);
      case 'count':      return items.length;
      case 'puissance':  return items.reduce(function(s,p){ return s+(parseFloat(p['Puissance (MWc)'])||0); }, 0);
      case 'puissance_moy': {
        var n = items.filter(function(p){ return parseFloat(p['Puissance (MWc)'])>0; });
        return n.length > 0 ? n.reduce(function(s,p){ return s+(parseFloat(p['Puissance (MWc)'])||0); },0)/n.length : 0;
      }
      case 'conversion': {
        var w = items.filter(function(p){ return typeof ProjectUtils!=='undefined'&&ProjectUtils.getStatus(p)==='obtenu'; }).length;
        var l = items.filter(function(p){ return typeof ProjectUtils!=='undefined'&&ProjectUtils.getStatus(p)==='perdu'; }).length;
        return (w+l)>0 ? Math.round(w/(w+l)*100) : null;
      }
      case 'won_count':  return items.filter(function(p){ return typeof ProjectUtils!=='undefined'&&ProjectUtils.getStatus(p)==='obtenu'; }).length;
      case 'lost_count': return items.filter(function(p){ return typeof ProjectUtils!=='undefined'&&ProjectUtils.getStatus(p)==='perdu'; }).length;
      case 'ca_won':     return items.filter(function(p){ return typeof ProjectUtils!=='undefined'&&ProjectUtils.getStatus(p)==='obtenu'; }).reduce(function(s,p){ return s+getBud(p); }, 0);
      default: return items.length;
    }
  }

  function _metricLabel(metric) {
    var labels = { ca_gagne:'CA Gagné (€)', ca_etudie:'CA Étudié (€)', ca_mode:'CA (€)', ca_moyen:'CA Moyen (€)', ca_total:'CA Total (€)', count:'Projets', puissance:'MW', puissance_moy:'MW moy.', conversion:'Taux Conv. %', won_count:'Gagnés', lost_count:'Perdus', ca_won:'CA Gagné' };
    return labels[metric] || metric;
  }

  var _SC = { obtenu:'#00d4aa', perdu:'#ff4d6d', offre:'#f5b740', brand:'rgba(0,212,170,', brand2:'rgba(139,120,248,', accent:'rgba(0,153,255,' };

  /* ──── RENDU DES GRAPHIQUES CONFIGURABLES ──── */

  function _renderTopClientsCa(data, cm) {
    var xField = _cfg('chart-top-clients-ca', 'x', 'Client');
    var yMetric = _cfg('chart-top-clients-ca', 'y', 'ca_gagne');
    var limit   = parseInt(_cfg('chart-top-clients-ca', 'limit', '8'));

    var groups = _groupBy(data, xField);
    var vals   = groups.map(function(g) {
      return { key: g.key, val: _computeMetric(g.items, yMetric, cm) };
    }).filter(function(x){ return x.val > 0; })
      .sort(function(a,b){ return b.val - a.val; })
      .slice(0, limit);

    var isMoney = ['ca_gagne','ca_etudie','ca_mode','ca_moyen','ca_total','ca_won'].includes(yMetric);
    var labels  = vals.map(function(x){ return x.key; });
    var values  = vals.map(function(x){ return x.val; });

    if (typeof CM !== 'undefined') {
      CM.create('chart-top-clients-ca', {
        type: 'bar',
        data: { labels: labels, datasets: [{ label: _metricLabel(yMetric), data: values,
          backgroundColor: labels.map(function(_,i){ return 'rgba(0,212,170,' + (0.55+i*0.03) + ')'; }),
          borderColor: 'rgba(0,212,170,.8)', borderWidth: 1, borderRadius: 4 }] },
        options: { indexAxis: 'y', plugins: { legend:{display:false}, tooltip:{callbacks:{label:function(c){ return ' '+( isMoney?fmt(c.raw):c.raw); }}} },
          scales: { x: { ticks: { color:'#9fb3c8', callback: isMoney?function(v){return fmt(v);}:undefined }, grid:{color:'rgba(255,255,255,.04)'} },
                    y: { ticks:{color:'#dce8f5',font:{size:11}} } } }
      }, { fk: xField, fv: function(i){ return labels[i]; } });
    }
  }

  function _renderConvTrend(data) {
    var groupBy = _cfg('chart-conv-trend', 'group', 'year');
    var metric  = _cfg('chart-conv-trend', 'metric', 'conversion');
    var xField  = groupBy === 'year' ? '_annee' : groupBy === 'zone' ? 'Zone Géographique' : 'Type de projet (Activité)';

    var groups = _groupBy(data, xField);
    var sorted = groups.sort(function(a,b){
      if(groupBy==='year') return parseInt(a.key)-parseInt(b.key);
      return _computeMetric(b.items, metric) - _computeMetric(a.items, metric);
    });
    var labels = sorted.map(function(g){ return g.key; });
    var values = sorted.map(function(g){ return _computeMetric(g.items, metric); });
    var isConv = metric==='conversion';

    if (typeof CM !== 'undefined') {
      CM.create('chart-conv-trend', {
        type: groupBy==='year'?'line':'bar',
        data: { labels: labels, datasets:[{ label:_metricLabel(metric), data:values,
          borderColor:'#8b78f8', backgroundColor: groupBy==='year'?'rgba(139,120,248,.1)':'rgba(139,120,248,.45)',
          borderWidth:2.5, tension:.4, fill: groupBy==='year', pointRadius:5,
          borderRadius: groupBy!=='year'?4:0 }] },
        options: { plugins:{legend:{display:false}, tooltip:{callbacks:{label:function(c){ return ' '+(isConv?(c.raw+'%'):c.raw); }}}},
          scales:{ y:{ ticks:{color:'#9fb3c8', callback:isConv?function(v){return v+'%'}:undefined}, grid:{color:'rgba(255,255,255,.04)'}, max:isConv?100:undefined, beginAtZero:true },
                   x:{ticks:{color:'#dce8f5'}} } }
      });
    }
  }

  function _renderTypePerf(data, cm) {
    var xField = _cfg('chart-type-perf', 'x', 'Type de projet (Activité)');
    var y1     = _cfg('chart-type-perf', 'y1', 'conversion');
    var y2     = _cfg('chart-type-perf', 'y2', 'ca_moyen');

    var groups = _groupBy(data, xField);
    var sorted = groups.sort(function(a,b){ return b.items.length - a.items.length; }).slice(0,10);
    var labels = sorted.map(function(g){ return g.key; });
    var y1vals = sorted.map(function(g){ return _computeMetric(g.items, y1, cm); });
    var y2vals = y2!=='none' ? sorted.map(function(g){ return _computeMetric(g.items, y2, cm); }) : null;

    var datasets = [{
      label: _metricLabel(y1), data: y1vals, type:'bar',
      backgroundColor:'rgba(0,212,170,.5)', borderColor:'rgba(0,212,170,.8)', borderWidth:1, borderRadius:4,
      yAxisID: 'y'
    }];
    if (y2vals) datasets.push({
      label: _metricLabel(y2), data: y2vals, type:'line',
      borderColor:'#f5b740', backgroundColor:'rgba(245,183,64,.1)', borderWidth:2.5,
      tension:.4, pointRadius:5, yAxisID:'y2'
    });

    var isMoneyY1 = ['ca_gagne','ca_etudie','ca_mode','ca_moyen','ca_total'].includes(y1);
    var isMoneyY2 = y2!=='none' && ['ca_gagne','ca_etudie','ca_mode','ca_moyen','ca_total'].includes(y2);
    var isConvY1 = y1==='conversion';

    var scales = {
      x: { ticks:{color:'#dce8f5',font:{size:10}}, grid:{color:'rgba(255,255,255,.04)'} },
      y: { type:'linear', position:'left', ticks:{color:'#9fb3c8',callback:isMoneyY1?function(v){return fmt(v);}:(isConvY1?function(v){return v+'%'}:undefined)}, grid:{color:'rgba(255,255,255,.04)'}, beginAtZero:true }
    };
    if (y2vals) scales.y2 = { type:'linear', position:'right', ticks:{color:'#f5b740',callback:isMoneyY2?function(v){return fmt(v);}:undefined}, grid:{display:false}, beginAtZero:true };

    if (typeof CM !== 'undefined') {
      CM.create('chart-type-perf', { data:{labels:labels,datasets:datasets}, options:{ plugins:{legend:{labels:{color:'#9fb3c8'}}}, scales:scales } });
    }
  }

  function _renderCycleTime(data) {
    var xField = _cfg('chart-cycle-time', 'x', 'Zone Géographique');
    var metric = _cfg('chart-cycle-time', 'metric', 'mean');

    var groups = _groupBy(data, xField);
    var results = groups.map(function(g) {
      var durations = g.items.filter(function(p){ return p['Date réception'] && p['Date de retour demandée']; })
        .map(function(p){ return Math.max(0,(new Date(p['Date de retour demandée'])-new Date(p['Date réception']))/86400000); })
        .filter(function(d){ return d > 0 && d < 3000; });
      if (!durations.length) return null;
      var sorted = durations.slice().sort(function(a,b){return a-b;});
      var val = metric==='mean' ? Math.round(durations.reduce(function(s,v){return s+v;},0)/durations.length)
              : metric==='median' ? sorted[Math.floor(sorted.length/2)]
              : sorted[sorted.length-1];
      return { key: g.key, val: val, n: durations.length };
    }).filter(Boolean).sort(function(a,b){return b.val-a.val;});

    var labels = results.map(function(r){ return r.key; });
    var values = results.map(function(r){ return r.val; });

    if (typeof CM !== 'undefined') {
      CM.create('chart-cycle-time', {
        type:'bar',
        data:{ labels:labels, datasets:[{ label:'Durée (jours)', data:values,
          backgroundColor:'rgba(0,153,255,.5)', borderColor:'rgba(0,153,255,.8)', borderWidth:1, borderRadius:4 }] },
        options:{ indexAxis:'y', plugins:{legend:{display:false}, tooltip:{callbacks:{label:function(c){return ' '+c.raw+' j';} }}},
          scales:{x:{ticks:{color:'#9fb3c8'},grid:{color:'rgba(255,255,255,.04)'}}, y:{ticks:{color:'#dce8f5'}}} }
      });
    }
  }

  function _renderScatterConvCa(data, cm) {
    var xMetric    = _cfg('chart-scatter-conv-ca', 'x', 'conversion');
    var yMetric    = _cfg('chart-scatter-conv-ca', 'y', 'ca_moyen');
    var sizeMetric = _cfg('chart-scatter-conv-ca', 'size', 'count');

    var groups = _groupBy(data, 'Client');
    var points = groups.map(function(g) {
      var xv = _computeMetric(g.items, xMetric, cm);
      var yv = _computeMetric(g.items, yMetric, cm);
      var sv = sizeMetric!=='none' ? _computeMetric(g.items, sizeMetric, cm) : 1;
      if (xv === null || yv === null || xv === 0 && yv === 0) return null;
      return { x: xv, y: yv, r: Math.max(4, Math.min(24, Math.sqrt(sv)*2)), label: g.key };
    }).filter(Boolean);

    if (typeof CM !== 'undefined') {
      CM.create('chart-scatter-conv-ca', {
        type: 'bubble',
        data: { datasets:[{ label:'Clients', data:points,
          backgroundColor:'rgba(0,212,170,.35)', borderColor:'rgba(0,212,170,.7)',
          borderWidth:1.5 }] },
        options: { plugins:{
          legend:{display:false},
          tooltip:{callbacks:{label:function(c){ var p=c.raw; return [p.label, _metricLabel(xMetric)+': '+(xMetric==='conversion'?p.x+'%':fmt(p.x)), _metricLabel(yMetric)+': '+(yMetric.includes('ca')?fmt(p.y):p.y)]; }}}
        },
        scales:{ x:{ ticks:{color:'#9fb3c8',callback:xMetric==='conversion'?function(v){return v+'%'}:(xMetric.includes('ca')?function(v){return fmt(v);}:undefined)}, grid:{color:'rgba(255,255,255,.04)'}, title:{display:true,text:_metricLabel(xMetric),color:'#6b7f96'} },
                 y:{ ticks:{color:'#9fb3c8',callback:yMetric.includes('ca')?function(v){return fmt(v);}:undefined}, grid:{color:'rgba(255,255,255,.04)'}, title:{display:true,text:_metricLabel(yMetric),color:'#6b7f96'} } } }
      });
    }
  }

  // ── Graphique : Répartition des Statuts Métier Réels
  function _renderStatutsReels(data) {
    if (!data || !data.length) return;
    var counts = {};
    data.forEach(function(p) { var s=(p['Statut']||'Non renseigne').trim()||'Non renseigne'; counts[s]=(counts[s]||0)+1; });
    var ORDER = ['Non Chiffré','Avant Projet','En Etude','En Étude','Remis','Gagné','Perdu','Abandonné'];
    // BUG FIX #5 : couleurs cohérentes avec le thème global (obtenu=vert, perdu=rouge, offre=bleu)
    var CM2 = {'Non Chiffré':'rgba(90,112,137,.6)','Avant Projet':'rgba(0,153,255,.72)','En Etude':'rgba(0,153,255,.55)','En Étude':'rgba(0,153,255,.55)','Remis':'rgba(139,120,248,.75)','Gagné':'rgba(0,212,170,.85)','Perdu':'rgba(255,77,109,.75)','Abandonné':'rgba(255,77,109,.45)','Non renseigne':'rgba(90,112,137,.3)'};
    var ordered = ORDER.filter(function(k){ return counts[k]>0; });
    var extra = Object.keys(counts).filter(function(k){ return ORDER.indexOf(k)===-1&&k!=='Non renseigne'; });
    if (counts['Non renseigne']) extra.push('Non renseigne');
    var labels = ordered.concat(extra);
    var vals = labels.map(function(k){ return counts[k]||0; });
    var colors = labels.map(function(k){ return CM2[k]||'rgba(107,127,150,.5)'; });
    if (typeof CM !== 'undefined') {
      CM.create('chart-statuts-reels', {
        type: 'doughnut',
        data: { labels:labels, datasets:[{ data:vals, backgroundColor:colors, borderColor:'rgba(0,0,0,.3)', borderWidth:1.5, hoverOffset:6 }] },
        options: { plugins: {
          legend: { position:'right', labels:{ color:'#9fb3c8', font:{size:11}, padding:10,
            generateLabels: function(chart) {
              return chart.data.labels.map(function(l,i){
                var v=chart.data.datasets[0].data[i], tot=chart.data.datasets[0].data.reduce(function(a,b){return a+b;},0);
                return { text:l+' ('+v+' — '+Math.round(v/tot*100)+'%)', fillStyle:chart.data.datasets[0].backgroundColor[i], strokeStyle:'transparent', fontColor:'#9fb3c8', hidden:false, index:i };
              });
            }}},
          tooltip:{callbacks:{label:function(c){ var tot=c.dataset.data.reduce(function(a,b){return a+b;},0); return ' '+c.label+' : '+c.raw+' ('+Math.round(c.raw/tot*100)+'%)'; }}}
        }, cutout:'55%' }
      }, { fk:'Statut' });
    }
  }

  // ── Graphique : Taux de Conversion par Type de Projet
  function _renderConvParType(data) {
    if (!data || !data.length) return;
    var stats = {};
    data.forEach(function(p) {
      var t=(p['Type de projet (Activité)']||'Non défini').trim()||'Non défini';
      if (!stats[t]) stats[t]={won:0,lost:0,total:0};
      var st=typeof ProjectUtils!=='undefined'?ProjectUtils.getStatus(p):'autre';
      if (st==='obtenu'){stats[t].won++;stats[t].total++;}
      else if(st==='perdu'){stats[t].lost++;stats[t].total++;}
    });
    var entries = Object.entries(stats).filter(function(e){ return e[1].total>=2; }).sort(function(a,b){ return (b[1].won/b[1].total)-(a[1].won/a[1].total); });
    if (!entries.length) return;
    var labels = entries.map(function(e){ return e[0]; });
    var rates  = entries.map(function(e){ return Math.round(e[1].won/e[1].total*100); });
    var totals = entries.map(function(e){ return e[1].total; });
    var colors = rates.map(function(r){ return r>=50?'rgba(0,212,170,.75)':r>=30?'rgba(245,183,64,.75)':'rgba(255,77,109,.7)'; });
    if (typeof CM !== 'undefined') {
      CM.create('chart-conv-par-type', {
        type:'bar',
        data:{ labels:labels, datasets:[
          { label:'Taux conversion (%)', data:rates, backgroundColor:colors, borderWidth:1.5, borderRadius:4, yAxisID:'y' },
          { type:'line', label:'Projets décidés', data:totals, borderColor:'rgba(0,153,255,.7)', backgroundColor:'transparent', tension:0.3, borderWidth:2, pointRadius:4, pointBackgroundColor:'rgba(0,153,255,.9)', yAxisID:'y2' }
        ]},
        options:{ indexAxis:'y', plugins:{ legend:{labels:{color:'#9fb3c8'}}, tooltip:{callbacks:{label:function(c){ return c.datasetIndex===0?' Conversion : '+c.raw+'%':' Décidés : '+c.raw; }}}},
          scales:{ x:{ticks:{color:'#9fb3c8',callback:function(v){return v+'%';}},max:100,grid:{color:'rgba(255,255,255,.04)'}}, y:{ticks:{color:'#9fb3c8',font:{size:10}},grid:{color:'rgba(255,255,255,.04)'}}, y2:{position:'right',ticks:{color:'#9fb3c8'},grid:{display:false}} } }
      }, { fk:'Type de projet (Activité)' });
    }
  }

  /* ── Initialiser le moteur au premier rendu ── */
  var _chartCfgEngineReady = false;

  function renderNewCharts(data) {
    if (document.body.classList.contains('business-dashboard-simplified')) return;
    if (typeof ChartsEnrichis === 'undefined') return;
    if (!_chartCfgEngineReady) {
      _initChartCfgEngine();
      _chartCfgEngineReady = true;
    }

    // Synchroniser le mode CA
    var caMode = (typeof AE !== 'undefined') ? AE.getCAMode() : 'Bud'; // [CORRIGÉ v2]
    ChartsEnrichis.setCAMode(caMode);

    // Connecter le click-to-filter + drill-down
    if (!ChartsEnrichis.onChartClick && typeof AE !== 'undefined') {
      ChartsEnrichis.onChartClick = function(filterType, value) {
        AE.toggleFilter(filterType, String(value));
        // Le drill-down est déclenché directement dans _makeClickable de ChartsEnrichis
        // (ChartDrillDown.show est appelé APRÈS ce callback dans _makeClickable)
      };
    }

    // Funnel
    ChartsEnrichis.createFunnelChart(data, 'chart-funnel');

    // CA par année étudié vs gagné
    ChartsEnrichis.createCAByYearChart(data, 'chart-ca-by-year-v2');

    // Scatter puissance vs CA
    ChartsEnrichis.createScatterPowerCAChart(data, 'chart-scatter-power-ca');

    // Délai moyen par statut
    ChartsEnrichis.createDelayByStatusChart(data, 'chart-delay-status');
    if (typeof ChartFilterController !== 'undefined' && ChartsEnrichis.charts['chart-delay-status']) {
      ChartFilterController.registerChart('chart-delay-status', ChartsEnrichis.charts['chart-delay-status'], { filterType: 'Statut', clickable: true, highlightOnFilter: true, reRenderOnFilter: true });
    }

    // Taux de conversion par client
    ChartsEnrichis.createWinRateByClientChart(data, 'chart-win-rate-client');

    // CA par zone géo (doughnut enrichi)
    ChartsEnrichis.createCAByZoneChart(data, 'chart-ca-zone-v2');

    // Taux conversion par zone
    ChartsEnrichis.createWinRateZoneChart(data, 'chart-win-rate-zone');

    // ── NOUVEAUX GRAPHIQUES v3.0 ──
    ChartsEnrichis.createCAByMonthChart(data, 'chart-ca-by-month');
    if (typeof ChartFilterController !== 'undefined' && ChartsEnrichis.charts['chart-ca-by-month']) {
      ChartFilterController.registerChart('chart-ca-by-month', ChartsEnrichis.charts['chart-ca-by-month'], { filterType: '_annee', clickable: true, highlightOnFilter: false, reRenderOnFilter: true });
    }
    ChartsEnrichis.createPipelineByStageChart(data, 'chart-pipeline-stage');
    if (typeof ChartFilterController !== 'undefined' && ChartsEnrichis.charts['chart-pipeline-stage']) {
      ChartFilterController.registerChart('chart-pipeline-stage', ChartsEnrichis.charts['chart-pipeline-stage'], { filterType: 'Statut', clickable: true, highlightOnFilter: false, reRenderOnFilter: true });
    }
    ChartsEnrichis.createCAHistogramChart(data, 'chart-ca-histogram');
    if (typeof ChartFilterController !== 'undefined' && ChartsEnrichis.charts['chart-ca-histogram']) {
      ChartFilterController.registerChart('chart-ca-histogram', ChartsEnrichis.charts['chart-ca-histogram'], { filterType: 'Statut', clickable: true, highlightOnFilter: true, reRenderOnFilter: true });
    }

    // Heatmap temporelle — ajuster la hauteur dynamiquement
    ChartsEnrichis.createTemporalHeatmapChart(data, 'chart-temporal-heatmap');
    var heatmapRows = (typeof Analytics !== 'undefined') ? Analytics.temporalHeatmap(data).length : 0;
    var heatmapContainer = document.getElementById('container-temporal-heatmap');
    if (heatmapContainer && heatmapRows > 0) {
      heatmapContainer.style.height = Math.max(200, heatmapRows * 28) + 'px';
    }

    _renderStatutsReels(data);
  _renderConvParType(data);

  // ── v3.0 — Intelligence ──
    ChartsEnrichis.createWinRateByMonthChart(data, 'chart-winrate-month');
    ChartsEnrichis.createPipelineWeightedChart(data, 'chart-pipeline-weighted');
    if (typeof ChartFilterController !== 'undefined' && ChartsEnrichis.charts['chart-pipeline-weighted']) {
      ChartFilterController.registerChart('chart-pipeline-weighted', ChartsEnrichis.charts['chart-pipeline-weighted'], { filterType: 'Client', clickable: true, highlightOnFilter: true, reRenderOnFilter: true });
    }

    // ── v9.0 — Graphiques configurables ──
    var cmNew = (typeof AE !== 'undefined') ? AE.getCAMode() : 'Bud';
    _renderTopClientsCa(data, cmNew);
    _renderConvTrend(data);
    _renderTypePerf(data, cmNew);
    _renderCycleTime(data);
    _renderScatterConvCa(data, cmNew);
  }

  // ── FILTRE TEMPOREL GLOBAL ──────────────────────────────

  // Stockage de la plage temporelle active
  var _timeline = { start: null, end: null, preset: '' };

  function _getDateRange(preset) {
    var now = new Date();
    var y   = now.getFullYear();
    var m   = now.getMonth();
    switch (preset) {
      case 'ytd': return { start: y + '-01-01', end: null };
      case '12m': {
        var d12 = new Date(now); d12.setFullYear(d12.getFullYear() - 1);
        return { start: d12.toISOString().slice(0, 10), end: null };
      }
      case '6m': {
        var d6 = new Date(now); d6.setMonth(d6.getMonth() - 6);
        return { start: d6.toISOString().slice(0, 10), end: null };
      }
      case 'q1': return { start: y + '-01-01', end: y + '-03-31' };
      case 'q2': return { start: y + '-04-01', end: y + '-06-30' };
      case 'q3': return { start: y + '-07-01', end: y + '-09-30' };
      case 'q4': return { start: y + '-10-01', end: y + '-12-31' };
      default: return { start: null, end: null };
    }
  }

  function _applyTimeline() {
    var badge   = document.getElementById('timeline-active-badge');
    var badgeTxt= document.getElementById('timeline-badge-text');
    var clearBtn= document.getElementById('timeline-clear');
    var hasFilter = _timeline.start || _timeline.end;

    if (badge)    badge.style.display    = hasFilter ? '' : 'none';
    if (clearBtn) clearBtn.style.display = hasFilter ? '' : 'none';

    if (hasFilter && badgeTxt) {
      var label = _timeline.start || '';
      if (_timeline.end) label += ' → ' + _timeline.end;
      else if (_timeline.start) label += ' → aujourd\'hui';
      badgeTxt.textContent = label;
    }

    if (typeof window.update === 'function') window.update();
  }

  // Patch AE.getFiltered pour intégrer le filtre temporel
  var _origGetFiltered = null;
  function _patchAE() {
    if (typeof AE === 'undefined' || _origGetFiltered) return;
    _origGetFiltered = AE.getFiltered.bind(AE);
    AE.getFiltered = function () {
      var data = _origGetFiltered();
      if (!_timeline.start && !_timeline.end) return data;
      if (typeof Analytics === 'undefined') return data;
      return Analytics.filterByDateRange(data, _timeline.start, _timeline.end, 'creation');
    };
  }

  // Wrap update() pour aussi déclencher les nouveaux graphiques
  var _originalUpdate = window.update;
  window.update = function () {
    if (typeof _originalUpdate === 'function') _originalUpdate();
    if (document.body.classList.contains('business-dashboard-simplified')) return;
    var data = (typeof AE !== 'undefined') ? AE.getFiltered() : (window.DATA || []);
    if (window._insights)    window._insights.render(data);
    if (window._healthScore) window._healthScore.render(data);
    renderNewCharts(data);
  };

  // Bouton CSV — utilise les données filtrées
  document.addEventListener('DOMContentLoaded', function () {
    // Patch AE dès que disponible
    _patchAE();
    setTimeout(_patchAE, 200); // backup si AE init tardive

    var btnCsv = document.getElementById('btn-csv');
    if (btnCsv) {
      var newBtn = btnCsv.cloneNode(true);
      btnCsv.parentNode.replaceChild(newBtn, btnCsv);
      newBtn.addEventListener('click', function() {
        if (typeof exportCSV === 'function') {
          exportCSV((typeof AE !== 'undefined') ? AE.getFiltered() : window.DATA);
        }
      });
    }

    // ── Contrôles timeline ──
    var presetSel     = document.getElementById('timeline-preset');
    var customRange   = document.getElementById('timeline-custom-range');
    var startInput    = document.getElementById('timeline-start');
    var endInput      = document.getElementById('timeline-end');
    var clearTimeline = document.getElementById('timeline-clear');

    if (presetSel) {
      presetSel.addEventListener('change', function () {
        var val = this.value;
        if (val === 'custom') {
          customRange && (customRange.style.display = '');
        } else {
          customRange && (customRange.style.display = 'none');
          if (val === '') {
            _timeline = { start: null, end: null, preset: '' };
          } else {
            var range = _getDateRange(val);
            _timeline = { start: range.start, end: range.end, preset: val };
          }
          _applyTimeline();
        }
      });
    }

    if (startInput) {
      startInput.addEventListener('change', function () {
        _timeline.start = this.value || null;
        _timeline.preset = 'custom';
        _applyTimeline();
      });
    }

    if (endInput) {
      endInput.addEventListener('change', function () {
        _timeline.end = this.value || null;
        _timeline.preset = 'custom';
        _applyTimeline();
      });
    }

    if (clearTimeline) {
      clearTimeline.addEventListener('click', function () {
        _timeline = { start: null, end: null, preset: '' };
        if (presetSel) presetSel.value = '';
        if (startInput) startInput.value = '';
        if (endInput) endInput.value = '';
        if (customRange) customRange.style.display = 'none';
        _applyTimeline();
      });
    }

    // Toggle boutons pour les nouvelles cartes
    document.querySelectorAll('.chart-toggle-btn').forEach(function(btn) {
      if (btn._hooked) return;
      btn._hooked = true;
      // Backup hook in case initToggleBtns missed this button
      btn.addEventListener('click', function() {
        var id = this.dataset.chart;
        if (id && window._chartVis && window._chartVis.toggle) {
          window._chartVis.toggle(id);
        }
      });
    });
  });

})();
