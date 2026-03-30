/**
 * STRATEGIC KPIs v2.0 — Source Unique de Vérité : Bud + Statut + Win proba
 * ============================================================================
 *
 * 6 KPI stratégiques calculés exclusivement depuis :
 *   - Bud      : montant de référence (CA étudié + gagné + perdu)
 *   - Statut   : obtenu / perdu / offre
 *   - Win proba: probabilité individuelle (colonne "Win proba")
 *
 * KPIs :
 *  1. CA Total Bud          — somme Bud tous statuts
 *  2. Pipeline Pondéré      — Bud×Win proba (offres) + Bud (obtenus)
 *  3. Taux de Perte         — perdus / (obtenus + perdus) × 100
 *  4. CA Moyen Gagné        — Bud moyen sur projets obtenus
 *  5. Taux de Conversion    — obtenus / (obtenus + perdus) × 100
 *  6. Concentration Client  — % top client sur CA gagné
 *
 * ZERO dépendance : ca_etudie, ca_gagne, ca_facture, annee_facturation
 */

// ── GUARD ANTI-REDÉCLARATION ─────────────────────────────────────────────────
if (!window.StrategicKPIs) {
(function (global) {
  'use strict';

  function _getData() {
    if (typeof DataFilterEngine !== 'undefined' && DataFilterEngine.getFilteredData)
      return DataFilterEngine.getFilteredData();
    if (typeof AE !== 'undefined' && typeof AE.getFiltered === 'function')
      return AE.getFiltered();
    return (typeof window !== 'undefined' && window.DATA) ? window.DATA : [];
  }

  function _status(p) {
    return (typeof ProjectUtils !== 'undefined' && ProjectUtils.getStatus)
      ? ProjectUtils.getStatus(p)
      : (p['Statut'] || 'autre').toLowerCase();
  }

  /**
   * Valeur CA selon le mode — DÉLÈGUE à Analytics.getCAValue.
   * Aucune lecture directe de p['Bud'] ici.
   * @param {Object} p
   * @param {string} [mode='ca_etudie']
   */
  function _ca(p, mode) {
    if (typeof Analytics !== 'undefined' && Analytics.getCAValue)
      return Analytics.getCAValue(p, mode || 'ca_etudie');
    // Fallback minimal si Analytics non chargé
    const bud = (typeof ProjectUtils !== 'undefined' && ProjectUtils.parseMontant)
      ? (ProjectUtils.parseMontant(p['Bud']) || 0)
      : (parseFloat(p['Bud']) || 0);
    return (mode === 'ca_gagne')
      ? (((typeof ProjectUtils !== 'undefined' ? ProjectUtils.getStatus(p) : p['Statut']) === 'obtenu') ? bud : 0)
      : bud;
  }

  function _fmt(v) {
    if (!v || isNaN(v) || v === 0) return '—';
    if (typeof ProjectUtils !== 'undefined' && ProjectUtils.formatMontant)
      return ProjectUtils.formatMontant(v, true);
    if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(2) + 'M€';
    if (Math.abs(v) >= 1e3) return Math.round(v / 1e3) + 'k€';
    return Math.round(v) + '€';
  }

  function _caTotal(data) {
    const total = data.reduce((s, p) => s + _ca(p, 'ca_etudie'), 0);
    const won   = data.filter(p => _status(p) === 'obtenu').reduce((s, p) => s + _ca(p, 'ca_etudie'), 0);
    return { total, won };
  }

  function _pipelinePondere(data) {
    const won  = data.filter(p => _status(p) === 'obtenu').length;
    const lost = data.filter(p => _status(p) === 'perdu').length;
    const globalRate = (won + lost) > 0 ? won / (won + lost) : 0.3;

    // Déléguer à Analytics.getCAValue('pipeline') si disponible
    if (typeof Analytics !== 'undefined' && Analytics.getCAValue) {
      let weighted = 0, offresCount = 0;
      data.forEach(p => {
        const st = _status(p);
        if (st === 'obtenu') { weighted += _ca(p, 'ca_etudie'); return; }
        if (st === 'offre')  { offresCount++; weighted += Analytics.getCAValue(p, 'pipeline'); }
      });
      return { value: Math.round(weighted), count: offresCount, rate: Math.round(globalRate * 100) };
    }

    let weighted = 0, offresCount = 0;
    data.forEach(p => {
      const st = _status(p), bud = _ca(p, 'ca_etudie');
      if (st === 'obtenu') { weighted += bud; return; }
      if (st === 'offre') {
        offresCount++;
        const raw = p['Win proba'];
        if (raw !== null && raw !== undefined && raw !== '') {
          const n = parseFloat(String(raw).replace('%', '').trim());
          if (!isNaN(n) && n >= 0) { weighted += Math.round(bud * n / 100); return; }
        }
        weighted += Math.round(bud * globalRate);
      }
    });
    return { value: Math.round(weighted), count: offresCount, rate: Math.round(globalRate * 100) };
  }

  function _tauxPerte(data) {
    const won = data.filter(p => _status(p) === 'obtenu').length;
    const lost = data.filter(p => _status(p) === 'perdu').length;
    const decided = won + lost;
    return { value: decided > 0 ? Math.round((lost / decided) * 100) : null, lost, decided };
  }

  function _caParProjet(data) {
    const obtenus = data.filter(p => _status(p) === 'obtenu');
    if (obtenus.length === 0) return { value: 0, count: 0 };
    const total = obtenus.reduce((s, p) => s + _ca(p, 'ca_gagne'), 0);
    return { value: Math.round(total / obtenus.length), count: obtenus.length };
  }

  function _tauxConversion(data) {
    const won = data.filter(p => _status(p) === 'obtenu').length;
    const lost = data.filter(p => _status(p) === 'perdu').length;
    const decided = won + lost;
    return { value: decided > 0 ? Math.round((won / decided) * 100) : null, won, decided };
  }

  function _concentrationClient(data) {
    const obtenus = data.filter(p => _status(p) === 'obtenu');
    if (obtenus.length === 0) return { value: null, topClient: null, topCA: 0, totalCA: 0 };
    const byClient = {};
    obtenus.forEach(p => {
      const c = (p['Client'] || '').trim();
      if (!c) return;
      byClient[c] = (byClient[c] || 0) + _ca(p, 'ca_gagne');
    });
    const entries = Object.entries(byClient).sort((a, b) => b[1] - a[1]);
    const totalCA = entries.reduce((s, [, v]) => s + v, 0);
    const top = entries[0];
    if (!top || totalCA === 0) return { value: null, topClient: null, topCA: 0, totalCA };
    return { value: Math.round((top[1] / totalCA) * 100), topClient: top[0], topCA: top[1], totalCA };
  }

  function _delaiDecision(data) {
    var dec = data.filter(function(p) {
      var st = _status(p);
      return (st==='obtenu'||st==='perdu') && p['Date réception'] && p['Date de retour demandée'];
    });
    if (!dec.length) return { value: null, count: 0 };
    var tot=0, cnt=0;
    dec.forEach(function(p) {
      var d1=new Date(p['Date réception']), d2=new Date(p['Date de retour demandée']);
      if (isNaN(d1)||isNaN(d2)) return;
      tot+=Math.max(0,(d2-d1)/86400000); cnt++;
    });
    return { value: cnt>0?Math.round(tot/cnt):null, count: cnt };
  }

  function _caGagne(data) {
    var ob = data.filter(function(p){ return _status(p)==='obtenu'; });
    return { value: ob.reduce(function(s,p){ return s+_ca(p,'ca_etudie'); },0), count: ob.length };
  }

  const KPI_STYLES = {
    caGagne:      { accent: '#8b78f8', icon: '💰', label: 'CA Gagné'         },
    pipeline:     { accent: '#0099ff', icon: '🔮', label: 'Pipeline Pondéré' },
    perte:        { accent: '#ff4d6d', icon: '📉', label: 'Taux de Perte'    },
    caParProjet:  { accent: '#00d4aa', icon: '💼', label: 'CA Moy. Gagné'    },
    conversion:   { accent: '#f5b740', icon: '🎯', label: 'Taux Conversion'  },
    concentration:{ accent: '#10b981', icon: '🏦', label: 'Concentration'    },
    delai:        { accent: '#f97316', icon: '⏱',  label: 'Délai Décision'  },
  };

  function _renderCard(key, main, sub, extra) {
    const s = KPI_STYLES[key] || { accent: '#0099ff', icon: '📈', label: key };
    return `<div class="skpi-card" data-kpi="${key}" style="--skpi-accent:${s.accent};">
        <div class="skpi-icon">${s.icon}</div>
        <div class="skpi-body">
          <div class="skpi-lbl">${s.label}</div>
          <div class="skpi-val">${main}</div>
          ${sub   ? `<div class="skpi-sub">${sub}</div>`   : ''}
          ${extra ? `<div class="skpi-extra">${extra}</div>` : ''}
        </div>
        <div class="skpi-bar" style="background:var(--skpi-accent);"></div>
      </div>`;
  }

  function _render(container) {
    const data = _getData();
    const cg   = _caGagne(data);
    const pp   = _pipelinePondere(data);
    const tp   = _tauxPerte(data);
    const capp = _caParProjet(data);
    const tc   = _tauxConversion(data);
    const cc   = _concentrationClient(data);
    const dd   = _delaiDecision(data);

    container.innerHTML = `<div class="skpi-grid">
      ${_renderCard('caGagne',      cg.value > 0 ? _fmt(cg.value) : '—', `${cg.count} projet${cg.count>1?'s':''} obtenu${cg.count>1?'s':''}`, '')}
      ${_renderCard('pipeline',     _fmt(pp.value), `${pp.count} offres × Win proba`, pp.rate + '% conv. globale')}
      ${_renderCard('perte',        tp.value !== null ? tp.value + '%' : '—', `${tp.lost} perdus / ${tp.decided} décidés`, '')}
      ${_renderCard('caParProjet',  capp.value > 0 ? _fmt(capp.value) : '—', `sur ${capp.count} projet${capp.count > 1 ? 's' : ''} obtenu${capp.count > 1 ? 's' : ''}`, '')}
      ${_renderCard('conversion',   tc.value !== null ? tc.value + '%' : '—', `${tc.won} gagnés / ${tc.decided} décidés`, '')}
      ${_renderCard('delai', dd.value!==null?dd.value+' j':'—', dd.count>0?`sur ${dd.count} décidé${dd.count>1?'s':''}`:'aucun', '')}
      ${_renderCard('concentration', cc.value !== null ? cc.value + '%' : '—', cc.topClient ? cc.topClient.substring(0, 22) : '—', cc.topCA > 0 ? _fmt(cc.topCA) + ' CA gagné' : '')}
    </div>`;

    container.querySelectorAll('.skpi-val').forEach(el => {
      el.classList.remove('skpi-pulse');
      void el.offsetWidth;
      el.classList.add('skpi-pulse');
      setTimeout(() => el.classList.remove('skpi-pulse'), 600);
    });
  }

  function _injectCSS() {
    if (document.getElementById('skpi-styles')) return;
    const style = document.createElement('style');
    style.id = 'skpi-styles';
    style.textContent = `
      #strategic-kpis-bar { margin: 0 2.5rem 1.75rem; }
      .skpi-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:.85rem; }
      .skpi-card {
        position:relative; background:linear-gradient(135deg,#151f30 0%,#101928 100%);
        border:1px solid rgba(255,255,255,.07); border-radius:12px;
        padding:1rem 1.1rem .9rem; display:flex; align-items:flex-start; gap:.75rem;
        overflow:hidden; transition:border-color .2s,transform .18s,box-shadow .2s; cursor:default;
      }
      .skpi-card::before {
        content:''; position:absolute; top:0;left:0;right:0; height:2px;
        background:var(--skpi-accent,#00d4aa); opacity:.55; border-radius:12px 12px 0 0;
      }
      .skpi-card:hover { border-color:var(--skpi-accent,#00d4aa); transform:translateY(-2px); box-shadow:0 8px 24px rgba(0,0,0,.3); }
      .skpi-bar { position:absolute; right:0;top:12%;bottom:12%; width:3px; border-radius:99px; opacity:.25; }
      .skpi-icon { font-size:1.1rem; margin-top:.05rem; flex-shrink:0; }
      .skpi-body { flex:1; min-width:0; }
      .skpi-lbl { font-family:'DM Mono',monospace; font-size:.62rem; text-transform:uppercase; letter-spacing:.07em; color:#6b7f96; margin-bottom:.3rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .skpi-val { font-family:'Fraunces',Georgia,serif; font-size:1.2rem; font-weight:700; color:#dce8f5; line-height:1; transition:color .3s; }
      .skpi-val.skpi-pulse { color:var(--skpi-accent,#00d4aa); }
      .skpi-sub { font-family:'DM Mono',monospace; font-size:.6rem; color:#5a7089; margin-top:.35rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .skpi-extra { font-family:'DM Mono',monospace; font-size:.58rem; color:#445566; margin-top:.15rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      @keyframes skpiEntry { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
      .skpi-card{animation:skpiEntry .35s ease-out both;}
      .skpi-card:nth-child(1){animation-delay:.04s} .skpi-card:nth-child(2){animation-delay:.08s}
      .skpi-card:nth-child(3){animation-delay:.12s} .skpi-card:nth-child(4){animation-delay:.16s}
      .skpi-card:nth-child(5){animation-delay:.20s} .skpi-card:nth-child(6){animation-delay:.24s}
      @media(max-width:900px){#strategic-kpis-bar{margin:0 1rem 1.25rem}.skpi-grid{grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.6rem}}
      @media(max-width:600px){.skpi-grid{grid-template-columns:1fr 1fr}.skpi-val{font-size:1rem}}
    `;
    document.head.appendChild(style);
  }

  function _init() {
    _injectCSS();
    const container = document.getElementById('strategic-kpis-bar');
    if (!container) { console.warn('[StrategicKPIs v2] #strategic-kpis-bar introuvable.'); return; }

    _render(container);

    // Guard : subscribe FM et AE une seule fois
    if (!window._skpiSubscribed) {
      if (typeof FilterManager !== 'undefined') FilterManager.subscribe(() => _render(container));
      if (typeof AE !== 'undefined' && typeof AE.subscribe === 'function') AE.subscribe(() => _render(container));
      window._skpiSubscribed = true;
    }

    console.log('[StrategicKPIs v2.0] ✅ Bud + Statut + Win proba — aucune facturation');
  }

  const StrategicKPIs = {
    init:   _init,
    render: () => { const c = document.getElementById('strategic-kpis-bar'); if (c) _render(c); }
  };

  if (typeof window !== 'undefined') window.StrategicKPIs = StrategicKPIs;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    setTimeout(_init, 50);
  }

})(typeof window !== 'undefined' ? window : this);
} // end guard !window.StrategicKPIs
