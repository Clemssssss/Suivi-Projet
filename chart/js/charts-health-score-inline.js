(function () {
  'use strict';

  function computeHealthScore(data) {
    var won    = data.filter(function(p){ return ProjectUtils.getStatus(p) === 'obtenu'; });
    var lost   = data.filter(function(p){ return ProjectUtils.getStatus(p) === 'perdu';  });
    var offers = data.filter(function(p){ return ProjectUtils.getStatus(p) === 'offre';  });
    var decided = won.length + lost.length;
    var pCA = function(v){ return (typeof v === 'number' ? v : parseFloat(String(v||'').replace(/[^\d.]/g,''))||0); };

    // 1. Taux de conversion → 35 pts
    var convRate = decided > 0 ? won.length / decided : 0;
    var sc1 = Math.round(convRate * 35);

    // 2. Pipeline CA normalisé sur 5M€ → 25 pts
    var pipeCA = offers.reduce(function(s,p){ return s + pCA(p['Bud']); }, 0) * convRate;
    var sc2 = Math.min(25, Math.round((pipeCA / 3000000) * 25));

    // 3. Délai décision inversé (90j=0, 14j=20) → 20 pts
    var decP = data.filter(function(p){ var s=ProjectUtils.getStatus(p); return (s==='obtenu'||s==='perdu') && p['Date réception'] && p['Date de retour demandée']; });
    var avgDays = decP.length > 0
      ? decP.reduce(function(s,p){
          var days = (typeof ProjectUtils !== 'undefined' && ProjectUtils.daysBetween)
            ? ProjectUtils.daysBetween(p['Date réception'], p['Date de retour demandée'])
            : null;
          return s + Math.max(0, days || 0);
        }, 0) / decP.length
      : 90;
    var sc3 = Math.max(0, Math.min(20, Math.round(((90 - avgDays) / 76) * 20)));

    // 4. % non-perdus → 20 pts
    var sc4 = data.length > 0 ? Math.round((1 - lost.length / data.length) * 20) : 20;

    var total = sc1 + sc2 + sc3 + sc4;
    var color = total >= 80 ? '#10b981' : total >= 60 ? '#00d4aa' : total >= 40 ? '#f59e0b' : '#ef4444';
    var emoji = total >= 80 ? '🟢' : total >= 60 ? '🟡' : total >= 40 ? '🟠' : '🔴';
    var label = total >= 80 ? 'Excellente' : total >= 60 ? 'Bonne' : total >= 40 ? 'Moyenne' : 'Critique';

    return { total: total, color: color, emoji: emoji, label: label,
             breakdown: { conv: sc1, pipeline: sc2, delay: sc3, loss: sc4 } };
  }

  function renderHealthScore(data) {
    var badge = document.getElementById('health-score-badge');
    var valEl = document.getElementById('health-score-val');
    if (!badge || !valEl) return;
    if (data.length < 3) { badge.style.display = 'none'; return; }
    var s = computeHealthScore(data);
    badge.style.display = '';
    badge.style.borderColor = s.color;
    valEl.textContent = s.total;
    valEl.style.color = s.color;
    badge.title = s.emoji + ' ' + s.label + ' | Conv: ' + s.breakdown.conv + '/35 | Pipeline: ' + s.breakdown.pipeline + '/25 | Délai: ' + s.breakdown.delay + '/20 | Pertes: ' + s.breakdown.loss + '/20';
  }

  window._healthScore = { render: renderHealthScore };
})();
