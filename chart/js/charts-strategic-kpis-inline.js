(function() {
  'use strict';

  function _pca(p, field) {
    // Toujours lire depuis 'Bud' (nouveau format data.js)
    return (typeof ProjectUtils !== 'undefined' ? ProjectUtils.parseMontant(p['Bud']) : parseFloat(p['Bud'])) || 0;
  }
  function _fmt(v) {
    if (!v) return '—';
    if (typeof ProjectUtils !== 'undefined') return ProjectUtils.formatMontant(v, true);
    if (v >= 1e6) return (v/1e6).toFixed(2) + 'M€';
    if (v >= 1e3) return Math.round(v/1e3) + 'k€';
    return Math.round(v) + '€';
  }
  function _st(p) {
    return typeof ProjectUtils !== 'undefined' ? ProjectUtils.getStatus(p) : (p['Statut'] || 'autre');
  }

  function computeStrategicKPIs(data) {
    if (!data || !data.length) return null;
    const won   = data.filter(p => _st(p) === 'obtenu');
    const lost  = data.filter(p => _st(p) === 'perdu');
    const offres = data.filter(p => _st(p) === 'offre');
    const decided = won.length + lost.length;
    const conv  = decided > 0 ? won.length / decided : 0;

    // 1. CA Facturé Réel (année active)
    const activeYear = (document.getElementById('year-filter') || {}).value || new Date().getFullYear();
    let caFacture = 0;
    data.forEach(p => {
      if (typeof Analytics !== 'undefined' && Analytics.getFacturation) {
        const fact = Analytics.getFacturation(p);
        if (fact) caFacture += parseFloat(fact[String(activeYear)] || 0) || 0;
      } else {
        caFacture += 0; // [CORRIGÉ v2] ca_facture_YYYY absent de data.js — toujours 0
      }
    });

    // 2. Pipeline Pondéré [CORRIGÉ v2] — Win proba au format "95%" → /100
    const pipeline = offres.reduce((s, p) => {
      const bud = _pca(p);  // lit toujours Bud
      const rawProb = p['Win proba'];
      let prob;
      if (rawProb !== null && rawProb !== undefined && String(rawProb).trim() !== '') {
        const n = parseFloat(String(rawProb).replace('%', '').trim());
        prob = (!isNaN(n) && n >= 0) ? n / 100 : conv;
      } else {
        prob = conv;
      }
      return s + Math.round(bud * prob);
    }, 0);

    // 3. Taux de Perte
    const tauxPerte = decided > 0 ? Math.round(lost.length / decided * 100) : 0;

    // 4. CA Moyen Gagné
    const caGagneTotal = won.reduce((s, p) => s + _pca(p), 0); // [CORRIGÉ v2] lit Bud
    const caMoyen = won.length > 0 ? Math.round(caGagneTotal / won.length) : 0;

    // 5. Délai Décision
    const decP = data.filter(p => ['obtenu','perdu'].includes(_st(p)) && p['Date réception'] && p['Date de retour demandée']);
    const avgDelay = decP.length > 0
      ? Math.round(decP.reduce((s,p) => {
          const days = (typeof ProjectUtils !== 'undefined' && ProjectUtils.daysBetween)
            ? ProjectUtils.daysBetween(p['Date réception'], p['Date de retour demandée'])
            : null;
          return s + Math.max(0, days || 0);
        }, 0) / decP.length)
      : null;

    // 6. Concentration Client
    const topCA = {};
    won.forEach(p => {
      const s = (p['Client'] || '').trim(); if (!s) return;
      topCA[s] = (topCA[s] || 0) + _pca(p); // [CORRIGÉ v2] lit Bud
    });
    const topEntries = Object.entries(topCA).sort((a,b) => b[1]-a[1]);
    const concPct = topEntries.length > 0 && caGagneTotal > 0
      ? Math.round(topEntries[0][1] / caGagneTotal * 100) : 0;
    const topClient = topEntries.length > 0 ? topEntries[0][0] : '—';

    return { caFacture, pipeline, tauxPerte, caMoyen, avgDelay, concPct, topClient };
  }

  function renderStrategicKPIs(data) {
    let bar = document.getElementById('strategic-kpis-bar');
    if (!bar) return;

    const kpis = computeStrategicKPIs(data);
    if (!kpis) { bar.innerHTML = ''; return; }

    const items = [
      {
        lbl: '💰 CA Facturé', val: _fmt(kpis.caFacture),
        sub: 'Réel encaissé', color: '#8b78f8'
      },
      {
        lbl: '⚖️ Pipeline Pondéré', val: _fmt(kpis.pipeline),
        sub: 'CA offres × probabilité', color: '#0099ff'
      },
      {
        lbl: '📉 Taux de Perte', val: kpis.tauxPerte + '%',
        sub: 'sur projets décidés', color: '#ff4d6d'
      },
      {
        lbl: '💼 CA Moyen Gagné', val: _fmt(kpis.caMoyen),
        sub: 'par projet obtenu', color: '#00d4aa'
      },
      {
        lbl: '⏱ Délai Décision', val: kpis.avgDelay !== null ? kpis.avgDelay + ' j' : '—',
        sub: 'création → échéance', color: '#f5b740'
      },
      {
        lbl: '🏦 Concentration', val: kpis.concPct + '%',
        sub: kpis.topClient.substring(0, 18), color: '#10b981'
      },
    ];

    bar.innerHTML = '<div class="skpi-grid">' + items.map(k =>
      `<div class="skpi-card" style="border-color:${k.color}22;">
        <div class="skpi-card" style="display:none"></div>
        <style>.skpi-card[data-c="${k.color}"]::after{background:${k.color};}</style>
        <div class="skpi-lbl">${k.lbl}</div>
        <div class="skpi-val" style="color:${k.color}">${k.val}</div>
        <div class="skpi-sub">${k.sub}</div>
        <div style="position:absolute;top:0;right:0;bottom:0;width:3px;background:${k.color};border-radius:0 var(--r) var(--r) 0;"></div>
      </div>`
    ).join('') + '</div>';
  }

  window._strategicKPIs = { render: renderStrategicKPIs };

  // Auto-hook dans update()
  document.addEventListener('DOMContentLoaded', function() {
    var _prev = window.update;
    window.update = function() {
      if (typeof _prev === 'function') _prev();
      var data = (typeof AE !== 'undefined') ? AE.getFiltered() : (window.DATA || []);
      renderStrategicKPIs(data);
    };
  });
})();
