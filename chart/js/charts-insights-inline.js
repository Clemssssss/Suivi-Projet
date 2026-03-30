(function () {
  'use strict';

  function pCA(v){ return (typeof v==='number'?v:parseFloat(String(v||'').replace(/[^\d.]/g,''))||0); }
  function fmt(v){ if(!v)return'—'; if(v>=1e6)return(v/1e6).toFixed(2).replace('.',',')+' M€'; if(v>=1e3)return Math.round(v/1e3)+' k€'; return Math.round(v)+'€'; }

  function genConversion(data) {
    var won = data.filter(function(p){ return ProjectUtils.getStatus(p)==='obtenu'; }).length;
    var lost = data.filter(function(p){ return ProjectUtils.getStatus(p)==='perdu'; }).length;
    var total = won + lost;
    if (total < 5) return null;
    var r = Math.round(won/total*100);
    var emoji = r>=60?'🟢':r>=40?'🟡':'🔴';
    return emoji + ' Taux de conversion : <strong>' + r + '%</strong> (' + won + ' obtenus / ' + total + ' décidés). '
      + (r>=60?'Performance solide.':r<40?'Zone d\'alerte — revoir la stratégie.':'Marge de progression identifiée.');
  }

  function genTopClient(data) {
    var counts = {};
    data.filter(function(p){ return ProjectUtils.getStatus(p)==='offre'; })
        .forEach(function(p){ var s=(p['Client']||'').trim(); if(s) counts[s]=(counts[s]||0)+1; });
    var sorted = Object.entries(counts).sort(function(a,b){ return b[1]-a[1]; });
    if (!sorted.length) return null;
    var top = sorted[0];
    return '🏆 Client le plus actif en pipeline : <strong>' + top[0] + '</strong> avec ' + top[1] + ' offre' + (top[1]>1?'s':'') + ' en cours.';
  }

  function genWeakZone(data) {
    var zones = {};
    data.forEach(function(p){
      var z = (p['Zone Géographique']||'').trim(); if(!z) return;
      var s = ProjectUtils.getStatus(p);
      if (!zones[z]) zones[z]={w:0,l:0};
      if(s==='obtenu') zones[z].w++;
      if(s==='perdu')  zones[z].l++;
    });
    var weakest = null, minR = Infinity;
    Object.entries(zones).forEach(function(e){
      var dec = e[1].w + e[1].l;
      if (dec < 3) return;
      var r = e[1].w / dec;
      if (r < minR) { minR = r; weakest = e[0]; }
    });
    if (!weakest) return null;
    return '⚠️ Zone à surveiller : <strong>' + weakest + '</strong> (taux ' + Math.round(minR*100) + '%). Opportunité d\'optimisation.';
  }

  function genDominantZone(data) {
    var counts = {};
    data.filter(function(p){ return ProjectUtils.getStatus(p)==='obtenu'; })
        .forEach(function(p){ var z=(p['Zone Géographique']||'').trim(); if(z) counts[z]=(counts[z]||0)+1; });
    var sorted = Object.entries(counts).sort(function(a,b){ return b[1]-a[1]; });
    if (!sorted.length) return null;
    var top = sorted[0];
    return '🌍 Zone dominante sur les projets obtenus : <strong>' + top[0] + '</strong> (' + top[1] + ' projet' + (top[1]>1?'s':'') + ').';
  }

  function genPipeline(data) {
    var won  = data.filter(function(p){ return ProjectUtils.getStatus(p)==='obtenu'; }).length;
    var lost = data.filter(function(p){ return ProjectUtils.getStatus(p)==='perdu'; }).length;
    var decided = won + lost;
    var convRate = decided > 0 ? won / decided : 0;
    var offers = data.filter(function(p){ return ProjectUtils.getStatus(p)==='offre'; });
    var totalCA = offers.reduce(function(s,p){ return s+pCA(p['Bud']); }, 0);
    var pipe = Math.round(totalCA * convRate);
    if (pipe < 1000) return null;
    return '💼 CA pipeline prévisionnel : <strong>' + fmt(pipe) + '</strong> (' + offers.length + ' offres × ' + Math.round(convRate*100) + '% taux conv.).';
  }

  function renderInsights(data) {
    var panel = document.getElementById('insights-panel');
    var list  = document.getElementById('insights-list');
    if (!panel || !list) return;
    if (data.length === 0) { panel.style.display='none'; return; }

    var generators = [genConversion, genTopClient, genDominantZone, genWeakZone, genPipeline];
    var insights = generators.map(function(fn){ try{ return fn(data); }catch(e){ return null; } }).filter(Boolean).slice(0, 3);

    if (insights.length === 0) { panel.style.display='none'; return; }

    panel.style.display = '';
    list.innerHTML = insights.map(function(txt){
      return '<div style="font-family:var(--sans);font-size:.8rem;color:var(--pale);line-height:1.55;padding:.45rem .7rem;background:rgba(255,255,255,.03);border-left:3px solid rgba(0,212,170,.45);border-radius:0 6px 6px 0;">' + txt + '</div>';
    }).join('');
  }

  window._insights = { render: renderInsights };
})();
