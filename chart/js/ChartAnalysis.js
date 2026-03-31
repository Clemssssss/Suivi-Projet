/**
 * ════════════════════════════════════════════════════════════════
 *  CHART ANALYSIS v2.0 — Explications Dynamiques + Vue Tableau
 * ════════════════════════════════════════════════════════════════
 *
 *  v2.0 améliorations :
 *   • 35+ analyseurs spécifiques par graphique (contexte réel)
 *   • Ratios enrichis : CA/dossier, efficacité client, concentration
 *   • Toggle graphique ↔ tableau synthétique sur chaque chart
 *   • Projection prospective (ciblage N+1 depuis données N)
 *   • Analyse des pertes et opportunités manquées
 *
 *  API :
 *   ChartAnalysis.renderForChart(chartId, data)
 *   ChartAnalysis.renderAll(data)
 *   ChartAnalysis.getAnalysisText(chartId, data)  → string PDF-safe
 * ════════════════════════════════════════════════════════════════
 */

if (!window.ChartAnalysis) {
window.ChartAnalysis = (() => {
  'use strict';

  /* ──────────────────────────────────────────────────────────────
     HELPERS
  ────────────────────────────────────────────────────────────── */

  function _getCA(p, mode) {
    if (typeof Analytics !== 'undefined' && Analytics.getCAValue)
      return Analytics.getCAValue(p, mode || 'ca_etudie');
    return parseFloat(p['Bud']) || 0;
  }

  function _status(p) {
    return (typeof ProjectUtils !== 'undefined' && ProjectUtils.getStatus)
      ? ProjectUtils.getStatus(p)
      : (p['Statut'] || '').toLowerCase();
  }

  function _fmt(v) {
    if (!v || isNaN(v)) return '—';
    if (typeof ProjectUtils !== 'undefined' && ProjectUtils.formatMontant)
      return ProjectUtils.formatMontant(v, true);
    if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + 'M€';
    if (Math.abs(v) >= 1e3) return Math.round(v / 1e3) + 'k€';
    return Math.round(v) + '€';
  }

  function _pct(a, b) {
    if (!b) return null;
    return Math.round(((a - b) / b) * 100);
  }

  function _s(n) { return n > 1 ? 's' : ''; }

  function _resolveChart(chartId) {
    if (typeof Chart === 'undefined') return null;
    const canvas = document.getElementById(chartId);
    if (!canvas) return null;
    try {
      if (typeof Chart.getChart === 'function') return Chart.getChart(canvas) || null;
      if (Chart.instances) return Object.values(Chart.instances).find(i => i && i.canvas === canvas) || null;
    } catch (e) { return null; }
    return null;
  }

  function _formatVal(value) {
    const num = Number(value);
    if (!isFinite(num)) return null;
    if (Math.abs(num) <= 1 && num !== 0) return Math.round(num * 100) + '%';
    if (Math.abs(num) > 0 && Math.abs(num) <= 100) return num.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
    return _fmt(num);
  }

  /* Année d'un projet selon champ date courant */
  function _year(p) {
    const fields = ['Date réception','Date de retour demandée','Décidé le '];
    for (const f of fields) {
      const raw = p[f];
      if (!raw) continue;
      const d = (typeof ProjectUtils !== 'undefined' && ProjectUtils.parseDate)
        ? ProjectUtils.parseDate(raw)
        : new Date(raw);
      if (d && !isNaN(d)) return d.getFullYear();
    }
    if (p['_annee']) return parseInt(p['_annee']);
    return null;
  }

  /* Groupe data par clé, retourne tableau trié par valeur desc */
  function _groupBy(data, keyFn, valFn) {
    const map = {};
    data.forEach(p => {
      const k = keyFn(p);
      if (!k) return;
      if (!map[k]) map[k] = { count: 0, ca: 0 };
      map[k].count++;
      map[k].ca += valFn ? valFn(p) : 0;
    });
    return Object.entries(map).sort((a, b) => b[1].ca - a[1].ca);
  }

  /* ──────────────────────────────────────────────────────────────
     TABLE BUILDER — lit Chart.js et génère une table HTML
  ────────────────────────────────────────────────────────────── */

  function _buildTableFromChart(chartId) {
    const chart = _resolveChart(chartId);
    if (!chart || !chart.data) return null;

    const labels = Array.isArray(chart.data.labels) ? chart.data.labels : [];
    const datasets = (chart.data.datasets || []).filter(ds => ds && Array.isArray(ds.data));
    if (!labels.length && !datasets.length) return null;

    const isMulti = datasets.length > 1;
    let rows = [];

    if (isMulti) {
      // Lignes = labels, colonnes = datasets
      rows = labels.map((label, i) => {
        const cells = datasets.map(ds => {
          const raw = ds.data[i];
          const num = typeof raw === 'object' && raw !== null
            ? Number(raw.y != null ? raw.y : raw.x)
            : Number(raw);
          return _formatVal(num) || '—';
        });
        return { label: String(label || ''), cells };
      }).filter(r => r.label);
    } else if (datasets.length === 1) {
      const ds = datasets[0];
      const combined = labels.map((label, i) => {
        const raw = ds.data[i];
        const num = typeof raw === 'object' && raw !== null
          ? Number(raw.y != null ? raw.y : raw.x)
          : Number(raw);
        return { label: String(label || ''), val: isFinite(num) ? num : null };
      }).filter(r => r.label && r.val !== null);
      combined.sort((a, b) => b.val - a.val);
      rows = combined.map(r => ({ label: r.label, cells: [_formatVal(r.val) || '—'] }));
    }

    if (!rows.length) return null;

    const headers = isMulti
      ? ['Catégorie', ...datasets.map(ds => ds.label || 'Valeur')]
      : ['Catégorie', 'Valeur'];

    let html = '<table class="ca-data-table">';
    html += '<thead><tr>' + headers.map(h => `<th>${h}</th>`).join('') + '</tr></thead>';
    html += '<tbody>';
    rows.forEach(r => {
      html += `<tr><td class="ca-dt-label">${r.label}</td>`;
      r.cells.forEach(c => { html += `<td class="ca-dt-val">${c}</td>`; });
      html += '</tr>';
    });
    html += '</tbody></table>';
    return html;
  }

  /* ──────────────────────────────────────────────────────────────
     PROJECTION N+1 — insights prospectifs depuis données N
  ────────────────────────────────────────────────────────────── */

  function _projectionInsight(data) {
    if (!data || data.length < 5) return null;

    // Trouver l'année la plus récente avec au moins 5 projets décidés
    const byYear = {};
    data.forEach(p => {
      const y = _year(p);
      if (!y) return;
      if (!byYear[y]) byYear[y] = { won: [], lost: [], all: [] };
      byYear[y].all.push(p);
      if (_status(p) === 'obtenu') byYear[y].won.push(p);
      if (_status(p) === 'perdu')  byYear[y].lost.push(p);
    });

    const years = Object.keys(byYear).map(Number).sort((a, b) => b - a);
    if (!years.length) return null;

    const refYear = years.find(y => byYear[y].won.length + byYear[y].lost.length >= 3) || years[0];
    const ref = byYear[refYear];
    if (!ref) return null;

    const nextYear = refYear + 1;
    const decided  = ref.won.length + ref.lost.length;
    const conv     = decided > 0 ? Math.round(ref.won.length / decided * 100) : 0;

    // Top clients de l'année de référence
    const clientCA = {};
    const clientCount = {};
    ref.won.forEach(p => {
      const c = (p['Client'] || '').trim();
      if (!c) return;
      clientCA[c]    = (clientCA[c] || 0)    + _getCA(p, 'ca_gagne');
      clientCount[c] = (clientCount[c] || 0) + 1;
    });
    const topClients = Object.entries(clientCA)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([c, ca]) => `<strong>${c}</strong> (${_fmt(ca)}, ${clientCount[c]} dossier${_s(clientCount[c])})`);

    // Top zones
    const zoneCA = {};
    ref.won.forEach(p => {
      const z = (p['Zone Géographique'] || '').trim();
      if (!z) return;
      zoneCA[z] = (zoneCA[z] || 0) + _getCA(p, 'ca_gagne');
    });
    const topZone = Object.entries(zoneCA).sort((a, b) => b[1] - a[1])[0];

    // Mois pic de l'année de référence
    const byMonth = {};
    ref.won.forEach(p => {
      const raw = p['Date réception'];
      if (!raw) return;
      const d = (typeof ProjectUtils !== 'undefined' && ProjectUtils.parseDate)
        ? ProjectUtils.parseDate(raw)
        : new Date(raw);
      if (!d || isNaN(d)) return;
      const m = d.getMonth();
      byMonth[m] = (byMonth[m] || 0) + 1;
    });
    const monthNames = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Aoû','Sep','Oct','Nov','Déc'];
    const peakMonth = Object.entries(byMonth).sort((a, b) => b[1] - a[1])[0];

    const lines = [
      `🔮 <strong>Projection ${nextYear}</strong> — basée sur ${refYear} (${ref.won.length} obtenus, conv. ${conv}%).`,
      topClients.length ? `🎯 Clients à prioriser : ${topClients.join(' · ')}.` : '',
      topZone ? `🌍 Zone la plus rentable en ${refYear} : <strong>${topZone[0]}</strong> (${_fmt(topZone[1])}).` : '',
      peakMonth ? `📅 Pic historique : <strong>${monthNames[Number(peakMonth[0])]}</strong> — concentrer les relances.` : '',
    ];

    return lines.filter(Boolean).join('<br>');
  }

  /* ──────────────────────────────────────────────────────────────
     RATIO CLIENT — analyse enrichie avec CA/dossier
  ────────────────────────────────────────────────────────────── */

  function _clientRatioTable(data, topN) {
    topN = topN || 8;
    const clients = {};
    data.forEach(p => {
      const c = (p['Client'] || '').trim();
      if (!c) return;
      if (!clients[c]) clients[c] = { won: 0, lost: 0, offer: 0, caWon: 0, caTotal: 0 };
      const st = _status(p);
      const ca = _getCA(p, 'ca_etudie');
      clients[c].caTotal += ca;
      if (st === 'obtenu') { clients[c].won++;  clients[c].caWon += _getCA(p, 'ca_gagne'); }
      if (st === 'perdu')   clients[c].lost++;
      if (st === 'offre')   clients[c].offer++;
    });

    return Object.entries(clients)
      .map(([name, d]) => {
        const decided  = d.won + d.lost;
        const conv     = decided > 0 ? Math.round(d.won / decided * 100) : null;
        const avgWon   = d.won > 0 ? d.caWon / d.won : 0;
        return { name, ...d, decided, conv, avgWon };
      })
      .sort((a, b) => b.caWon - a.caWon)
      .slice(0, topN);
  }

  /* ──────────────────────────────────────────────────────────────
     ANALYSEURS SPÉCIFIQUES par graphique
  ────────────────────────────────────────────────────────────── */

  const _ANALYZERS = {

    /* ── TENDANCE MENSUELLE ── */
    'chart-monthly': (data) => {
      const byMonth = {};
      data.forEach(p => {
        const raw = p['Date réception'];
        if (!raw) return;
        const d = (typeof ProjectUtils !== 'undefined' && ProjectUtils.parseDate)
          ? ProjectUtils.parseDate(raw) : new Date(raw);
        if (!d || isNaN(d)) return;
        const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
        byMonth[key] = (byMonth[key] || 0) + _getCA(p, 'ca_etudie');
      });
      const months = Object.keys(byMonth).sort();
      if (months.length < 2) return null;
      const last = byMonth[months[months.length-1]];
      const prev = byMonth[months[months.length-2]];
      const delta = _pct(last, prev);
      const peak = months.reduce((a, b) => byMonth[a] > byMonth[b] ? a : b);
      const avg  = Object.values(byMonth).reduce((a,b)=>a+b,0) / months.length;
      return [
        delta !== null
          ? (delta >= 0
            ? `📈 Hausse de <strong>+${delta}%</strong> sur le dernier mois.`
            : `📉 Baisse de <strong>${delta}%</strong> sur le dernier mois.`)
          : '',
        `🏆 Mois record : <strong>${peak}</strong> (${_fmt(byMonth[peak])}).`,
        `📊 ${months.length} mois · moyenne <strong>${_fmt(avg)}</strong>/mois.`,
      ].filter(Boolean).join(' &nbsp;·&nbsp; ');
    },

    /* ── CA PAR ANNÉE ── */
    'chart-ca-year': (data) => {
      const byYear = {};
      data.forEach(p => {
        const y = _year(p);
        if (!y) return;
        byYear[y] = (byYear[y]||0) + _getCA(p,'ca_etudie');
      });
      const entries = Object.entries(byYear).sort((a,b)=>a[0]-b[0]);
      if (entries.length < 2) return null;
      const last = entries[entries.length-1];
      const prev = entries[entries.length-2];
      const delta = _pct(Number(last[1]), Number(prev[1]));
      const proj  = _projectionInsight(data);
      return [
        delta !== null
          ? (delta >= 0
            ? `📈 <strong>${last[0]}</strong> : +${delta}% vs ${prev[0]} (${_fmt(last[1])} vs ${_fmt(prev[1])}).`
            : `📉 <strong>${last[0]}</strong> : ${delta}% vs ${prev[0]} (${_fmt(last[1])} vs ${_fmt(prev[1])}).`)
          : '',
        proj || '',
      ].filter(Boolean).join('<br>');
    },

    'chart-ca-by-year-v2': (data) => {
      return _ANALYZERS['chart-ca-year'](data);
    },

    /* ── PROJETS PERDUS ── */
    'chart-perdu': (data) => {
      const perdu = data.filter(p => _status(p) === 'perdu');
      if (!perdu.length) return '✅ Aucun projet perdu dans la sélection actuelle.';
      const byClient = {};
      const byClientCA = {};
      perdu.forEach(p => {
        const c = (p['Client'] || 'N/A').trim();
        byClient[c]   = (byClient[c]||0)   + 1;
        byClientCA[c] = (byClientCA[c]||0) + _getCA(p,'ca_etudie');
      });
      const topCount = Object.entries(byClient).sort((a,b)=>b[1]-a[1])[0];
      const topCA    = Object.entries(byClientCA).sort((a,b)=>b[1]-a[1])[0];
      const decided  = data.filter(p=>['obtenu','perdu'].includes(_status(p))).length;
      const tauxPerte = decided > 0 ? Math.round(perdu.length/decided*100) : 0;
      const caPerdu  = perdu.reduce((s,p)=>s+_getCA(p,'ca_etudie'),0);
      return [
        tauxPerte > 60
          ? `⚠️ Taux de perte élevé : <strong>${tauxPerte}%</strong> — analyse approfondie recommandée.`
          : `📊 Taux de perte : <strong>${tauxPerte}%</strong> sur ${decided} projets décidés.`,
        `💸 CA perdu total : <strong>${_fmt(caPerdu)}</strong>.`,
        topCount ? `⚠️ Client avec le plus de pertes : <strong>${topCount[0]}</strong> (${topCount[1]} projet${_s(topCount[1])}).` : '',
        topCA && topCA[0] !== topCount[0] ? `💸 CA perdu maximal : <strong>${topCA[0]}</strong> (${_fmt(topCA[1])}).` : '',
        `💡 Analyser les conditions perdantes chez <strong>${topCount?.[0]}</strong> pour cibler les améliorations.`,
      ].filter(Boolean).join(' &nbsp;·&nbsp; ');
    },

    /* ── PERTES CLIENT ── */
    'chart-pertes-client': (data) => {
      return _ANALYZERS['chart-perdu'](data);
    },

    /* ── PROJETS OBTENUS ── */
    'chart-obtenu': (data) => {
      const obtenus = data.filter(p => _status(p) === 'obtenu');
      if (!obtenus.length) return '📭 Aucun projet obtenu dans la sélection actuelle.';
      const ratios = _clientRatioTable(data, 5);
      const top = ratios[0];
      const caTotal = obtenus.reduce((s,p)=>s+_getCA(p,'ca_gagne'),0);
      const nClients = new Set(obtenus.map(p=>(p['Client']||'').trim()).filter(Boolean)).size;
      const conc = top && caTotal > 0 ? Math.round(top.caWon/caTotal*100) : 0;
      return [
        conc > 50
          ? `⚠️ <strong>${top.name}</strong> représente ${conc}% du CA gagné — risque de dépendance.`
          : top
          ? `🏆 Leader : <strong>${top.name}</strong> — ${top.won} dossier${_s(top.won)} · ${_fmt(top.caWon)} · conv. ${top.conv ?? '—'}%.`
          : '',
        `💰 CA total gagné : <strong>${_fmt(caTotal)}</strong> sur ${obtenus.length} projets.`,
        nClients >= 5
          ? `✅ ${nClients} clients différents — bonne diversification.`
          : `⚠️ Seulement ${nClients} client${_s(nClients)} — diversification à améliorer.`,
        top && top.avgWon > 0 ? `📐 CA moyen/dossier (leader) : <strong>${_fmt(top.avgWon)}</strong>.` : '',
      ].filter(Boolean).join(' &nbsp;·&nbsp; ');
    },

    /* ── CA PAR SOCIÉTÉ TOP 8 ── */
    'chart-ca-company': (data) => {
      const ratios = _clientRatioTable(data, 8);
      if (!ratios.length) return null;
      const top = ratios[0];
      const totalCA = ratios.reduce((s,r)=>s+r.caWon,0) || ratios.reduce((s,r)=>s+r.caTotal,0);
      const topPct  = totalCA > 0 ? Math.round((top.caWon||top.caTotal)/totalCA*100) : 0;
      const top3 = ratios.slice(0,3).map(r=>`${r.name} ${_fmt(r.caWon||r.caTotal)}`).join(' · ');
      return [
        topPct > 40
          ? `⚠️ <strong>${top.name}</strong> représente ${topPct}% du CA — risque de concentration.`
          : `🏆 <strong>${top.name}</strong> — ${_fmt(top.caWon||top.caTotal)} · ${top.won} dossier${_s(top.won)} · conv. ${top.conv ?? '—'}%.`,
        top.won > 0 ? `📐 CA moyen par dossier gagné : <strong>${_fmt(top.avgWon)}</strong>.` : '',
        `💡 Top 3 : ${top3}.`,
      ].filter(Boolean).join(' &nbsp;·&nbsp; ');
    },

    /* ── CA CLIENT (horizontal) ── */
    'chart-ca-client': (data) => {
      return _ANALYZERS['chart-ca-company'](data);
    },

    /* ── TOP CLIENTS CA GAGNÉ ── */
    'chart-top-clients-ca': (data) => {
      const ratios = _clientRatioTable(data, 5);
      if (!ratios.length) return null;
      const top = ratios[0];
      return [
        `🏆 <strong>${top.name}</strong> — CA gagné ${_fmt(top.caWon)} · ${top.won} dossier${_s(top.won)} · CA moyen <strong>${_fmt(top.avgWon)}</strong>.`,
        top.conv !== null ? `🎯 Taux de conversion : <strong>${top.conv}%</strong> (${top.won} obtenus sur ${top.decided} décidés).` : '',
        ratios.length >= 2 ? `📊 2e : <strong>${ratios[1].name}</strong> — ${_fmt(ratios[1].caWon)} · ${ratios[1].won} dossier${_s(ratios[1].won)}.` : '',
      ].filter(Boolean).join(' &nbsp;·&nbsp; ');
    },

    /* ── TAUX DE RÉUSSITE PAR SOCIÉTÉ ── */
    'chart-win-rate': (data) => {
      const ratios = _clientRatioTable(data, 10).filter(r => r.decided >= 2);
      if (!ratios.length) return '📭 Pas assez de données (min. 2 projets décidés par client).';
      ratios.sort((a,b) => (b.conv||0) - (a.conv||0));
      const best  = ratios[0];
      const worst = ratios[ratios.length-1];
      const avg   = Math.round(ratios.reduce((s,r)=>s+(r.conv||0),0)/ratios.length);
      return [
        `🏆 Meilleur taux : <strong>${best.name}</strong> ${best.conv}% (${best.won}/${best.decided} · CA moy. ${_fmt(best.avgWon)}).`,
        `📉 Taux le plus faible : <strong>${worst.name}</strong> ${worst.conv}% (${worst.won}/${worst.decided}).`,
        `📊 Moyenne sur ${ratios.length} clients : <strong>${avg}%</strong>.`,
        worst.conv < 30 ? `💡 <strong>${worst.name}</strong> à analyser : taux bas malgré ${worst.decided} projets décidés.` : '',
      ].filter(Boolean).join(' &nbsp;·&nbsp; ');
    },

    /* ── TAUX DE CONVERSION PAR CLIENT ── */
    'chart-win-rate-client': (data) => {
      return _ANALYZERS['chart-win-rate'](data);
    },

    /* ── OBTENUS PAR ZONE ── */
    'chart-obtenu-zone': (data) => {
      const obtenus = data.filter(p => _status(p) === 'obtenu');
      if (!obtenus.length) return '📭 Aucun projet obtenu.';
      const byZone = {};
      const byZoneCount = {};
      obtenus.forEach(p => {
        const z = (p['Zone Géographique'] || 'Non défini').trim();
        byZone[z]      = (byZone[z]||0)      + _getCA(p,'ca_gagne');
        byZoneCount[z] = (byZoneCount[z]||0) + 1;
      });
      const entries = Object.entries(byZone).sort((a,b)=>b[1]-a[1]);
      const top = entries[0];
      const total = entries.reduce((s,[,v])=>s+v,0);
      const topPct = total > 0 ? Math.round(top[1]/total*100) : 0;
      return [
        `🏆 Zone dominante : <strong>${top[0]}</strong> — ${_fmt(top[1])} (${topPct}%) · ${byZoneCount[top[0]]} projet${_s(byZoneCount[top[0]])}.`,
        `📊 ${entries.length} zone${_s(entries.length)} active${_s(entries.length)}.`,
        entries.length < 3 ? `💡 Opportunité : ${entries.length} zone(s) seulement — potentiel de diversification géographique.` : '',
      ].filter(Boolean).join(' &nbsp;·&nbsp; ');
    },

    /* ── CA PAR ZONE ── */
    'chart-ca-zone': (data) => {
      const byZone = {};
      const wonByZone = {};
      const lostByZone = {};
      data.forEach(p => {
        const z = (p['Zone Géographique']||'Non défini').trim();
        byZone[z]     = (byZone[z]||0)     + _getCA(p,'ca_etudie');
        if (_status(p)==='obtenu') wonByZone[z]  = (wonByZone[z]||0)  + _getCA(p,'ca_gagne');
        if (_status(p)==='perdu')  lostByZone[z] = (lostByZone[z]||0) + _getCA(p,'ca_etudie');
      });
      const entries = Object.entries(byZone).sort((a,b)=>b[1]-a[1]);
      if (!entries.length) return null;
      const top   = entries[0];
      const total = entries.reduce((s,[,v])=>s+v,0);
      const topPct = total > 0 ? Math.round(top[1]/total*100) : 0;
      const topWon = wonByZone[top[0]] || 0;
      return [
        `🌍 Zone à fort CA étudié : <strong>${top[0]}</strong> (${_fmt(top[1])}, ${topPct}%).`,
        topWon > 0 ? `✅ CA gagné dans cette zone : <strong>${_fmt(topWon)}</strong>.` : '',
        topPct > 60 ? `⚠️ Forte concentration géographique (${topPct}%) — risque de dépendance.` : '',
        entries.length >= 2 ? `💡 Zones sous-représentées : ${entries.slice(-Math.min(2,entries.length)).map(([z])=>z).join(', ')}.` : '',
      ].filter(Boolean).join(' &nbsp;·&nbsp; ');
    },

    'chart-ca-zone-v2': (data) => {
      return _ANALYZERS['chart-ca-zone'](data);
    },

    /* ── STATUT PAR ZONE ── */
    'chart-status-zone': (data) => {
      const byZone = {};
      data.forEach(p => {
        const z = (p['Zone Géographique']||'Non défini').trim();
        if (!byZone[z]) byZone[z] = { won:0, lost:0, offer:0 };
        const st = _status(p);
        if (st==='obtenu') byZone[z].won++;
        else if (st==='perdu') byZone[z].lost++;
        else byZone[z].offer++;
      });
      const entries = Object.entries(byZone).map(([z,d]) => {
        const decided = d.won + d.lost;
        return { zone: z, ...d, conv: decided > 0 ? Math.round(d.won/decided*100) : null };
      }).filter(z => z.conv !== null).sort((a,b)=>(b.conv||0)-(a.conv||0));
      if (!entries.length) return null;
      const best  = entries[0];
      const worst = entries[entries.length-1];
      return [
        `🏆 Zone la plus performante : <strong>${best.zone}</strong> (conv. ${best.conv}% · ${best.won} gagné${_s(best.won)}).`,
        worst !== best ? `⚠️ Zone la plus difficile : <strong>${worst.zone}</strong> (conv. ${worst.conv}% · ${worst.lost} perdu${_s(worst.lost)}).` : '',
        `💡 Analyse croisée recommandée : comparer les offres perdues entre <strong>${worst.zone}</strong> et <strong>${best.zone}</strong>.`,
      ].filter(Boolean).join(' &nbsp;·&nbsp; ');
    },

    /* ── TAUX DE CONVERSION PAR ZONE ── */
    'chart-win-rate-zone': (data) => {
      return _ANALYZERS['chart-status-zone'](data);
    },

    /* ── CA PAR STATUT ── */
    'chart-ca-status': (data) => {
      const etudie = data.reduce((s,p)=>s+_getCA(p,'ca_etudie'),0);
      const gagne  = data.filter(p=>_status(p)==='obtenu').reduce((s,p)=>s+_getCA(p,'ca_gagne'),0);
      const perdu  = data.filter(p=>_status(p)==='perdu').reduce((s,p)=>s+_getCA(p,'ca_etudie'),0);
      const pipe   = data.filter(p=>_status(p)==='offre').reduce((s,p)=>s+_getCA(p,'ca_etudie'),0);
      const conv   = etudie > 0 ? Math.round(gagne/etudie*100) : 0;
      return [
        `💰 CA sécurisé : <strong>${_fmt(gagne)}</strong> (${Math.round(gagne/etudie*100||0)}% du CA étudié).`,
        `📊 CA perdu : <strong>${_fmt(perdu)}</strong> — Pipeline actif : <strong>${_fmt(pipe)}</strong>.`,
        conv < 20 ? `⚠️ Taux de transformation faible (${conv}%) — actions commerciales recommandées.` : '',
      ].filter(Boolean).join(' &nbsp;·&nbsp; ');
    },

    /* ── CA ÉTUDIÉ VS GAGNÉ ── */
    'chart-ca-compare': (data) => {
      const obtenus = data.filter(p=>_status(p)==='obtenu');
      const offres  = data.filter(p=>_status(p)==='offre');
      const caGagne = obtenus.reduce((s,p)=>s+_getCA(p,'ca_gagne'),0);
      const caPipe  = offres.reduce((s,p)=>s+_getCA(p,'ca_etudie'),0);
      const caEtudie= data.reduce((s,p)=>s+_getCA(p,'ca_etudie'),0);
      const eff     = caEtudie > 0 ? Math.round(caGagne/caEtudie*100) : 0;
      return [
        `✅ CA sécurisé : <strong>${_fmt(caGagne)}</strong> (${obtenus.length} projets obtenus).`,
        `🔮 Pipeline actif : <strong>${_fmt(caPipe)}</strong> (${offres.length} offres en cours).`,
        `📐 Efficacité de transformation : <strong>${eff}%</strong> du CA étudié converti.`,
        caGagne > 0 && caPipe > 0 ? `📊 Ratio pipeline/sécurisé : ${(caPipe/caGagne).toFixed(1)}x.` : '',
      ].filter(Boolean).join(' &nbsp;·&nbsp; ');
    },

    /* ── PUISSANCE PAR ZONE ── */
    'chart-machines-zone': (data) => {
      const byZone = {};
      const wonByZone = {};
      data.forEach(p => {
        const z = (p['Zone Géographique']||'Non défini').trim();
        const mw = parseFloat(p['Puissance (MWc)']) || 0;
        if (mw > 0) {
          byZone[z] = (byZone[z]||0) + mw;
          if (_status(p)==='obtenu') wonByZone[z] = (wonByZone[z]||0) + mw;
        }
      });
      const entries = Object.entries(byZone).sort((a,b)=>b[1]-a[1]);
      if (!entries.length) return null;
      const top = entries[0];
      const total = entries.reduce((s,[,v])=>s+v,0);
      const topWon = wonByZone[top[0]] || 0;
      return [
        `⚡ Zone la plus puissante : <strong>${top[0]}</strong> (${top[1].toFixed(1)} MWc).`,
        topWon > 0 ? `✅ MWc sécurisés dans cette zone : <strong>${topWon.toFixed(1)} MWc</strong>.` : '',
        `📊 Total pipeline : <strong>${total.toFixed(1)} MWc</strong> sur ${entries.length} zone${_s(entries.length)}.`,
      ].filter(Boolean).join(' &nbsp;·&nbsp; ');
    },

    /* ── PUISSANCE PAR STATUT ── */
    'chart-power-status': (data) => {
      const byStatus = { obtenu:0, perdu:0, offre:0 };
      data.forEach(p => {
        const st = _status(p);
        const mw = parseFloat(p['Puissance (MWc)']) || 0;
        if (st in byStatus) byStatus[st] += mw;
      });
      const total = Object.values(byStatus).reduce((a,b)=>a+b,0);
      const secPct = total > 0 ? Math.round(byStatus.obtenu/total*100) : 0;
      return [
        `⚡ MWc sécurisés : <strong>${byStatus.obtenu.toFixed(1)}</strong> (${secPct}% du total).`,
        `📋 MWc en cours : <strong>${byStatus.offre.toFixed(1)}</strong> — Perdu : ${byStatus.perdu.toFixed(1)}.`,
        `📊 Puissance totale analysée : <strong>${total.toFixed(1)} MWc</strong>.`,
      ].join(' &nbsp;·&nbsp; ');
    },

    /* ── TYPES D'OFFRES ── */
    'chart-offer-type': (data) => {
      const byType = {};
      data.forEach(p => {
        const t = (p['Type de projet (Activité)'] || p['Type'] || 'Non défini').trim();
        if (!byType[t]) byType[t] = { total:0, won:0, ca:0 };
        byType[t].total++;
        if (_status(p)==='obtenu') { byType[t].won++; byType[t].ca += _getCA(p,'ca_gagne'); }
      });
      const entries = Object.entries(byType).sort((a,b)=>b[1].total-a[1].total);
      if (!entries.length) return null;
      const top  = entries[0];
      const best = entries.sort((a,b)=> {
        const ca = (b[1].ca/Math.max(b[1].won,1)) - (a[1].ca/Math.max(a[1].won,1));
        return ca;
      })[0];
      return [
        `🎯 Type dominant : <strong>${top[0]}</strong> (${top[1].total} projets, ${Math.round(top[1].total/data.length*100)}%).`,
        `📊 ${entries.length} type${_s(entries.length)} d'activité — portefeuille ${entries.length>=4?'diversifié':'concentré'}.`,
        best && best[1].ca > 0 ? `💰 Type le plus rentable : <strong>${best[0]}</strong> (CA moy. ${_fmt(best[1].ca/Math.max(best[1].won,1))}/dossier).` : '',
      ].filter(Boolean).join(' &nbsp;·&nbsp; ');
    },

    /* ── TAUX DE CONVERSION PAR TYPE ── */
    'chart-conv-par-type': (data) => {
      const byType = {};
      data.forEach(p => {
        const t = (p['Type de projet (Activité)']||p['Type']||'N/D').trim();
        if (!byType[t]) byType[t] = { won:0, lost:0, ca:0 };
        if (_status(p)==='obtenu') { byType[t].won++; byType[t].ca += _getCA(p,'ca_gagne'); }
        if (_status(p)==='perdu')    byType[t].lost++;
      });
      const entries = Object.entries(byType)
        .map(([t,d]) => ({ type:t, ...d, decided:d.won+d.lost, conv: d.won+d.lost>0?Math.round(d.won/(d.won+d.lost)*100):null }))
        .filter(e=>e.conv!==null && e.decided>=2)
        .sort((a,b)=>(b.conv||0)-(a.conv||0));
      if (!entries.length) return null;
      const best  = entries[0];
      const worst = entries[entries.length-1];
      return [
        `🏆 Type le plus convertissant : <strong>${best.type}</strong> (${best.conv}% · ${best.won}/${best.decided}).`,
        worst!==best ? `⚠️ Type le moins performant : <strong>${worst.type}</strong> (${worst.conv}% · ${worst.won}/${worst.decided}).` : '',
        `💡 Prioriser les offres de type <strong>${best.type}</strong> — meilleur ROI commercial.`,
      ].filter(Boolean).join(' &nbsp;·&nbsp; ');
    },

    'chart-type-perf': (data) => {
      return _ANALYZERS['chart-conv-par-type'](data);
    },

    /* ── RÉPARTITION STATUTS MÉTIER ── */
    'chart-statuts-reels': (data) => {
      const counts = {};
      data.forEach(p => {
        const st = p['Statut'] || 'Inconnu';
        counts[st] = (counts[st]||0) + 1;
      });
      const entries = Object.entries(counts).sort((a,b)=>b[1]-a[1]);
      const top = entries[0];
      const nonChiffre = counts['Non Chiffré'] || 0;
      const ncPct = data.length > 0 ? Math.round(nonChiffre/data.length*100) : 0;
      return [
        `📊 Statut dominant : <strong>${top[0]}</strong> (${top[1]} projets, ${Math.round(top[1]/data.length*100)}%).`,
        ncPct > 20 ? `⚠️ ${ncPct}% de projets Non Chiffrés — qualifier ces dossiers pour améliorer la vision pipeline.` : '',
        `🧭 ${entries.length} statuts distincts dans le périmètre.`,
      ].filter(Boolean).join(' &nbsp;·&nbsp; ');
    },

    /* ── FUNNEL COMMERCIAL ── */
    'chart-funnel': (data) => {
      const total   = data.length;
      const offres  = data.filter(p=>['offre','en étude','remis'].some(s=>_status(p).includes(s) || (p['Statut']||'').toLowerCase().includes(s))).length;
      const decided = data.filter(p=>['obtenu','perdu'].includes(_status(p))).length;
      const obtenus = data.filter(p=>_status(p)==='obtenu').length;
      const t1 = total   > 0 ? Math.round(decided/total*100) : 0;
      const t2 = decided > 0 ? Math.round(obtenus/decided*100) : 0;
      return [
        `🔽 Total → Décidés : <strong>${t1}%</strong> des dossiers ont reçu une décision.`,
        `🎯 Décidés → Obtenus : <strong>${t2}%</strong> — taux de conversion final.`,
        t1 < 50 ? `💡 Beaucoup de dossiers non décidés (${100-t1}%) — accélérer les relances.` : '',
      ].filter(Boolean).join(' &nbsp;·&nbsp; ');
    },

    'chart-funnel-ca': (data) => {
      return _ANALYZERS['chart-funnel'](data);
    },

    /* ── PIPELINE PAR TEMPÉRATURE ── */
    'chart-pipeline-stage': (data) => {
      const offres = data.filter(p=>_status(p)==='offre');
      if (!offres.length) return '📭 Aucune offre en cours dans ce périmètre.';
      let chaud=0, tiede=0, froid=0, caChaud=0;
      offres.forEach(p => {
        const proba = parseFloat(p['Win proba']) || 0;
        const ca = _getCA(p,'ca_etudie');
        if (proba>70) { chaud++; caChaud+=ca; }
        else if (proba>=30) tiede++;
        else froid++;
      });
      return [
        `🔥 Offres chaudes (&gt;70%) : <strong>${chaud}</strong> pour <strong>${_fmt(caChaud)}</strong> — à convertir en priorité.`,
        `🟡 Tièdes (30–70%) : <strong>${tiede}</strong> — entretenir la relation.`,
        froid > 0 ? `🧊 Froides (&lt;30%) : <strong>${froid}</strong> — à relancer ou disqualifier.` : '',
        `💡 Pipeline total : <strong>${offres.length}</strong> offres actives.`,
      ].filter(Boolean).join(' &nbsp;·&nbsp; ');
    },

    /* ── PIPELINE PONDÉRÉ TOP OPPORTUNITÉS ── */
    'chart-pipeline-weighted': (data) => {
      const offres = data.filter(p=>_status(p)==='offre');
      if (!offres.length) return '📭 Aucune offre en cours.';
      const weighted = offres.map(p => {
        const proba = parseFloat(p['Win proba']) || 0;
        const ca    = _getCA(p,'ca_etudie');
        return { name: p['Nom Projet']||p['Projet']||'—', client: p['Client']||'', wca: ca*(proba/100), ca };
      }).sort((a,b)=>b.wca-a.wca);
      const totalWCA = weighted.reduce((s,p)=>s+p.wca,0);
      const top1 = weighted[0];
      return [
        `💼 CA pipeline pondéré total : <strong>${_fmt(totalWCA)}</strong>.`,
        top1 ? `🏆 Top opportunité : <strong>${top1.client||top1.name}</strong> — ${_fmt(top1.wca)} pondéré (${_fmt(top1.ca)} brut).` : '',
        `💡 Les offres pondérées &gt; ${_fmt(totalWCA*0.1)} sont à suivre prioritairement.`,
      ].filter(Boolean).join(' &nbsp;·&nbsp; ');
    },

    /* ── PIPELINE MENSUEL ── */
    'chart-pipeline-mensuel': (data) => {
      const offres = data.filter(p=>_status(p)==='offre');
      const ca = offres.reduce((s,p)=>s+_getCA(p,'ca_etudie'),0);
      const gained = data.filter(p=>_status(p)==='obtenu').reduce((s,p)=>s+_getCA(p,'ca_gagne'),0);
      return [
        `🔮 Pipeline actif : <strong>${_fmt(ca)}</strong> sur ${offres.length} offres en cours.`,
        `📊 Ratio pipeline/sécurisé : <strong>${gained > 0 ? (ca/gained).toFixed(1) : '—'}x</strong>.`,
        `💡 Pipeline sain si ratio > 2x.`,
      ].join(' &nbsp;·&nbsp; ');
    },

    /* ── DISTRIBUTION DES MONTANTS ── */
    'chart-ca-histogram': (data) => {
      const cas = data.map(p=>_getCA(p,'ca_etudie')).filter(v=>v>0);
      if (!cas.length) return null;
      const mean   = cas.reduce((a,b)=>a+b,0)/cas.length;
      const median = [...cas].sort((a,b)=>a-b)[Math.floor(cas.length/2)];
      const max    = Math.max(...cas);
      const won    = data.filter(p=>_status(p)==='obtenu');
      const avgWon = won.length ? won.reduce((s,p)=>s+_getCA(p,'ca_gagne'),0)/won.length : 0;
      return [
        `📊 Moyenne : <strong>${_fmt(mean)}</strong> · Médiane : <strong>${_fmt(median)}</strong>.`,
        `🔝 Plus grande offre : <strong>${_fmt(max)}</strong>.`,
        avgWon > 0 ? `✅ CA moyen des projets gagnés : <strong>${_fmt(avgWon)}</strong>.` : '',
        mean > median*1.5 ? `⚠️ Distribution asymétrique — quelques très gros dossiers tirent la moyenne vers le haut.` : '',
      ].filter(Boolean).join(' &nbsp;·&nbsp; ');
    },

    'chart-budget-distribution': (data) => {
      return _ANALYZERS['chart-ca-histogram'](data);
    },

    /* ── SCATTER PUISSANCE VS CA ── */
    'chart-scatter-power-ca': (data) => {
      const pts = data.filter(p=>parseFloat(p['Puissance (MWc)'])>0 && _getCA(p,'ca_etudie')>0);
      if (pts.length < 3) return null;
      const ratios = pts.map(p => ({
        name: (p['Client']||'').trim(),
        ratio: _getCA(p,'ca_etudie') / parseFloat(p['Puissance (MWc)']),
        ca: _getCA(p,'ca_etudie'),
        mw: parseFloat(p['Puissance (MWc)'])
      })).sort((a,b)=>b.ratio-a.ratio);
      const top = ratios[0];
      const avgRatio = ratios.reduce((s,r)=>s+r.ratio,0)/ratios.length;
      return [
        `📐 Meilleur ratio CA/MW : <strong>${top.name||'—'}</strong> (${_fmt(top.ca)} pour ${top.mw.toFixed(1)} MW = ${_fmt(top.ratio)}/MW).`,
        `📊 Ratio moyen : <strong>${_fmt(avgRatio)}</strong>/MW sur ${pts.length} projets.`,
        `💡 Les projets en haut à droite combinent forte puissance ET fort CA — prioriser ces profils.`,
      ].join(' &nbsp;·&nbsp; ');
    },

    /* ── SCATTER WIN RATE VS CA ── */
    'chart-scatter-conv-ca': (data) => {
      const ratios = _clientRatioTable(data, 15).filter(r=>r.decided>=2);
      if (!ratios.length) return null;
      const stars  = ratios.filter(r=>(r.conv||0)>=50 && r.caWon > 0).sort((a,b)=>b.caWon-a.caWon);
      const toWork = ratios.filter(r=>(r.conv||0)<30  && r.caWon > 0);
      return [
        stars.length  ? `⭐ <strong>Stars</strong> (conv. ≥ 50% + CA élevé) : ${stars.slice(0,2).map(r=>`${r.name} ${r.conv}%`).join(' · ')}.` : '',
        toWork.length ? `🔧 <strong>À travailler</strong> (conv. &lt; 30%) : ${toWork.slice(0,2).map(r=>`${r.name} ${r.conv}%`).join(' · ')}.` : '',
        `💡 Quadrant idéal = fort CA gagné + fort taux. Investir sur les Stars, analyser les blocages des autres.`,
      ].filter(Boolean).join(' &nbsp;·&nbsp; ');
    },

    /* ── DÉLAI DE DÉCISION PAR STATUT ── */
    'chart-delay-status': (data) => {
      const calcDelais = (subset) => {
        const delays = subset.map(p => {
          const d1 = (typeof ProjectUtils!=='undefined'&&ProjectUtils.parseDate) ? ProjectUtils.parseDate(p['Date réception']) : new Date(p['Date réception']);
          const d2 = (typeof ProjectUtils!=='undefined'&&ProjectUtils.parseDate) ? ProjectUtils.parseDate(p['Date de retour demandée']) : new Date(p['Date de retour demandée']);
          if (!d1||!d2||isNaN(d1)||isNaN(d2)) return null;
          return Math.round(Math.abs(d2-d1)/(1000*60*60*24));
        }).filter(v=>v!==null&&v>0);
        return delays.length ? Math.round(delays.reduce((a,b)=>a+b,0)/delays.length) : null;
      };
      const won  = calcDelais(data.filter(p=>_status(p)==='obtenu'));
      const lost = calcDelais(data.filter(p=>_status(p)==='perdu'));
      return [
        won  !== null ? `✅ Délai moyen projets gagnés : <strong>${won} j</strong>.` : '',
        lost !== null ? `❌ Délai moyen projets perdus : <strong>${lost} j</strong>.` : '',
        won && lost && lost > won
          ? `💡 Les projets perdus ont un délai plus long (${lost-won} j de plus) — les décisions tardives favorisent la concurrence.`
          : won && lost && won > lost
          ? `✅ Cycles courts sur les projets gagnés — bonne réactivité.` : '',
      ].filter(Boolean).join(' &nbsp;·&nbsp; ');
    },

    'chart-cycle-time': (data) => {
      return _ANALYZERS['chart-delay-status'](data);
    },

    /* ── CA CUMULÉ ── */
    'chart-ca-cumule': (data) => {
      const won    = data.filter(p=>_status(p)==='obtenu');
      const total  = won.reduce((s,p)=>s+_getCA(p,'ca_gagne'),0);
      const byMonth = {};
      won.forEach(p => {
        const raw = p['Date réception'];
        if (!raw) return;
        const d = (typeof ProjectUtils!=='undefined'&&ProjectUtils.parseDate)?ProjectUtils.parseDate(raw):new Date(raw);
        if (!d||isNaN(d)) return;
        const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
        byMonth[key] = (byMonth[key]||0) + _getCA(p,'ca_gagne');
      });
      const months = Object.keys(byMonth).sort();
      const lastMonth = months[months.length-1];
      const lastVal   = byMonth[lastMonth];
      const avgMonthly = months.length > 0 ? total/months.length : 0;
      return [
        `💰 CA gagné cumulé : <strong>${_fmt(total)}</strong> sur ${won.length} projets.`,
        lastMonth ? `📅 Dernier mois renseigné : <strong>${lastMonth}</strong> (+${_fmt(lastVal)}).` : '',
        avgMonthly > 0 ? `📊 Rythme moyen : <strong>${_fmt(avgMonthly)}</strong>/mois.` : '',
      ].filter(Boolean).join(' &nbsp;·&nbsp; ');
    },

    /* ── CA PAR MOIS ── */
    'chart-ca-by-month': (data) => {
      return _ANALYZERS['chart-monthly'](data);
    },

    /* ── TAUX CONVERSION MENSUEL ── */
    'chart-winrate-month': (data) => {
      const byMonth = {};
      data.forEach(p => {
        const raw = p['Date réception'];
        if (!raw) return;
        const d = (typeof ProjectUtils!=='undefined'&&ProjectUtils.parseDate)?ProjectUtils.parseDate(raw):new Date(raw);
        if (!d||isNaN(d)) return;
        const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
        if (!byMonth[key]) byMonth[key]={won:0,lost:0};
        if (_status(p)==='obtenu') byMonth[key].won++;
        if (_status(p)==='perdu')  byMonth[key].lost++;
      });
      const entries = Object.entries(byMonth).map(([m,d])=>({
        month:m, ...d, conv: d.won+d.lost>0?Math.round(d.won/(d.won+d.lost)*100):null
      })).filter(e=>e.conv!==null).sort((a,b)=>b.conv-a.conv);
      if (!entries.length) return null;
      const best  = entries[0];
      const worst = entries[entries.length-1];
      const avg   = Math.round(entries.reduce((s,e)=>s+(e.conv||0),0)/entries.length);
      return [
        `🏆 Meilleur mois : <strong>${best.month}</strong> (${best.conv}%).`,
        `📉 Mois difficile : <strong>${worst.month}</strong> (${worst.conv}%).`,
        `📊 Conversion moyenne : <strong>${avg}%</strong> sur ${entries.length} mois.`,
      ].join(' &nbsp;·&nbsp; ');
    },

    /* ── ÉVOLUTION TAUX CONVERSION ── */
    'chart-conv-trend': (data) => {
      return _ANALYZERS['chart-winrate-month'](data);
    },

    /* ── CA TENDANCE CUMULÉE ── */
    'chart-ca-trend': (data) => {
      const proj = _projectionInsight(data);
      const base = _ANALYZERS['chart-ca-year'](data);
      return [base, proj].filter(Boolean).join('<br>');
    },

    /* ── HEATMAP TEMPORELLE ── */
    'chart-temporal-heatmap': (data) => {
      const byMonth = {};
      data.forEach(p => {
        const raw = p['Date réception'];
        if (!raw) return;
        const d = (typeof ProjectUtils!=='undefined'&&ProjectUtils.parseDate)?ProjectUtils.parseDate(raw):new Date(raw);
        if (!d||isNaN(d)) return;
        const m = d.getMonth();
        byMonth[m] = (byMonth[m]||0)+1;
      });
      const monthNames = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Aoû','Sep','Oct','Nov','Déc'];
      const entries = Object.entries(byMonth).sort((a,b)=>b[1]-a[1]);
      if (!entries.length) return null;
      const peak = entries[0];
      const slow = entries[entries.length-1];
      return [
        `🔥 Mois le plus actif : <strong>${monthNames[Number(peak[0])]}</strong> (${peak[1]} projets).`,
        `🧊 Mois le plus calme : <strong>${monthNames[Number(slow[0])]}</strong> (${slow[1]} projets).`,
        `💡 Anticiper les pics d'activité pour planifier les ressources commerciales.`,
      ].join(' &nbsp;·&nbsp; ');
    },

    /* ── ANALYSE AUTO / BILAN ── */
    'annual-analysis-block': (data) => {
      const proj = _projectionInsight(data);
      return proj || null;
    },

    /* ── BIZ CHARTS (Pilotage métier) ── */
    'biz-chart-perf-month':       (data) => _ANALYZERS['chart-monthly'](data),
    'biz-chart-perf-zone':        (data) => _ANALYZERS['chart-status-zone'](data),
    'biz-chart-perf-client':      (data) => _ANALYZERS['chart-obtenu'](data),
    'biz-chart-perf-type':        (data) => _ANALYZERS['chart-conv-par-type'](data),
    'biz-chart-pipe-zone':        (data) => _ANALYZERS['chart-ca-zone'](data),
    'biz-chart-pipe-client':      (data) => _ANALYZERS['chart-ca-company'](data),
    'biz-chart-pipe-type':        (data) => _ANALYZERS['chart-offer-type'](data),
  };

  /* ──────────────────────────────────────────────────────────────
     ANALYSE GÉNÉRIQUE (fallback contextualisé)
  ────────────────────────────────────────────────────────────── */

  function _defaultAnalysis(chartId, data) {
    const total   = data.length;
    const obtenus = data.filter(p=>_status(p)==='obtenu').length;
    const perdus  = data.filter(p=>_status(p)==='perdu').length;
    const decided = obtenus + perdus;
    const conv    = decided > 0 ? Math.round(obtenus/decided*100) : null;
    const caTotal = data.reduce((s,p)=>s+_getCA(p,'ca_etudie'),0);

    // Texte de base
    const parts = [
      `📁 <strong>${total}</strong> projet${_s(total)} analysé${_s(total)}.`,
      conv !== null ? `🎯 Taux de conversion : <strong>${conv}%</strong> (${obtenus}/${decided}).` : '',
      caTotal > 0   ? `📊 CA total étudié : <strong>${_fmt(caTotal)}</strong>.` : '',
    ];

    // Enrichissement depuis le graphique Chart.js
    const chart = _resolveChart(chartId);
    if (chart && chart.data) {
      const labels   = Array.isArray(chart.data.labels) ? chart.data.labels.filter(v=>v!=null&&String(v).trim()!=='') : [];
      const datasets = (chart.data.datasets||[]).filter(ds=>ds&&Array.isArray(ds.data));
      if (labels.length) {
        parts.push(`🧭 <strong>${labels.length}</strong> catégorie${_s(labels.length)} visible${_s(labels.length)}.`);
      }
      if (datasets.length === 1) {
        const ds = datasets[0];
        let best = null;
        ds.data.forEach((raw, i) => {
          const v = typeof raw==='object'&&raw!==null ? Number(raw.y??raw.x) : Number(raw);
          if (isFinite(v) && (!best||v>best.value)) best = { label: String(labels[i]??`#${i+1}`), value: v };
        });
        if (best) {
          const fv = _formatVal(best.value);
          if (fv) parts.push(`🏆 Point fort : <strong>${best.label}</strong> (${fv}).`);
        }
      } else if (datasets.length > 1) {
        const totals = datasets.map(ds => ({
          label: ds.label||'Série',
          total: ds.data.reduce((s,raw)=>{
            const v = typeof raw==='object'&&raw!==null?Number(raw.y??raw.x):Number(raw);
            return s+(isFinite(v)?v:0);
          },0)
        })).sort((a,b)=>b.total-a.total);
        if (totals[0]) {
          const fv = _formatVal(totals[0].total);
          if (fv) parts.push(`📚 Série dominante : <strong>${totals[0].label}</strong> (${fv}).`);
        }
      }
    }

    return parts.filter(Boolean).join(' &nbsp;·&nbsp; ');
  }

  /* ──────────────────────────────────────────────────────────────
     CSS
  ────────────────────────────────────────────────────────────── */

  function _injectCSS() {
    if (document.getElementById('ca-styles')) return;
    const style = document.createElement('style');
    style.id = 'ca-styles';
    style.textContent = `
      /* ── BLOC ANALYSE ── */
      .chart-analysis-block {
        margin: .4rem .5rem .7rem;
        padding: 0;
        border: 1px solid rgba(0,212,170,.14);
        border-radius: 8px;
        overflow: hidden;
        font-family: 'DM Mono', monospace;
        font-size: .69rem;
        color: #9fb3c8;
        line-height: 1.65;
        animation: caBlockIn .25s ease-out;
        background: rgba(6,12,20,.4);
      }
      .chart-analysis-block strong { color: #dce8f5; font-weight: 700; }
      .chart-analysis-block.ca-updating { opacity: .45; }
      @keyframes caBlockIn { from { opacity:0;transform:translateY(3px); } to { opacity:1;transform:translateY(0); } }

      /* ── EN-TÊTE AVEC TOGGLE ── */
      .ca-block-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: .35rem .75rem;
        border-bottom: 1px solid rgba(0,212,170,.1);
        gap: .5rem;
        background: rgba(0,212,170,.035);
      }
      .ca-block-text {
        flex: 1;
        padding: .45rem .75rem;
      }
      .ca-toggle-btn {
        flex-shrink: 0;
        background: rgba(0,153,255,.12);
        border: 1px solid rgba(0,153,255,.28);
        color: #60a5fa;
        font-family: 'DM Mono', monospace;
        font-size: .6rem;
        padding: .2rem .55rem;
        border-radius: 5px;
        cursor: pointer;
        transition: all .18s;
        white-space: nowrap;
      }
      .ca-toggle-btn:hover { background: rgba(0,153,255,.22); color: #93c5fd; }
      .ca-toggle-btn.is-table { background: rgba(0,212,170,.12); border-color: rgba(0,212,170,.3); color: #34d399; }

      /* ── TABLE ── */
      .ca-table-view { display: none; overflow: auto; max-height: 320px; }
      .ca-table-view.is-visible { display: block; }
      .ca-data-table {
        width: 100%;
        border-collapse: collapse;
        font-family: 'DM Mono', monospace;
        font-size: .65rem;
      }
      .ca-data-table thead th {
        background: rgba(0,212,170,.1);
        color: #9fb3c8;
        padding: .35rem .7rem;
        text-align: left;
        border-bottom: 1px solid rgba(0,212,170,.18);
        font-weight: 600;
        white-space: nowrap;
        position: sticky;
        top: 0;
      }
      .ca-data-table tbody tr:nth-child(even) td { background: rgba(255,255,255,.022); }
      .ca-data-table tbody tr:hover td { background: rgba(0,212,170,.06); }
      .ca-data-table td { padding: .3rem .7rem; border-bottom: 1px solid rgba(255,255,255,.04); }
      .ca-dt-label { color: #c0d0e0; font-weight: 500; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .ca-dt-val { text-align: right; color: #9fb3c8; }

      @media (max-width:600px) {
        .chart-analysis-block { font-size: .62rem; }
        .ca-data-table { font-size: .6rem; }
      }
    `;
    document.head.appendChild(style);
  }

  /* ──────────────────────────────────────────────────────────────
     BLOC ANALYSIS — création / toggle
  ────────────────────────────────────────────────────────────── */

  function _getOrCreateBlock(chartId) {
    const blockId = `ca-block-${chartId}`;
    let block = document.getElementById(blockId);
    if (!block) {
      const canvas = document.getElementById(chartId);
      if (!canvas) return null;

      block = document.createElement('div');
      block.id    = blockId;
      block.className = 'chart-analysis-block';

      // Structure interne
      block.innerHTML = `
        <div class="ca-block-header">
          <span class="ca-block-kicker" style="font-size:.58rem;text-transform:uppercase;letter-spacing:.08em;color:rgba(0,212,170,.7);">Analyse</span>
          <button class="ca-toggle-btn" title="Basculer entre graphique et tableau synthétique">📊 Tableau</button>
        </div>
        <div class="ca-block-text"></div>
        <div class="ca-table-view"></div>
      `;

      const container = canvas.closest('.chart-container') || canvas.parentElement;
      if (container && container.parentElement) {
        container.parentElement.insertBefore(block, container.nextSibling);
      }

      // Toggle logique
      const btn       = block.querySelector('.ca-toggle-btn');
      const tableView = block.querySelector('.ca-table-view');

      btn.addEventListener('click', () => {
        const isTableNow = tableView.classList.toggle('is-visible');
        btn.textContent = isTableNow ? '📈 Graphique' : '📊 Tableau';
        btn.classList.toggle('is-table', isTableNow);

        if (isTableNow && !tableView.dataset.built) {
          const tbl = _buildTableFromChart(chartId);
          tableView.innerHTML = tbl || '<div style="padding:.6rem .9rem;color:#6b7d8f;font-size:.68rem;">Données non disponibles pour ce graphique.</div>';
          tableView.dataset.built = '1';
        }

        // Montrer/cacher le canvas
        const c = document.getElementById(chartId);
        if (c) c.style.display = isTableNow ? 'none' : '';
      });
    }
    return block;
  }

  /* ──────────────────────────────────────────────────────────────
     RENDER PUBLIC API
  ────────────────────────────────────────────────────────────── */

  function renderForChart(chartId, data) {
    const block = _getOrCreateBlock(chartId);
    if (!block) return;

    block.classList.add('ca-updating');

    const analyzer = _ANALYZERS[chartId];
    let text;
    try {
      text = analyzer ? analyzer(data) : _defaultAnalysis(chartId, data);
    } catch (e) {
      console.warn('[ChartAnalysis] Erreur pour', chartId, e);
      text = _defaultAnalysis(chartId, data);
    }

    const textEl = block.querySelector('.ca-block-text');
    if (textEl) {
      if (!text) {
        block.style.display = 'none';
      } else {
        textEl.innerHTML = text;
        block.style.display = '';
      }
    }

    // Invalider le tableau en cache si les données ont changé
    const tableView = block.querySelector('.ca-table-view');
    if (tableView) {
      tableView.dataset.built = '';
      if (tableView.classList.contains('is-visible')) {
        const tbl = _buildTableFromChart(chartId);
        tableView.innerHTML = tbl || '<div style="padding:.6rem .9rem;color:#6b7d8f;font-size:.68rem;">Données non disponibles.</div>';
        tableView.dataset.built = '1';
      }
    }

    block.classList.remove('ca-updating');
  }

  function renderAll(data) {
    if (!data) {
      data = typeof DataFilterEngine !== 'undefined' && DataFilterEngine.getFilteredData
        ? DataFilterEngine.getFilteredData()
        : (window.DATA || []);
    }
    const chartIds = new Set([
      ...Object.keys(_ANALYZERS),
      ...Array.from(document.querySelectorAll('canvas[id]')).map(c => c.id),
    ]);
    chartIds.forEach(id => renderForChart(id, data));
  }

  function getAnalysisText(chartId, data) {
    const analyzer = _ANALYZERS[chartId];
    let text;
    try {
      text = analyzer ? analyzer(data) : _defaultAnalysis(chartId, data);
    } catch (e) { text = _defaultAnalysis(chartId, data); }
    if (!text) return '';
    return text
      .replace(/<strong>/g,'').replace(/<\/strong>/g,'')
      .replace(/<br>/g,' | ')
      .replace(/&nbsp;·&nbsp;/g,' • ')
      .replace(/<[^>]+>/g,'');
  }

  /* ──────────────────────────────────────────────────────────────
     INIT
  ────────────────────────────────────────────────────────────── */

  function init() {
    _injectCSS();

    if (typeof AE !== 'undefined' && AE.subscribe) {
      AE.subscribe(() => {
        const d = typeof AE.getFiltered==='function' ? AE.getFiltered() : (window.DATA||[]);
        renderAll(d);
      });
    }
    if (typeof FilterManager !== 'undefined' && FilterManager.subscribe) {
      FilterManager.subscribe(() => {
        const d = typeof DataFilterEngine!=='undefined' && DataFilterEngine.getFilteredData
          ? DataFilterEngine.getFilteredData() : (window.DATA||[]);
        renderAll(d);
      });
    }

    console.log('%c📊 ChartAnalysis v2.0 — 35+ analyseurs + vue tableau + projection N+1', 'color:#00d4aa;font-weight:700');
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      setTimeout(init, 300);
    }
  }

  return { init, renderForChart, renderAll, getAnalysisText };
})();
} // end guard
