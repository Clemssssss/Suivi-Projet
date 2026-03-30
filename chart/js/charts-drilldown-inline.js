if (!window.ChartDrillDown) {
  window.ChartDrillDown = (() => {
  'use strict';

  let _currentPanel    = null;
  let _currentChartId  = null;

  /* ── Registre des filterFn custom (branché par DRILL_MAP plus bas) ── */
  const _customFilters = {};
  function registerFilter(chartId, fn) {
    if (typeof fn === 'function') _customFilters[chartId] = fn;
  }

  /* ── Helpers ─────────────────────────────────────────────────── */
  const MOIS_FR = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];

  function _status(p) {
    return (typeof ProjectUtils !== 'undefined' && ProjectUtils.getStatus)
      ? ProjectUtils.getStatus(p)
      : (p['Statut'] || 'autre').toLowerCase();
  }

  function _anneeOf(p) {
    if (p._annee != null && String(p._annee).trim() !== '') return String(p._annee);
    const raw = p['Date réception'];
    if (!raw || raw === 'x' || raw === 'X') return null;
    if (typeof ProjectUtils !== 'undefined' && ProjectUtils.parseDate) {
      const d = ProjectUtils.parseDate(raw);
      if (d && !isNaN(d.getTime())) return String(d.getFullYear());
    }
    const pts = String(raw).split('/');
    if (pts.length === 3) {
      let y = parseInt(pts[2], 10);
      if (y > 0 && y < 100) y += 2000;
      return y > 1900 ? String(y) : null;
    }
    return null;
  }

  /* ── Filtre principal : supporte TOUS les filterTypes ────────── */
  function _matchProject(p, filterType, label, chartId) {
    // Priorité 1 : filterFn custom enregistrée par DRILL_MAP
    if (chartId && _customFilters[chartId]) {
      return _customFilters[chartId](p, label);
    }

    switch (filterType) {
      case 'Statut':
      case 'status': {
        const st  = _status(p);
        const lc  = String(label).toLowerCase().trim();
        const MAP = { 'obtenu':'obtenu','gagné':'obtenu','perdu':'perdu','offre':'offre','en cours':'offre' };
        return st === lc || st === (MAP[lc] || lc);
      }
      case '_annee':
        return _anneeOf(p) === String(label);

      case 'Client':
        return (p['Client'] || '').trim() === String(label).trim();

      case 'Zone Géographique':
        return (p['Zone Géographique'] || '').trim() === String(label).trim();

      case 'Type de projet (Activité)':
        return (p['Type de projet (Activité)'] || '').trim() === String(label).trim();

      case '_mois': {
        const raw = p['Date réception'];
        if (!raw || raw === 'x' || raw === 'X') return false;
        let d;
        if (typeof ProjectUtils !== 'undefined' && ProjectUtils.parseDate) {
          d = ProjectUtils.parseDate(raw);
        } else {
          d = new Date(raw);
        }
        return d && !isNaN(d.getTime()) && MOIS_FR[d.getMonth()] === String(label);
      }

      case '_tranche': {
        const TRANCHES = [
          { l:'< 50k€',    min:0,      max:50e3    },
          { l:'< 100k€',   min:0,      max:100e3   },
          { l:'50–100k€',  min:50e3,   max:100e3   },
          { l:'100-250k€', min:100e3,  max:250e3   },
          { l:'100–250k€', min:100e3,  max:250e3   },
          { l:'250-500k€', min:250e3,  max:500e3   },
          { l:'250–500k€', min:250e3,  max:500e3   },
          { l:'500k-1M€',  min:500e3,  max:1e6     },
          { l:'500k–1M€',  min:500e3,  max:1e6     },
          { l:'1M-5M€',    min:1e6,    max:5e6     },
          { l:'1M–5M€',    min:1e6,    max:5e6     },
          { l:'> 5M€',     min:5e6,    max:Infinity},
        ];
        const bud = parseFloat(String(p['Bud'] || '').replace(/[^0-9.,]/g,'').replace(',','.')) || 0;
        const t = TRANCHES.find(x => x.l === String(label));
        return t ? bud >= t.min && bud < t.max : false;
      }

      case 'annee_facturation': {
        // Projets qui ont du CA facturé pour l'année label
        const yr = String(label);
        const val = p['ca_facture_' + yr];
        return val != null && parseFloat(val) > 0;
      }

      default: {
        // Cas générique : comparaison directe sur le champ
        const pv = String(p[filterType] || '').trim();
        return pv !== '' && (pv === String(label).trim() || pv.toLowerCase() === String(label).toLowerCase());
      }
    }
  }

  /* ── Source de données : filteredData en priorité ────────────── */
  function _getAllProjects() {
    if (typeof DataFilterEngine !== 'undefined' && DataFilterEngine.getFilteredData) {
      const d = DataFilterEngine.getFilteredData();
      if (d && d.length) return d;
    }
    if (typeof AE !== 'undefined' && AE.getFiltered) {
      const d = AE.getFiltered();
      if (d && d.length) return d;
    }
    // Dernier recours : données brutes
    if (typeof DataFilterEngine !== 'undefined' && DataFilterEngine.getRawData) {
      return DataFilterEngine.getRawData();
    }
    if (typeof AE !== 'undefined' && AE.getRaw) return AE.getRaw();
    return window.DATA || [];
  }

  function _resolveProjects(filterType, label, chartId, extraFilters) {
    let projects = _getAllProjects()
      .filter(p => _matchProject(p, filterType, label, chartId));

    // Fallback sur rawData si résultat vide
    if (!projects.length) {
      const raw = (typeof AE !== 'undefined' && AE.getRaw) ? AE.getRaw()
        : ((typeof DataFilterEngine !== 'undefined' && DataFilterEngine.getRawData) ? DataFilterEngine.getRawData() : []);
      projects = raw.filter(p => _matchProject(p, filterType, label, chartId));
    }

    // extraFilters (ex: { status: 'obtenu' } pour chart-obtenu)
    if (extraFilters && projects.length) {
      if (extraFilters.status)
        projects = projects.filter(p => _status(p) === extraFilters.status);
      Object.entries(extraFilters).forEach(([k, v]) => {
        if (k === 'status') return;
        projects = projects.filter(p => String(p[k] || '') === String(v));
      });
    }

    console.log(`[CDD] ${chartId} → ${filterType}="${label}" → ${projects.length} projets`);
    return projects;
  }

  function _getChartCard(chartId) {
    const byAttr = document.querySelector(`[data-chart-id="${chartId}"]`);
    if (byAttr) return byAttr;
    const canvas = document.getElementById(chartId);
    if (canvas) {
      const byCard = canvas.closest('.chart-card, .chart-section, .chart-box');
      if (byCard) return byCard;
      return canvas.parentElement;
    }
    return null;
  }

  function _getOrCreatePanel(card, chartId) {
    let panel = card.querySelector(`.cdd-panel[data-cdd="${chartId}"]`);
    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'cdd-panel';
      panel.dataset.cdd = chartId;
      const container = card.querySelector('.chart-container, .chart-box');
      if (container) container.insertAdjacentElement('afterend', panel);
      else card.appendChild(panel);
    }
    return panel;
  }

  /* ── Rendu mini-table inline (aperçu rapide sous le graphique) ──────────
     Toujours TOUS les projets, colonnes identiques au tableau principal.
     Si TABLE_COLUMNS n'est pas encore défini, repli sur 6 colonnes fixes.
  ── */
  function _renderTable(projects) {
    if (!projects.length) {
      return `<div class="cdd-empty">📭 Aucun projet trouvé</div>`;
    }

    // ── Utiliser TABLE_COLUMNS si disponible (colonnes visibles configurées) ─
    if (typeof TABLE_COLUMNS !== 'undefined' && TABLE_COLUMNS.length) {
      const visibleCols = TABLE_COLUMNS.filter(c => c.visible);
      const cm = (typeof AE !== 'undefined') ? AE.getCAMode() : 'Bud';

      const header = visibleCols.map(c =>
        `<th style="padding:.38rem .7rem;text-align:left;color:var(--dust);font-family:var(--mono);` +
        `font-size:.62rem;font-weight:600;text-transform:uppercase;letter-spacing:.05em;` +
        `border-bottom:1px solid rgba(255,255,255,.07);white-space:nowrap;">${c.label}</th>`
      ).join('');

      const rows = projects.map(p => {
        const cells = visibleCols.map(c => {
          // Extraire le contenu de la <td> générée par col.render()
          const tdHtml = c.render(p, cm);
          const match  = tdHtml.match(/<td[^>]*>([\s\S]*?)<\/td>/i);
          const inner  = match ? match[1] : '—';
          return `<td style="padding:.38rem .7rem;border-bottom:1px solid rgba(255,255,255,.04);vertical-align:middle;">${inner}</td>`;
        }).join('');
        const s = typeof ProjectUtils !== 'undefined' ? ProjectUtils.getStatus(p) : 'autre';
        const borderColor = { obtenu:'#00d4aa', perdu:'#ff4d6d', offre:'#0099ff' }[s] || '#5a7089';
        return `<tr style="border-left:2px solid ${borderColor}22;" onmouseover="this.style.background='rgba(255,255,255,.025)'" onmouseout="this.style.background=''">${cells}</tr>`;
      }).join('');

      return `<table style="width:100%;border-collapse:collapse;font-size:.74rem;">
        <thead><tr style="background:rgba(0,0,0,.25);">${header}</tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
    }

    // ── Repli 6 colonnes fixes si TABLE_COLUMNS absent ───────────────────────
    const rows = projects.map(p => {
      const s  = typeof ProjectUtils !== 'undefined' ? ProjectUtils.getStatus(p) : (p['Statut'] || '');
      const bc = { obtenu: '#00d4aa', perdu: '#ff4d6d', offre: '#0099ff' }[s] || '#9fb3c8';
      const ca = typeof ProjectUtils !== 'undefined'
        ? (ProjectUtils.parseMontant(p['Bud']) || 0)
        : (parseFloat(p['Bud']) || 0);
      const caFmt = ca > 0 ? (typeof ProjectUtils !== 'undefined'
        ? ProjectUtils.formatMontant(ca, true)
        : ca.toLocaleString('fr-FR') + '€') : '—';
      const parsedEnd = (typeof ProjectUtils !== 'undefined' && ProjectUtils.parseDate)
        ? ProjectUtils.parseDate(p['Date de retour demandée'])
        : (p['Date de retour demandée'] ? new Date(p['Date de retour demandée']) : null);
      const ech = (parsedEnd && !isNaN(parsedEnd.getTime()))
        ? parsedEnd.toLocaleDateString('fr-FR')
        : (p['Date de retour demandée'] ? String(p['Date de retour demandée']).trim() : '—');
      return `<tr onmouseover="this.style.background='rgba(255,255,255,.025)'" onmouseout="this.style.background=''">
        <td style="padding:.38rem .7rem;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--snow);" title="${(p['Dénomination']||'').replace(/"/g,'')}">${p['Dénomination'] || '—'}</td>
        <td style="padding:.38rem .7rem;"><span style="display:inline-block;padding:.1rem .4rem;border-radius:99px;font-size:.65rem;font-weight:700;font-family:var(--mono);background:${bc}22;color:${bc};">${s}</span></td>
        <td style="padding:.38rem .7rem;color:var(--dust);">${p['Client'] || '—'}</td>
        <td style="padding:.38rem .7rem;color:var(--dust);font-size:.72rem;">${p['Zone Géographique'] || '—'}</td>
        <td style="padding:.38rem .7rem;font-family:var(--mono);font-size:.74rem;color:var(--brand);">${caFmt}</td>
        <td style="padding:.38rem .7rem;font-family:var(--mono);font-size:.68rem;color:var(--dust);">${ech}</td>
      </tr>`;
    }).join('');
    return `<table style="width:100%;border-collapse:collapse;font-size:.74rem;">
      <thead><tr style="background:rgba(0,0,0,.25);">
        ${['Projet','Statut','Société','Zone','CA','Échéance'].map(h =>
          `<th style="padding:.38rem .7rem;text-align:left;color:var(--dust);font-family:var(--mono);font-size:.62rem;font-weight:600;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid rgba(255,255,255,.07)">${h}</th>`
        ).join('')}
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  /* ── Ouvrir les projets dans le tableau principal ─────────────────────── */
  function _openInMainTable(projects, label) {
    // S'assurer que showDetailTable et renderRows sont disponibles
    if (typeof showDetailTable !== 'function' || typeof renderRows !== 'function') {
      console.warn('[CDD] showDetailTable non disponible');
      return;
    }
    // Basculer le mode "tout afficher" vers les données du drilldown
    // sans modifier les filtres actifs
    showDetailTable(projects, label);
    // Réinitialiser le toggle all/filtered pour refléter la sélection drilldown
    if (window._tableMode && typeof window._tableMode.setCustom === 'function') {
      window._tableMode.setCustom(projects, label);
    }
    // Scroll doux vers le tableau
    const sec = document.getElementById('detail-section');
    if (sec) setTimeout(() => sec.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }

  function show(chartId, filterType, filterValue, label, options) {
    const card = _getChartCard(chartId);
    if (!card) { console.warn(`[CDD] chart-card introuvable pour ${chartId}`); return; }

    const extraFilters = (options && options.extraFilters) || null;
    const projects     = _resolveProjects(filterType, filterValue, chartId, extraFilters);
    const panel        = _getOrCreatePanel(card, chartId);

    const displayLabel = label || filterValue || filterType;
    const tableLabel = `📊 ${displayLabel} — ${projects.length} projet${projects.length !== 1 ? 's' : ''}`;

    panel.innerHTML = `
      <div class="cdd-header">
        <span class="cdd-title">${displayLabel}</span>
        <div style="display:flex;align-items:center;gap:.45rem;flex-wrap:wrap;">
          <span class="cdd-count">${projects.length} projet${projects.length !== 1 ? 's' : ''}</span>
          <button class="cdd-btn-excel" data-cdd-excel="${chartId}" title="Télécharger en Excel" style="display:inline-flex;align-items:center;gap:.3rem;padding:.2rem .65rem;background:rgba(0,212,170,.1);border:1px solid rgba(0,212,170,.3);border-radius:99px;color:#00d4aa;font-family:var(--mono);font-size:.67rem;font-weight:500;cursor:pointer;white-space:nowrap;">
            📥 Excel
          </button>
          <button class="cdd-btn-table" data-cdd-totable="${chartId}"
            title="Ouvrir ces projets dans le tableau principal avec toutes les colonnes configurées"
            style="display:inline-flex;align-items:center;gap:.3rem;padding:.2rem .65rem;
              background:rgba(0,153,255,.13);border:1px solid rgba(0,153,255,.35);
              border-radius:99px;color:#5bc8f5;font-family:var(--mono);font-size:.67rem;
              font-weight:500;cursor:pointer;white-space:nowrap;transition:background .15s,border-color .15s;">
            📋 Voir dans le tableau
          </button>
          <button class="cdd-close" data-cdd-close="${chartId}">✕</button>
        </div>
      </div>
      <div class="cdd-table-wrap">${_renderTable(projects)}</div>`;

    // Bouton fermer
    panel.querySelector('[data-cdd-close]').addEventListener('click', () => hide(chartId));

    // Bouton Excel DrillDown
    var _xBtn = panel.querySelector('[data-cdd-excel]');
    if (_xBtn) {
      _xBtn.addEventListener('click', function() {
        var lbl = displayLabel.replace(/[^\w\s\-]/g,'').trim().slice(0,30) || 'selection';
        exportExcel(projects, 'export_' + lbl + '_' + new Date().toISOString().slice(0,10) + '.xlsx', displayLabel.slice(0,31));
        var self = this; this.textContent = '...';
        setTimeout(function(){ self.innerHTML = '📥 Excel'; }, 2000);
      });
    }

    // Bouton "Voir dans le tableau"
    panel.querySelector('[data-cdd-totable]').addEventListener('click', function() {
      _openInMainTable(projects, tableLabel);
      // Feedback visuel
      this.textContent = '✅ Tableau ouvert';
      this.style.background = 'rgba(0,212,170,.15)';
      this.style.borderColor = 'rgba(0,212,170,.4)';
      this.style.color = '#00d4aa';
      setTimeout(() => {
        this.innerHTML = '📋 Voir dans le tableau';
        this.style.background = '';
        this.style.borderColor = '';
        this.style.color = '#5bc8f5';
      }, 2000);
    });

    // Animation ouverture
    panel.style.maxHeight = '0';
    panel.style.overflow = 'hidden';
    panel.style.transition = 'max-height .32s cubic-bezier(.4,0,.2,1)';
    requestAnimationFrame(() => {
      panel.style.maxHeight = panel.scrollHeight + 'px';
      setTimeout(() => { panel.style.maxHeight = ''; panel.style.overflow = ''; }, 340);
    });

    _currentPanel = panel;
    _currentChartId = chartId;
  }

  function hide(chartId) {
    const id = chartId || _currentChartId;
    if (!id) return;
    document.querySelectorAll(`.cdd-panel[data-cdd="${id}"]`).forEach(p => {
      p.style.transition = 'max-height .25s ease';
      p.style.maxHeight = p.scrollHeight + 'px';
      requestAnimationFrame(() => {
        p.style.maxHeight = '0';
        setTimeout(() => p.remove(), 260);
      });
    });
    _currentPanel = null;
    _currentChartId = null;
  }

  function hideAll() {
    document.querySelectorAll('.cdd-panel').forEach(p => p.remove());
    _currentPanel = null;
    _currentChartId = null;
  }

  return { show, hide, hideAll, registerFilter };
})();
}
