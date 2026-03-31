/**
 * ════════════════════════════════════════════════════════════════
 *  CHART ANALYSIS v1.0 — Explications Dynamiques par Graphique
 * ════════════════════════════════════════════════════════════════
 *
 *  Génère automatiquement un encadré d'analyse contextuelle
 *  sous chaque graphique, basé sur Analytics + filtres actifs.
 *
 *  Contenus :
 *   📈 Tendance           — évolution vs période précédente
 *   🏆 Point fort         — meilleure valeur / leadership
 *   ⚠️  Alerte            — anomalie / concentration / risque
 *   💡 Insight            — conseil actionnable
 *   📊 Variation          — delta % sur la période
 *
 *  Usage :
 *   ChartAnalysis.init()
 *   ChartAnalysis.renderForChart(chartId, data)
 *   ChartAnalysis.renderAll(data)
 *
 *  Intégration PDF :
 *   ChartAnalysis.getAnalysisText(chartId, data) → string (PDF-safe)
 * ════════════════════════════════════════════════════════════════
 */

if (!window.ChartAnalysis) {
window.ChartAnalysis = (() => {
  'use strict';

  /* ── Helpers ─────────────────────────────────────────────────── */
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

  function _resolveChart(chartId) {
    if (typeof Chart === 'undefined') return null;
    const canvas = document.getElementById(chartId);
    if (!canvas) return null;
    try {
      if (typeof Chart.getChart === 'function') {
        return Chart.getChart(canvas) || null;
      }
      if (Chart.instances) {
        return Object.values(Chart.instances).find(inst => inst && inst.canvas === canvas) || null;
      }
    } catch (err) {
      return null;
    }
    return null;
  }

  function _formatGraphValue(value) {
    const num = Number(value);
    if (!isFinite(num)) return null;
    if (Math.abs(num) <= 1) return Math.round(num * 100) + '%';
    if (Math.abs(num) <= 100) return num.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
    return _fmt(num);
  }

  function _graphSummary(chartId) {
    const chart = _resolveChart(chartId);
    if (!chart || !chart.data || !Array.isArray(chart.data.datasets) || !chart.data.datasets.length) return [];

    const labels = Array.isArray(chart.data.labels) ? chart.data.labels : [];
    const datasets = chart.data.datasets.filter(ds => ds && Array.isArray(ds.data));
    if (!datasets.length) return [];

    const chartType = String(chart.config && chart.config.type || 'graphique').toLowerCase();
    const parts = [];
    const uniqueLabels = labels.filter(v => v != null && String(v).trim() !== '');
    if (uniqueLabels.length) {
      parts.push(`🧭 ${uniqueLabels.length} catégorie${uniqueLabels.length > 1 ? 's' : ''} visible${uniqueLabels.length > 1 ? 's' : ''}.`);
    }

    if (datasets.length === 1) {
      const ds = datasets[0];
      let best = null;
      ds.data.forEach((raw, index) => {
        const value = typeof raw === 'object' && raw !== null
          ? Number(raw.y != null ? raw.y : raw.x)
          : Number(raw);
        if (!isFinite(value)) return;
        if (!best || value > best.value) {
          best = {
            label: labels[index] != null ? String(labels[index]) : ('Poste ' + (index + 1)),
            value
          };
        }
      });
      if (best) {
        const formatted = _formatGraphValue(best.value);
        if (formatted) {
          parts.push(`🏆 Point fort du ${chartType} : <strong>${best.label}</strong> (${formatted}).`);
        }
      }
      return parts;
    }

    const totals = datasets.map(ds => ({
      label: ds.label || 'Série',
      total: ds.data.reduce((sum, raw) => {
        const value = typeof raw === 'object' && raw !== null
          ? Number(raw.y != null ? raw.y : raw.x)
          : Number(raw);
        return sum + (isFinite(value) ? value : 0);
      }, 0)
    })).sort((a, b) => b.total - a.total);

    if (totals.length) {
      const topSeries = totals[0];
      const formatted = _formatGraphValue(topSeries.total);
      if (formatted) {
        parts.push(`📚 Série dominante : <strong>${topSeries.label}</strong> (${formatted}).`);
      }
    }
    return parts;
  }

  /* ── Générateurs d'analyse par type de graphique ─────────────── */

  const _ANALYZERS = {

    /** Tendance mensuelle */
    'chart-monthly': (data) => {
      const byMonth = {};
      data.forEach(p => {
        const raw = p['Date réception'];
        if (!raw) return;
        const d = typeof ProjectUtils !== 'undefined' ? ProjectUtils.parseDate(raw) : new Date(raw);
        if (!d) return;
        const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
        byMonth[key] = (byMonth[key] || 0) + _getCA(p, 'ca_etudie');
      });
      const months = Object.keys(byMonth).sort();
      if (months.length < 2) return null;
      const last  = byMonth[months[months.length - 1]];
      const prev  = byMonth[months[months.length - 2]];
      const delta = _pct(last, prev);
      const trend = delta === null ? '' : delta >= 0
        ? `📈 Hausse de <strong>+${delta}%</strong> sur le dernier mois.`
        : `📉 Baisse de <strong>${delta}%</strong> sur le dernier mois.`;
      const peak = months.reduce((a, b) => byMonth[a] > byMonth[b] ? a : b);
      return [
        trend,
        `🏆 Mois record : <strong>${peak}</strong> (${_fmt(byMonth[peak])})`,
        `📊 ${months.length} mois analysés — moyenne ${_fmt(Object.values(byMonth).reduce((a,b)=>a+b,0)/months.length)}/mois`,
      ].filter(Boolean).join(' &nbsp;·&nbsp; ');
    },

    /** Projets perdus par société */
    'chart-perdu': (data) => {
      const perdu = data.filter(p => _status(p) === 'perdu');
      if (!perdu.length) return '✅ Aucun projet perdu dans la sélection actuelle.';
      const byClient = {};
      perdu.forEach(p => {
        const c = (p['Client'] || 'N/A').trim();
        byClient[c] = (byClient[c] || 0) + 1;
      });
      const top = Object.entries(byClient).sort((a,b)=>b[1]-a[1])[0];
      const totalDecided = data.filter(p => ['obtenu','perdu'].includes(_status(p))).length;
      const tauxPerte = totalDecided > 0 ? Math.round(perdu.length / totalDecided * 100) : 0;
      const alerts = tauxPerte > 60
        ? `⚠️ Taux de perte élevé : <strong>${tauxPerte}%</strong> — à surveiller.`
        : `📊 Taux de perte : <strong>${tauxPerte}%</strong>.`;
      return [
        alerts,
        top ? `⚠️ Client avec le plus de pertes : <strong>${top[0]}</strong> (${top[1]} projets perdus).` : '',
        `💡 Analyser les projets de <strong>${top?.[0]}</strong> pour identifier les patterns d'échec.`,
      ].filter(Boolean).join(' &nbsp;·&nbsp; ');
    },

    /** Projets obtenus par société */
    'chart-obtenu': (data) => {
      const obtenus = data.filter(p => _status(p) === 'obtenu');
      if (!obtenus.length) return '📭 Aucun projet obtenu dans la sélection actuelle.';
      const byClient = {};
      obtenus.forEach(p => {
        const c = (p['Client'] || 'N/A').trim();
        byClient[c] = (byClient[c] || 0) + 1;
      });
      const entries = Object.entries(byClient).sort((a,b)=>b[1]-a[1]);
      const top = entries[0];
      const caTotal = obtenus.reduce((s,p) => s + _getCA(p,'ca_gagne'), 0);
      const conc = top ? Math.round(byClient[top[0]] / obtenus.length * 100) : 0;
      const alert = conc > 50
        ? `⚠️ Concentration : <strong>${top[0]}</strong> représente ${conc}% des gains — risque de dépendance.`
        : `🏆 Leader : <strong>${top[0]}</strong> avec ${top[1]} projet${top[1]>1?'s':''} obtenus.`;
      return [
        alert,
        `💰 CA total gagné : <strong>${_fmt(caTotal)}</strong> sur ${obtenus.length} projets.`,
        `📊 ${entries.length} clients différents — diversification ${entries.length >= 5 ? 'bonne' : 'à améliorer'}.`,
      ].join(' &nbsp;·&nbsp; ');
    },

    /** Obtenus par zone */
    'chart-obtenu-zone': (data) => {
      const obtenus = data.filter(p => _status(p) === 'obtenu');
      if (!obtenus.length) return '📭 Aucun projet obtenu.';
      const byZone = {};
      obtenus.forEach(p => {
        const z = (p['Zone Géographique'] || 'Non défini').trim();
        byZone[z] = (byZone[z] || 0) + _getCA(p, 'ca_gagne');
      });
      const top = Object.entries(byZone).sort((a,b)=>b[1]-a[1])[0];
      const zones = Object.keys(byZone).length;
      return [
        `🏆 Zone dominante : <strong>${top[0]}</strong> (${_fmt(top[1])}).`,
        `📊 ${zones} zone${zones>1?'s':''} actives.`,
        zones < 3 ? `💡 Opportunité : seulement ${zones} zone(s) — potentiel de diversification géographique.` : '',
      ].filter(Boolean).join(' &nbsp;·&nbsp; ');
    },

    /** CA par société */
    'chart-ca-company': (data) => {
      const byClient = {};
      data.forEach(p => {
        const c = (p['Client'] || 'N/A').trim();
        byClient[c] = (byClient[c] || 0) + _getCA(p, 'ca_etudie');
      });
      const entries = Object.entries(byClient).sort((a,b)=>b[1]-a[1]);
      if (!entries.length) return null;
      const top = entries[0];
      const totalCA = entries.reduce((s,[,v])=>s+v,0);
      const topPct = totalCA > 0 ? Math.round(top[1]/totalCA*100) : 0;
      const alert = topPct > 40
        ? `⚠️ <strong>${top[0]}</strong> représente ${topPct}% du CA total — risque de concentration.`
        : `🏆 Meilleur client : <strong>${top[0]}</strong> (${_fmt(top[1])}, ${topPct}% du total).`;
      return [
        alert,
        `📊 CA total étudié : <strong>${_fmt(totalCA)}</strong> sur ${entries.length} clients.`,
        `💡 Top 3 : ${entries.slice(0,3).map(([c,v])=>`${c} ${_fmt(v)}`).join(' · ')}.`,
      ].join(' &nbsp;·&nbsp; ');
    },

    /** CA par statut */
    'chart-ca-status': (data) => {
      const etudie = data.reduce((s,p)=>s+_getCA(p,'ca_etudie'),0);
      const gagne  = data.filter(p=>_status(p)==='obtenu').reduce((s,p)=>s+_getCA(p,'ca_gagne'),0);
      const perdu  = data.filter(p=>_status(p)==='perdu').reduce((s,p)=>s+_getCA(p,'ca_etudie'),0);
      const conv   = etudie > 0 ? Math.round(gagne/etudie*100) : 0;
      return [
        `💰 CA gagné : <strong>${_fmt(gagne)}</strong> (${conv}% du CA étudié).`,
        `📊 CA perdu : <strong>${_fmt(perdu)}</strong> — ${_fmt(etudie - gagne - perdu)} en pipeline.`,
        conv < 20 ? `⚠️ Taux de conversion faible (<strong>${conv}%</strong>) — actions commerciales recommandées.` : '',
      ].filter(Boolean).join(' &nbsp;·&nbsp; ');
    },

    /** Machines par zone */
    'chart-machines-zone': (data) => {
      const byZone = {};
      data.forEach(p => {
        const z = (p['Zone Géographique'] || 'Non défini').trim();
        const mw = parseFloat(p['Puissance (MWc)']) || 0;
        if (mw > 0) byZone[z] = (byZone[z] || 0) + mw;
      });
      const entries = Object.entries(byZone).sort((a,b)=>b[1]-a[1]);
      if (!entries.length) return null;
      const top = entries[0];
      const total = entries.reduce((s,[,v])=>s+v,0);
      return [
        `⚡ Zone la plus puissante : <strong>${top[0]}</strong> (${top[1].toFixed(1)} MWc).`,
        `📊 Total pipeline : <strong>${total.toFixed(1)} MWc</strong> sur ${entries.length} zones.`,
      ].join(' &nbsp;·&nbsp; ');
    },

    /** Projets par type d'offre */
    'chart-offer-type': (data) => {
      const byType = {};
      data.forEach(p => {
        const t = p['Type de projet (Activité)'] || 'Non défini';
        byType[t] = (byType[t] || 0) + 1;
      });
      const entries = Object.entries(byType).sort((a,b)=>b[1]-a[1]);
      if (!entries.length) return null;
      const top = entries[0];
      const total = data.length;
      return [
        `🎯 Type dominant : <strong>${top[0]}</strong> (${top[1]} projets, ${Math.round(top[1]/total*100)}%).`,
        `📊 ${entries.length} type${entries.length>1?'s':''} d'activité — portefeuille ${entries.length>=4?'diversifié':'concentré'}.`,
      ].join(' &nbsp;·&nbsp; ');
    },

    /** CA par zone */
    'chart-ca-zone': (data) => {
      const byZone = {};
      data.forEach(p => {
        const z = (p['Zone Géographique'] || 'Non défini').trim();
        byZone[z] = (byZone[z] || 0) + _getCA(p, 'ca_etudie');
      });
      const entries = Object.entries(byZone).sort((a,b)=>b[1]-a[1]);
      if (!entries.length) return null;
      const top = entries[0];
      const total = entries.reduce((s,[,v])=>s+v,0);
      const topPct = total > 0 ? Math.round(top[1]/total*100) : 0;
      return [
        `🌍 Zone à plus fort CA : <strong>${top[0]}</strong> (${_fmt(top[1])}, ${topPct}%).`,
        topPct > 60 ? `⚠️ Forte concentration géographique (${topPct}%) — risque de dépendance.` : '',
        `💡 Zones sous-représentées : ${entries.slice(-2).map(([z])=>z).join(', ')}.`,
      ].filter(Boolean).join(' &nbsp;·&nbsp; ');
    },

    /** CA par client compare */
    'chart-ca-compare': (data) => {
      const obtenus = data.filter(p=>_status(p)==='obtenu');
      const offres  = data.filter(p=>_status(p)==='offre');
      const caGagne = obtenus.reduce((s,p)=>s+_getCA(p,'ca_gagne'),0);
      const caPipe  = offres.reduce((s,p)=>s+_getCA(p,'pipeline'),0);
      return [
        `✅ CA sécurisé : <strong>${_fmt(caGagne)}</strong> (${obtenus.length} projets obtenus).`,
        `🔮 Pipeline actif : <strong>${_fmt(caPipe)}</strong> (${offres.length} offres en cours).`,
        caGagne > 0 && caPipe > 0
          ? `📊 Ratio pipeline/gagné : ${(caPipe/caGagne*100).toFixed(0)}%.`
          : '',
      ].filter(Boolean).join(' &nbsp;·&nbsp; ');
    },

    /** CA client (chart-ca-client) */
    'chart-ca-client': (data) => {
      const byClient = {};
      data.filter(p=>_status(p)==='obtenu').forEach(p => {
        const c = (p['Client'] || '').trim();
        if (!c) return;
        byClient[c] = (byClient[c] || 0) + _getCA(p, 'ca_gagne');
      });
      const entries = Object.entries(byClient).sort((a,b)=>b[1]-a[1]);
      if (!entries.length) return '📭 Aucun projet gagné pour les clients.';
      const top = entries[0];
      const total = entries.reduce((s,[,v])=>s+v,0);
      return [
        `🏆 Meilleur client (CA gagné) : <strong>${top[0]}</strong> (${_fmt(top[1])}).`,
        `📊 CA total gagné : <strong>${_fmt(total)}</strong> sur ${entries.length} clients.`,
      ].join(' &nbsp;·&nbsp; ');
    },

  };

  /* ── Analyse générique fallback ──────────────────────────────── */
  function _defaultAnalysis(chartId, data) {
    const total   = data.length;
    const obtenus = data.filter(p => _status(p) === 'obtenu').length;
    const perdus  = data.filter(p => _status(p) === 'perdu').length;
    const decided = obtenus + perdus;
    const conv    = decided > 0 ? Math.round(obtenus / decided * 100) : null;
    const caTotal = data.reduce((s,p)=>s+_getCA(p,'ca_etudie'),0);
    const graphParts = _graphSummary(chartId);

    return [
      `📁 ${total} projets analysés.`,
      conv !== null ? `🎯 Taux de conversion : <strong>${conv}%</strong> (${obtenus}/${decided}).` : '',
      caTotal > 0 ? `📊 CA total étudié : <strong>${_fmt(caTotal)}</strong>.` : '',
      ...graphParts
    ].filter(Boolean).join(' &nbsp;·&nbsp; ');
  }

  /* ── Rendu d'un bloc d'analyse sous un graphique ─────────────── */
  function _getOrCreateBlock(chartId) {
    const blockId = `ca-block-${chartId}`;
    let block = document.getElementById(blockId);
    if (!block) {
      const canvas = document.getElementById(chartId);
      if (!canvas) return null;

      block = document.createElement('div');
      block.id = blockId;
      block.className = 'chart-analysis-block';

      // Insérer après le canvas ou son conteneur chart-container
      const container = canvas.closest('.chart-container') || canvas.parentElement;
      if (container && container.parentElement) {
        container.parentElement.insertBefore(block, container.nextSibling);
      }
    }
    return block;
  }

  /* ── Injecter le CSS ─────────────────────────────────────────── */
  function _injectCSS() {
    if (document.getElementById('ca-styles')) return;
    const style = document.createElement('style');
    style.id = 'ca-styles';
    style.textContent = `
      .chart-analysis-block {
        margin: .5rem .6rem .8rem;
        padding: .55rem .85rem;
        background: rgba(0,212,170,.04);
        border: 1px solid rgba(0,212,170,.12);
        border-left: 3px solid rgba(0,212,170,.5);
        border-radius: 0 8px 8px 0;
        font-family: 'DM Mono', monospace;
        font-size: .69rem;
        color: #9fb3c8;
        line-height: 1.65;
        animation: caBlockIn .3s ease-out;
        transition: opacity .2s;
      }
      .chart-analysis-block strong {
        color: #dce8f5;
        font-weight: 700;
      }
      .chart-analysis-block.ca-updating {
        opacity: 0.5;
      }
      @keyframes caBlockIn {
        from { opacity: 0; transform: translateY(4px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      @media (max-width: 600px) {
        .chart-analysis-block { font-size: .65rem; padding: .45rem .65rem; }
      }
    `;
    document.head.appendChild(style);
  }

  /* ── API publique : renderForChart ───────────────────────────── */
  function renderForChart(chartId, data) {
    const block = _getOrCreateBlock(chartId);
    if (!block) return;

    // Marquer comme en cours de mise à jour
    block.classList.add('ca-updating');

    // Calculer l'analyse
    const analyzer = _ANALYZERS[chartId];
    let text;
    try {
      text = analyzer ? analyzer(data) : _defaultAnalysis(chartId, data);
    } catch (e) {
      console.warn('[ChartAnalysis] Erreur pour', chartId, e);
      text = _defaultAnalysis(chartId, data);
    }

    if (!text) {
      block.style.display = 'none';
    } else {
      block.innerHTML = text;
      block.style.display = '';
    }

    block.classList.remove('ca-updating');
  }

  /* ── API publique : renderAll ─────────────────────────────────── */
  function renderAll(data) {
    if (!data) {
      data = typeof DataFilterEngine !== 'undefined' && DataFilterEngine.getFilteredData
        ? DataFilterEngine.getFilteredData()
        : (window.DATA || []);
    }

    // Rendre pour tous les graphiques connus + tous les canvas présents
    const chartIds = new Set([
      ...Object.keys(_ANALYZERS),
      ...Array.from(document.querySelectorAll('canvas[id]')).map(c => c.id),
    ]);

    chartIds.forEach(id => renderForChart(id, data));
  }

  /* ── Texte PDF-safe (sans HTML) ───────────────────────────────── */
  function getAnalysisText(chartId, data) {
    const analyzer = _ANALYZERS[chartId];
    let text;
    try {
      text = analyzer ? analyzer(data) : _defaultAnalysis(chartId, data);
    } catch (e) {
      text = _defaultAnalysis(chartId, data);
    }
    if (!text) return '';
    // Supprimer les balises HTML
    return text.replace(/<strong>/g,'').replace(/<\/strong>/g,'').replace(/&nbsp;·&nbsp;/g,' • ');
  }

  /* ── Init ────────────────────────────────────────────────────── */
  function init() {
    _injectCSS();

    // S'abonner aux changements de filtres
    if (typeof AE !== 'undefined' && AE.subscribe) {
      AE.subscribe(() => {
        const data = typeof AE.getFiltered === 'function' ? AE.getFiltered() : (window.DATA||[]);
        renderAll(data);
      });
    }
    if (typeof FilterManager !== 'undefined' && FilterManager.subscribe) {
      FilterManager.subscribe(() => {
        const data = typeof DataFilterEngine !== 'undefined' && DataFilterEngine.getFilteredData
          ? DataFilterEngine.getFilteredData()
          : (window.DATA||[]);
        renderAll(data);
      });
    }

    console.log('%c📊 ChartAnalysis v1.0 — Explications dynamiques activées', 'color:#0099ff;font-weight:700');
  }

  // Auto-init après DOMContentLoaded
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
