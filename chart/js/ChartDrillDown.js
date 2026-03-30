/**
 * ════════════════════════════════════════════════════════════════
 *  CHART DRILL-DOWN — Tableau détaillé universel v2.0
 * ════════════════════════════════════════════════════════════════
 *
 *  CORRECTIFS v2.0 :
 *   ✅ extraFilters dans show() — graphiques spécialisés forcent
 *      un filtre supplémentaire sur les données affichées
 *      Ex: { status: 'obtenu' } pour "Projets obtenus par Société"
 *   ✅ Colonne "Date réception" ajoutée dans toutes les colonnes
 *   ✅ Bouton "Voir" supprimé
 *   ✅ Tableau affiché directement sous le graphique (remplace l'ancien)
 *   ✅ Dates invalides → "—" via ProjectUtils.parseDate()
 *
 *  API publique :
 *   ChartDrillDown.show(chartId, filterType, label, rawLabel, options)
 *   ChartDrillDown.hide(chartId)
 *   ChartDrillDown.hideAll()
 *   ChartDrillDown.injectCSS()
 *
 *  options :
 *   { useRaw: false }          Données brutes (ignore filtres FM)
 *   { extraFilters: {...} }    Filtres additionnels (ex: status='obtenu')
 * ════════════════════════════════════════════════════════════════
 */

// ── GUARD ANTI-REDÉCLARATION ─────────────────────────────────────────────────
if (!window.ChartDrillDown) {
window.ChartDrillDown = (() => {
  'use strict';

  const _state       = new Map();
  const PANEL_SUFFIX = '__drilldown';

  /* ── Registre des filtres custom (DRILL_MAP → filterFn) ─────────
   *  ChartDrillDown.registerFilter(chartId, filterFn)
   *  Permet à DRILL_MAP de brancher ses filterFn custom ici
   *  au lieu que les deux systèmes se marchent dessus.
   * ────────────────────────────────────────────────────────────── */
  const _customFilters = {}; // { chartId: filterFn(p, label) → bool }

  function registerFilter(chartId, filterFn) {
    if (typeof filterFn === 'function') {
      _customFilters[chartId] = filterFn;
    }
  }

  /* ── Helpers ─────────────────────────────────────────────────── */

  // ── CORRECTION 5 : lecture stricte via DataFilterEngine ───────────
  // window.DATA ne doit JAMAIS être lu directement — même en fallback.
  // Si DataFilterEngine est absent, on remonte vers AE uniquement.
 // ── CORRECTION v2.1 : lecture stricte via DataFilterEngine ───────────
function _getProjects(useRaw) {
  if (useRaw) {
    if (typeof DataFilterEngine !== 'undefined' && DataFilterEngine.getRawData) {
      const raw = DataFilterEngine.getRawData();
      if (raw && raw.length > 0) {
        console.log(`[ChartDrillDown] _getProjects(useRaw=true) → ${raw.length} projets (rawData)`);
        return raw;
      }
    }
    if (typeof AE !== 'undefined' && AE.getRaw) {
      const raw = AE.getRaw();
      console.log(`[ChartDrillDown] _getProjects(useRaw=true) → ${raw.length} projets (AE.getRaw)`);
      return raw;
    }
    console.warn('[ChartDrillDown] _getProjects(useRaw) : aucune source disponible');
    return [];
  }

  // Mode "données filtrées"
  if (typeof DataFilterEngine !== 'undefined' && DataFilterEngine.getFilteredData) {
    const data = DataFilterEngine.getFilteredData();
    if (data && data.length > 0) {
      console.log(`[ChartDrillDown] _getProjects(useRaw=false) → ${data.length} projets (filteredData)`);
      return data;
    }
    console.warn('[ChartDrillDown] DataFilterEngine.getFilteredData() vide — tentative AE.getFiltered()');
  }
  
  if (typeof AE !== 'undefined' && typeof AE.getFiltered === 'function') {
    const data = AE.getFiltered();
    if (data && data.length > 0) {
      console.log(`[ChartDrillDown] _getProjects(useRaw=false) → ${data.length} projets (AE.getFiltered)`);
      return data;
    }
  }
  
  if (typeof AE !== 'undefined' && AE.getRaw) {
    console.warn('[ChartDrillDown] _getProjects : DataFilterEngine et AE.getFiltered vides, fallback AE.getRaw()');
    return AE.getRaw();
  }
  
  console.error('[ChartDrillDown] _getProjects : aucune source de données disponible');
  return [];
}

  /**
   * Formater une date — retourne "—" si invalide.
   * Correctif #3 : jamais d'"Invalid Date" dans l'UI.
   */
  function _fmtDate(raw) {
    if (!raw || raw === 'x' || raw === 'X' || raw === '') return '—';
    if (typeof ProjectUtils !== 'undefined' && ProjectUtils.parseDate) {
      const d = ProjectUtils.parseDate(raw);
      if (!d) return '—';
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yy = d.getFullYear();
      return `${dd}/${mm}/${yy}`;
    }
    // Fallback
    const d = new Date(raw);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('fr-FR');
  }

  const _fmt = v => {
    if (v === null || v === undefined || isNaN(v) || v === 0) return '—';
    if (typeof ProjectUtils !== 'undefined' && ProjectUtils.formatMontant)
      return ProjectUtils.formatMontant(v, true);
    if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(2) + 'M€';
    if (Math.abs(v) >= 1e3) return Math.round(v / 1e3) + 'k€';
    return v + '€';
  };

  function _pca(p) {
    if (typeof ProjectUtils !== 'undefined' && ProjectUtils.parseMontant)
      return ProjectUtils.parseMontant(p['Bud']) || 0;
    return parseFloat(p['Bud']) || 0;
  }

  // ── CORRECTION 3 : statut exclusivement via ProjectUtils.getStatus() ──
  function _status(p) {
    if (typeof ProjectUtils !== 'undefined' && ProjectUtils.getStatus)
      return ProjectUtils.getStatus(p);
    // Fallback défensif uniquement si ProjectUtils absent (ne devrait pas arriver)
    const raw = (p['Statut'] || '').toLowerCase().trim();
    if (raw.includes('obtenu') || raw.includes('remport')) return 'obtenu';
    if (raw.includes('perdu'))  return 'perdu';
    if (raw.includes('offre') || raw.includes('cours')) return 'offre';
    return 'autre';
  }

  function _annee(p) {
    if (p._annee != null && String(p._annee).trim() !== '') return String(p._annee);
    const raw = p['Date réception'];
    if (raw) {
      if (typeof ProjectUtils !== 'undefined' && ProjectUtils.parseDate) {
        const d = ProjectUtils.parseDate(raw);
        if (d) return String(d.getFullYear());
      }
      const pts = String(raw).split('/');
      if (pts.length === 3) { let y = parseInt(pts[2], 10); if (y < 100) y += 2000; return String(y); }
    }
    return '—';
  }

  function _factTotal(p) {
    if (typeof Analytics !== 'undefined' && Analytics.getFacturation) {
      const fact = Analytics.getFacturation(p);
      if (fact && typeof fact === 'object') {
        return Object.values(fact).reduce((s, v) => s + (parseFloat(v) || 0), 0);
      }
    }
    let total = 0;
    for (const key of Object.keys(p)) {
      if (/^ca_facture_\d{4}$/.test(key)) total += parseFloat(p[key]) || 0;
    }
    return total;
  }

  function _factForYear(p, yr) {
    if (typeof Analytics !== 'undefined' && Analytics.getFacturation) {
      const fact = Analytics.getFacturation(p);
      return fact ? (parseFloat(fact[String(yr)]) || 0) : 0;
    }
    return parseFloat(p['ca_facture_' + yr]) || 0;
  }

  function _marge(p) {
    const raw = p.marge_brute;
    if (raw === null || raw === undefined || raw === '') return null;
    const n = parseFloat(String(raw).replace(',', '.').replace('%', ''));
    return isNaN(n) ? null : n;
  }

  /* ── Application des extraFilters ────────────────────────────── */
  /**
   * Applique les filtres additionnels sur un tableau de projets.
   * Correctif #2 : garantit que le DrillDown montre exactement
   * les mêmes projets que le graphique source.
   *
   * @param {Object[]} projects
   * @param {Object|null} extraFilters  Ex: { status: 'obtenu' }
   * @returns {Object[]}
   */
  /**
   * Filtre les projets par filterType + label (segment cliqué).
   * Consulte d'abord _customFilters[chartId] si disponible.
   */
  function _filterByTypeAndLabel(projects, filterType, label, chartId) {
    if (!filterType || !label) return projects;

    // ── Priorité 1 : filterFn custom enregistrée par DRILL_MAP ──
    if (chartId && _customFilters[chartId]) {
      return projects.filter(p => _customFilters[chartId](p, label));
    }

    return projects.filter(p => {
      switch (filterType) {
        case '_annee':            return String(_annee(p)) === String(label);
        case 'Client':            return (p['Client'] || '').trim() === String(label).trim();
        case 'Zone Géographique': return (p['Zone Géographique'] || '').trim() === String(label).trim();
        case 'Statut': {
          const st = _status(p);
          const l  = String(label).toLowerCase().trim();
          const MAP = { 'obtenu': 'obtenu', 'gagné': 'obtenu', 'perdu': 'perdu', 'offre': 'offre', 'en cours': 'offre' };
          return st === l || st === (MAP[l] || l);
        }
        case 'status':            return _status(p) === String(label).toLowerCase().trim();
        case 'annee_facturation': return _factForYear(p, label) > 0;
        case 'Type de projet (Activité)':
          return (p['Type de projet (Activité)'] || '').trim() === String(label).trim();

        // ── Cas custom fréquents non gérés → tableau vide sans ces lignes ──
        case '_mois': {
          // Label = abrév mois FR (Jan, Fév, …)
          const MOIS = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
          const raw  = p['Date réception'];
          if (!raw || raw === 'x' || raw === 'X') return false;
          const d = (typeof ProjectUtils !== 'undefined' && ProjectUtils.parseDate)
            ? ProjectUtils.parseDate(raw) : new Date(raw);
          return d && !isNaN(d.getTime()) && MOIS[d.getMonth()] === String(label);
        }
        case '_tranche': {
          // Label = tranche budget (ex: "< 100k€", "100-250k€")
          const TRANCHES = [
            { l: '< 50k€',      min: 0,     max: 50e3    },
            { l: '50–100k€',    min: 50e3,  max: 100e3   },
            { l: '< 100k€',     min: 0,     max: 100e3   },
            { l: '100-250k€',   min: 100e3, max: 250e3   },
            { l: '100–250k€',   min: 100e3, max: 250e3   },
            { l: '250-500k€',   min: 250e3, max: 500e3   },
            { l: '250–500k€',   min: 250e3, max: 500e3   },
            { l: '500k-1M€',    min: 500e3, max: 1e6     },
            { l: '500k–1M€',    min: 500e3, max: 1e6     },
            { l: '1M-5M€',      min: 1e6,   max: 5e6     },
            { l: '1M–5M€',      min: 1e6,   max: 5e6     },
            { l: '> 5M€',       min: 5e6,   max: Infinity},
          ];
          const bud = parseFloat(String(p['Bud'] || '').replace(/[^0-9.,]/g, '').replace(',', '.')) || 0;
          const t = TRANCHES.find(x => x.l === String(label));
          return t ? bud >= t.min && bud < t.max : false;
        }

        default:
          return String(p[filterType] || '').trim() === String(label).trim();
      }
    });
  }

    function _applyExtraFilters(projects, extraFilters) {
    if (!extraFilters || Object.keys(extraFilters).length === 0) return projects;

    let result = projects;

    // Filtre statut
    if (extraFilters.status) {
      result = result.filter(p => _status(p) === extraFilters.status);
    }

    // Filtre _annee
    if (extraFilters._annee) {
      result = result.filter(p => _annee(p) === String(extraFilters._annee));
    }

    // Filtre Client
    if (extraFilters.Client) {
      result = result.filter(p => p['Client'] === extraFilters.Client);
    }

    // Filtre Zone Géographique
    if (extraFilters['Zone Géographique']) {
      result = result.filter(p => p['Zone Géographique'] === extraFilters['Zone Géographique']);
    }

    // Filtre générique
    Object.keys(extraFilters).forEach(key => {
      if (['status', '_annee', 'Client', 'Zone Géographique'].includes(key)) return;
      const val = extraFilters[key];
      result = result.filter(p => String(p[key] || '') === String(val));
    });

    return result;
  }

  /* ── Sélection des projets selon le contexte ─────────────────── */
  function _resolveProjects(filterType, label, useRaw, extraFilters, chartId) {
    let projects = _getProjects(useRaw);

    // Étape 1 : filtrer par le segment cliqué (filterType + label)
    projects = _filterByTypeAndLabel(projects, filterType, label, chartId);

    // Étape 2 : appliquer les filtres additionnels
    projects = _applyExtraFilters(projects, extraFilters);

    console.log(`[ChartDrillDown] _resolveProjects → ${projects.length} projets pour ${filterType}="${label}"${chartId ? ' ('+chartId+')' : ''}`);
    return projects;
  }

  /* ── Colonnes selon le contexte ─────────────────────────────── */
  // Correctif #4 : colonne "Date réception" ajoutée, bouton "Voir" supprimé
  const _DATE_COL = { key: 'Date réception', label: 'Date réception', type: 'date' };

  const _COLUMN_SETS = {
    annee_facturation: [
      { key: 'ao',         label: 'AO',          type: 'text'      },
      { key: 'Client',     label: 'Société',      type: 'text'      },
      { key: 'projet',     label: 'Projet',       type: 'name'      },
      _DATE_COL,
      { key: '_annee',     label: 'Année comm.',  type: 'year'      },
      { key: '_fact_yr',   label: 'CA Facturé',   type: 'money_fact'},
      { key: 'Bud',        label: 'Budget',       type: 'money'     },
      { key: '_status',    label: 'Statut',       type: 'status'    },
    ],
    'Client': [
      { key: 'ao',         label: 'AO',           type: 'text'  },
      { key: 'projet',     label: 'Projet',        type: 'name'  },
      _DATE_COL,
      { key: '_annee',     label: 'Année',         type: 'year'  },
      { key: '_status',    label: 'Statut',        type: 'status'},
      { key: 'Bud',        label: 'Budget',        type: 'money' },
      { key: 'Puissance (MWc)', label: 'MW',       type: 'mw'   },
    ],
    'Zone Géographique': [
      { key: 'ao',         label: 'AO',            type: 'text'  },
      { key: 'Client',     label: 'Société',       type: 'text'  },
      { key: 'projet',     label: 'Projet',        type: 'name'  },
      _DATE_COL,
      { key: '_annee',     label: 'Année',         type: 'year'  },
      { key: '_status',    label: 'Statut',        type: 'status'},
      { key: 'Bud',        label: 'Budget',        type: 'money' },
    ],
    status: [
      { key: 'ao',         label: 'AO',            type: 'text'  },
      { key: 'Client',     label: 'Société',       type: 'text'  },
      { key: 'projet',     label: 'Projet',        type: 'name'  },
      _DATE_COL,
      { key: '_annee',     label: 'Année',         type: 'year'  },
      { key: 'Zone Géographique', label: 'Zone',   type: 'text'  },
      { key: 'Bud',        label: 'Budget',        type: 'money' },
    ],
    'Statut': [
      { key: 'ao',         label: 'AO',            type: 'text'  },
      { key: 'Client',     label: 'Société',       type: 'text'  },
      { key: 'projet',     label: 'Projet',        type: 'name'  },
      _DATE_COL,
      { key: '_annee',     label: 'Année',         type: 'year'  },
      { key: 'Zone Géographique', label: 'Zone',   type: 'text'  },
      { key: 'Bud',        label: 'Budget',        type: 'money' },
    ],
    'Type de projet (Activité)': [
      { key: 'ao',         label: 'AO',            type: 'text'  },
      { key: 'Client',     label: 'Société',       type: 'text'  },
      { key: 'projet',     label: 'Projet',        type: 'name'  },
      _DATE_COL,
      { key: '_annee',     label: 'Année',         type: 'year'  },
      { key: '_status',    label: 'Statut',        type: 'status'},
      { key: 'Bud',        label: 'Budget',        type: 'money' },
    ],
    _default: [
      { key: 'ao',         label: 'AO',            type: 'text'  },
      { key: 'Client',     label: 'Société',       type: 'text'  },
      { key: 'projet',     label: 'Projet',        type: 'name'  },
      _DATE_COL,
      { key: '_annee',     label: 'Année',         type: 'year'  },
      { key: 'Bud',        label: 'Budget',        type: 'money' },
      { key: '_status',    label: 'Statut',        type: 'status'},
    ]
  };

  /* ── Rendu d'une cellule ─────────────────────────────────────── */
  const STATUS_META = {
    obtenu: { label: 'Gagné',     color: '#00d4aa', bg: 'rgba(0,212,170,.13)' },
    perdu:  { label: 'Perdu',     color: '#ff4d6d', bg: 'rgba(255,77,109,.13)'},
    offre:  { label: 'En cours',  color: '#0099ff', bg: 'rgba(0,153,255,.13)' },
    autre:  { label: 'Autre',     color: '#f5b740', bg: 'rgba(245,183,64,.1)' }
  };

  function _cellValue(p, col, yearCtx) {
    switch (col.type) {
      case 'name':
        return `<span class="cdd-cell-name" title="${(p[col.key] || '').replace(/"/g, '&quot;')}">${p[col.key] || '—'}</span>`;

      case 'date': {
        // Correctif #3 : jamais "Invalid Date"
        const raw = p[col.key];
        return `<span style="font-family:var(--cdd-mono);color:var(--cdd-pale);font-size:.75rem;">${_fmtDate(raw)}</span>`;
      }

      case 'money': {
        const v     = _pca(p);
        const color = _status(p) === 'obtenu' ? 'var(--cdd-green)' : 'var(--cdd-dust)';
        return `<span style="color:${color};font-family:var(--cdd-mono);font-weight:600;">${_fmt(v)}</span>`;
      }

      case 'money_fact': {
        const v     = _factForYear(p, yearCtx);
        const color = v > 0 ? 'var(--cdd-violet)' : 'var(--cdd-dust)';
        return `<span style="color:${color};font-family:var(--cdd-mono);font-weight:600;">${v > 0 ? _fmt(v) : '—'}</span>`;
      }

      case 'status': {
        const s = _status(p);
        const m = STATUS_META[s] || STATUS_META.autre;
        return `<span class="cdd-badge" style="background:${m.bg};color:${m.color};">${m.label}</span>`;
      }

      case 'year':
        return `<span style="font-family:var(--cdd-mono);color:var(--cdd-pale);font-size:.75rem;">${_annee(p)}</span>`;

      case 'pct': {
        const m = _marge(p);
        if (m === null) return '<span style="color:var(--cdd-dust);">—</span>';
        const color = m >= 20 ? 'var(--cdd-green)' : m >= 10 ? 'var(--cdd-yellow)' : 'var(--cdd-red)';
        return `<span style="font-family:var(--cdd-mono);font-weight:600;color:${color};">${m.toFixed(1)}%</span>`;
      }

      case 'mw': {
        const v = parseFloat(p['Puissance (MWc)']);
        return isNaN(v) ? '—' : `<span style="font-family:var(--cdd-mono);color:var(--cdd-pale);">${v.toFixed(1)}</span>`;
      }

      default:
        return p[col.key]
          ? `<span style="color:var(--cdd-snow);">${p[col.key]}</span>`
          : '<span style="color:var(--cdd-dust);">—</span>';
    }
  }

  /* ── KPIs récapitulatifs ─────────────────────────────────────── */
  function _buildKPIs(projects, filterType, label) {
    const total    = projects.length;
    const obtained = projects.filter(p => _status(p) === 'obtenu').length;
    const inProg   = projects.filter(p => _status(p) === 'offre').length;
    const lost     = projects.filter(p => _status(p) === 'perdu').length;
    const winRate  = (obtained + lost) > 0 ? Math.round((obtained / (obtained + lost)) * 100) : null;

    const caEtudie = projects.reduce((s, p) => s + _pca(p), 0);
    const caGagne  = projects
      .filter(p => _status(p) === 'obtenu')
      .reduce((s, p) => s + _pca(p), 0);

    const kpis = [
      { icon: '📁', label: 'Total',      value: total,                         color: 'var(--cdd-pale)'   },
      { icon: '✅', label: 'Obtenus',    value: obtained,                      color: 'var(--cdd-green)'  },
      { icon: '🔄', label: 'En cours',   value: inProg,                        color: 'var(--cdd-blue)'   },
      { icon: '❌', label: 'Perdus',     value: lost,                          color: 'var(--cdd-red)'    },
      { icon: '🎯', label: 'Conversion', value: winRate !== null ? winRate + '%' : '—',
                                                                                color: winRate >= 50 ? 'var(--cdd-green)' : 'var(--cdd-yellow)' },
      { icon: '📊', label: 'Budget tot.', value: _fmt(caEtudie),               color: 'var(--cdd-pale)'   },
      { icon: '💰', label: 'CA gagné',   value: _fmt(caGagne),                  color: 'var(--cdd-green)'  },
    ].filter(k => k.value !== 0 && k.value !== '0' && k.value !== _fmt(0));

    return kpis.map(k =>
      `<div class="cdd-kpi">
        <span class="cdd-kpi-icon">${k.icon}</span>
        <span class="cdd-kpi-label">${k.label}</span>
        <span class="cdd-kpi-value" style="color:${k.color};">${k.value}</span>
      </div>`
    ).join('');
  }

  /* ── Rendu du tableau ────────────────────────────────────────── */
  // Correctif #4 : pas de colonne "Voir", tableau toujours remplacé
  function _buildTable(projects, filterType, label) {
    const cols = _COLUMN_SETS[filterType] || _COLUMN_SETS._default;
    const yr   = filterType === 'annee_facturation' ? label : null;

    // Tri : obtenus en tête puis par CA décroissant
    const sorted = projects.slice().sort((a, b) => {
      const sa = _status(a), sb = _status(b);
      if (sa === 'obtenu' && sb !== 'obtenu') return -1;
      if (sb === 'obtenu' && sa !== 'obtenu') return  1;
      return _pca(b) - _pca(a);
    });

    const colLabel = yr
      ? cols.map(c => c.key === '_fact_yr' ? { ...c, label: `CA Fact. ${yr}` } : c)
      : cols;

    const header = colLabel.map(c => `<th class="cdd-th">${c.label}</th>`).join('');

    const rows = sorted.map(p => {
      const cells = colLabel.map(c => {
        const colDef = cols.find(x => x.label === c.label) || c;
        return `<td class="cdd-td">${_cellValue(p, colDef, yr)}</td>`;
      }).join('');
      const s = _status(p);
      return `<tr class="cdd-row cdd-row--${s}">${cells}</tr>`;
    }).join('');

    const emptyMsg = `
      <tr>
        <td colspan="${cols.length}" class="cdd-empty">
          <div style="padding:1rem 0;">
            <div style="font-size:1.1rem;margin-bottom:.35rem;">📭</div>
            <div style="font-weight:600;color:var(--cdd-pale);">Aucun projet trouvé</div>
            <div style="font-size:.7rem;color:var(--cdd-dust);margin-top:.2rem;">
              Filtre : <code style="font-family:var(--cdd-mono);color:var(--cdd-blue);">${filterType} = "${label}"</code>
            </div>
          </div>
        </td>
      </tr>`;

    return `
      <table class="cdd-table">
        <thead><tr class="cdd-thead-row">${header}</tr></thead>
        <tbody>${rows || emptyMsg}</tbody>
      </table>`;
  }

  /* ── Titre contextuel ────────────────────────────────────────── */
  const _CONTEXT_TITLES = {
    annee_facturation:      l => `📆 Projets facturant en ${l}`,
    '_annee':               l => `📅 Projets — Année commerciale ${l}`,
    'Client':               l => `🏢 Projets — ${l}`,
    'Zone Géographique':    l => `🌍 Projets — Zone ${l}`,
    status:                 l => `📋 Projets — ${l.charAt(0).toUpperCase() + l.slice(1)}`,
    'Type de projet (Activité)': l => `🎯 Projets — ${l}`,
    partenaire_gc:          l => `🤝 Partenaire — ${l}`,
  };

  function _getTitle(filterType, label, rawLabel) {
    const fn = _CONTEXT_TITLES[filterType];
    return fn ? fn(rawLabel || label) : `🔍 Projets — ${rawLabel || label}`;
  }

  /* ── Trouver le conteneur parent ─────────────────────────────── */
  function _getChartCard(chartId) {
    const byAttr = document.querySelector(`[data-chart-id="${chartId}"]`);
    if (byAttr) return byAttr;

    const canvas = document.getElementById(chartId);
    if (canvas) {
      let el = canvas.parentElement;
      while (el) {
        if (el.classList.contains('chart-card') ||
            el.classList.contains('chart-section') ||
            el.classList.contains('card'))
          return el;
        el = el.parentElement;
      }
      return canvas.parentElement;
    }
    return null;
  }

  function _getOrCreatePanel(chartId) {
    const panelId = chartId + PANEL_SUFFIX;
    let panel = document.getElementById(panelId);

    if (!panel) {
      panel = document.createElement('div');
      panel.id        = panelId;
      panel.className = 'cdd-panel';
      panel.setAttribute('role',       'region');
      panel.setAttribute('aria-label', 'Tableau détail drill-down');

      const card = _getChartCard(chartId);
      if (card) {
        const cs = window.getComputedStyle(card);
        if (cs.position === 'static') card.style.position = 'relative';
        if (cs.overflow  === 'hidden') card.style.overflow = 'visible';
        card.appendChild(panel);
      } else {
        const canvas = document.getElementById(chartId);
        if (canvas) {
          canvas.insertAdjacentElement('afterend', panel);
        } else {
          const ns = document.querySelector('main, .dashboard, .content, body');
          if (ns) ns.appendChild(panel);
        }
      }
    }

    return panel;
  }

  /* ── API publique : show ─────────────────────────────────────── */
  /**
   * @param {string}  chartId
   * @param {string}  filterType
   * @param {string}  label           Valeur nettoyée
   * @param {string}  rawLabel        Valeur brute pour le titre
   * @param {Object}  [options]
   * @param {boolean} [options.useRaw=false]
   * @param {Object}  [options.extraFilters]  Filtres additionnels (correctif #2)
   */
  function show(chartId, filterType, label, rawLabel, options) {
    if (!chartId || !filterType || label === null || label === undefined) return;
    const labelStr     = String(label);
    const useRaw       = !!(options && options.useRaw);
    const extraFilters = (options && options.extraFilters) || null;

    // Toggle : fermer si même contexte
    const prev = _state.get(chartId);
    if (prev && prev.filterType === filterType && prev.label === labelStr &&
        !!prev.useRaw === useRaw &&
        JSON.stringify(prev.extraFilters) === JSON.stringify(extraFilters)) {
      hide(chartId);
      return;
    }

    // Résoudre les projets (avec extraFilters + chartId pour filtres custom)
    const projects = _resolveProjects(filterType, labelStr, useRaw, extraFilters, chartId);

    const title = _getTitle(filterType, labelStr, rawLabel);
    const kpis  = _buildKPIs(projects, filterType, labelStr);
    const table = _buildTable(projects, filterType, labelStr);

    const panel = _getOrCreatePanel(chartId);

    if (panel._hideTid) { clearTimeout(panel._hideTid);  panel._hideTid  = null; }
    if (panel._openTid) { clearTimeout(panel._openTid);  panel._openTid  = null; }
    panel.style.cssText = '';
    panel.style.display = '';

    const modeBadge = useRaw
      ? '<span class="cdd-badge-raw">📋 Voir toutes les données du graphique</span>'
      : '';

    // Mode double tableau :
    //   • Par défaut : données filtrées (AE + filtres globaux actifs)
    //   • Bouton : afficher toutes les données liées à ce graphique (sans casser filtres globaux)
    const toggleBtn = useRaw
      ? `<button class="cdd-btn-mode" data-mode="filtered" title="Revenir aux données du segment cliqué">⟵ Segment cliqué</button>`
      : `<button class="cdd-btn-mode" data-mode="raw" title="Voir toutes les données de ce graphique (hors filtre segment)">📋 Voir toutes les données du graphique</button>`;

    panel.innerHTML = `
      <div class="cdd-header">
        <div class="cdd-title">${title}${modeBadge}</div>
        <div class="cdd-actions">
          ${toggleBtn}
          <span class="cdd-count">${projects.length} projet${projects.length !== 1 ? 's' : ''}</span>
          <button class="cdd-close" aria-label="Fermer" data-chart="${chartId}">✕</button>
        </div>
      </div>
      <div class="cdd-kpis">${kpis}</div>
      <div class="cdd-scroll">${table}</div>
    `;

    panel.querySelector('.cdd-close').addEventListener('click', () => hide(chartId));

    panel.querySelector('.cdd-btn-mode').addEventListener('click', function() {
      const nextRaw = (this.dataset.mode === 'raw');
      show(chartId, filterType, label, rawLabel, { useRaw: nextRaw, extraFilters });
    });

    // Animation d'ouverture
    panel.classList.remove('cdd-open');
    panel.style.height   = '0px';
    panel.style.opacity  = '0';
    panel.style.overflow = 'hidden';
    void panel.offsetHeight;

    const targetH = panel.scrollHeight;
    panel.style.transition = 'height .30s cubic-bezier(.4,0,.2,1), opacity .26s ease, margin .28s ease';
    panel.style.height  = targetH + 'px';
    panel.style.opacity = '1';
    panel.style.margin  = '.75rem 0 1.25rem';

    panel._openTid = setTimeout(() => {
      panel.style.height   = 'auto';
      panel.style.overflow = 'visible';
      panel.style.transition = '';
      panel.classList.add('cdd-open');
      panel._openTid = null;
    }, 320);

    _state.set(chartId, { filterType, label: labelStr, useRaw, extraFilters });
    console.log(`[ChartDrillDown] "${chartId}" → ${filterType}="${labelStr}" (${projects.length} projets${extraFilters ? ', extraFilters:' + JSON.stringify(extraFilters) : ''})`);
  }

  /* ── API publique : hide ─────────────────────────────────────── */
  function hide(chartId) {
    const panelId = chartId + PANEL_SUFFIX;
    const panel   = document.getElementById(panelId);
    if (panel) {
      const h = panel.scrollHeight;
      panel.style.height   = h + 'px';
      panel.style.overflow = 'hidden';
      void panel.offsetHeight;

      panel.style.transition = 'height .28s cubic-bezier(.4,0,.2,1), opacity .22s ease, margin .25s ease';
      panel.style.height   = '0px';
      panel.style.opacity  = '0';
      panel.style.margin   = '0';
      panel.style.padding  = '0';

      panel._hideTid = setTimeout(() => {
        panel.innerHTML    = '';
        panel.style.cssText = '';
        panel.classList.remove('cdd-open');
        panel.style.display = 'none';
      }, 300);
    }
    _state.delete(chartId);
  }

  function hideAll() {
    _state.forEach((_, chartId) => hide(chartId));
  }

  function showAll(chartId, filterType, label, rawLabel) {
    show(chartId, filterType, label, rawLabel, { useRaw: true });
  }

  /* ── Injection CSS ───────────────────────────────────────────── */
  function injectCSS() {
    if (document.getElementById('cdd-styles')) return;
    const style = document.createElement('style');
    style.id = 'cdd-styles';
    style.textContent = `
      :root {
        --cdd-mono:    'Fira Code', 'JetBrains Mono', monospace;
        --cdd-snow:    #e8edf2;
        --cdd-pale:    #9fb3c8;
        --cdd-dust:    #5a7089;
        --cdd-green:   #00d4aa;
        --cdd-blue:    #0099ff;
        --cdd-red:     #ff4d6d;
        --cdd-yellow:  #f5b740;
        --cdd-violet:  #8b78f8;
        --cdd-border:  rgba(255,255,255,.07);
      }
      .cdd-panel {
        overflow: hidden; height: 0; opacity: 0; margin: 0; padding: 0;
        transition: height .30s cubic-bezier(.4,0,.2,1), opacity .26s ease, margin .28s ease;
        will-change: height, opacity;
      }
      .cdd-panel.cdd-open { height: auto; opacity: 1; margin: .75rem 0 1.25rem; overflow: visible; }
      .cdd-panel .cdd-header {
        display: flex; align-items: center; justify-content: space-between; gap: 1rem;
        padding: .7rem 1.1rem .5rem;
        background: rgba(255,255,255,.03);
        border: 1px solid var(--cdd-border); border-bottom: none; border-radius: 10px 10px 0 0;
      }
      .cdd-panel .cdd-title { font-size:.85rem; font-weight:700; color:var(--cdd-snow); }
      .cdd-panel .cdd-actions { display:flex; align-items:center; gap:.75rem; }
      .cdd-panel .cdd-count {
        font-family:var(--cdd-mono); font-size:.68rem; font-weight:600; color:var(--cdd-dust);
        background:rgba(255,255,255,.04); border:1px solid var(--cdd-border);
        padding:.12rem .55rem; border-radius:99px;
      }
      .cdd-panel .cdd-close {
        background:rgba(255,77,109,.12); border:1px solid rgba(255,77,109,.25); color:var(--cdd-red);
        cursor:pointer; width:26px; height:26px; border-radius:6px; font-size:.75rem; line-height:1;
        display:flex; align-items:center; justify-content:center;
        transition:background .15s, transform .15s;
      }
      .cdd-panel .cdd-close:hover { background:rgba(255,77,109,.25); transform:scale(1.1); }
      .cdd-panel .cdd-btn-mode {
        display:inline-flex; align-items:center; gap:.3rem; padding:.22rem .75rem;
        background:rgba(0,153,255,.1); border:1px solid rgba(0,153,255,.35); border-radius:99px;
        color:#5bc8f5; font-family:var(--cdd-mono); font-size:.68rem; font-weight:500;
        cursor:pointer; white-space:nowrap; transition:background .18s;
      }
      .cdd-panel .cdd-btn-mode:hover { background:rgba(0,153,255,.22); color:#90deff; }
      .cdd-panel .cdd-badge-raw {
        display:inline-block; margin-left:.5rem; padding:.1rem .5rem;
        background:rgba(245,183,64,.12); border:1px solid rgba(245,183,64,.35); border-radius:99px;
        color:#f5b740; font-family:var(--cdd-mono); font-size:.6rem; font-weight:500;
      }
      .cdd-panel .cdd-kpis {
        display:flex; flex-wrap:wrap; gap:.4rem .7rem; padding:.55rem 1.1rem;
        background:rgba(255,255,255,.015);
        border-left:1px solid var(--cdd-border); border-right:1px solid var(--cdd-border);
      }
      .cdd-panel .cdd-kpi {
        display:flex; align-items:center; gap:.35rem; font-size:.72rem; padding:.18rem .55rem;
        background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.06);
        border-radius:99px; white-space:nowrap;
      }
      .cdd-kpi-icon { font-size:.78rem; }
      .cdd-kpi-label { color:var(--cdd-dust); }
      .cdd-kpi-value { font-family:var(--cdd-mono); font-weight:700; font-size:.74rem; }
      .cdd-panel .cdd-scroll {
        overflow-x:auto; border:1px solid var(--cdd-border); border-top:none;
        border-radius:0 0 10px 10px; background:rgba(255,255,255,.018);
        max-height:420px; overflow-y:auto; scrollbar-width:thin;
        scrollbar-color:rgba(255,255,255,.1) transparent;
      }
      .cdd-table { width:100%; min-width:600px; border-collapse:collapse; font-size:.75rem; }
      .cdd-thead-row { position:sticky; top:0; z-index:2; background:rgba(15,23,35,.98); }
      .cdd-th {
        padding:.5rem .85rem; text-align:left; color:var(--cdd-dust);
        font-family:var(--cdd-mono); font-size:.65rem; font-weight:600; text-transform:uppercase;
        letter-spacing:.06em; white-space:nowrap; border-bottom:1px solid rgba(255,255,255,.08);
      }
      .cdd-td { padding:.45rem .85rem; border-bottom:1px solid rgba(255,255,255,.04); vertical-align:middle; }
      .cdd-row:last-child .cdd-td { border-bottom:none; }
      .cdd-row { transition:background .12s; }
      .cdd-row:hover .cdd-td { background:rgba(255,255,255,.025); }
      .cdd-row--perdu  .cdd-td:first-child { border-left:2px solid rgba(255,77,109,.3); }
      .cdd-row--obtenu .cdd-td:first-child { border-left:2px solid rgba(0,212,170,.3); }
      .cdd-row--offre  .cdd-td:first-child { border-left:2px solid rgba(0,153,255,.3); }
      .cdd-cell-name {
        color:var(--cdd-snow); display:block; max-width:200px;
        overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:500;
      }
      .cdd-badge {
        display:inline-block; padding:.12rem .45rem; border-radius:99px;
        font-size:.62rem; font-weight:700; font-family:var(--cdd-mono); white-space:nowrap;
      }
      .cdd-empty { text-align:center; color:var(--cdd-dust); padding:1.8rem; font-style:italic; }
    `;
    document.head.appendChild(style);
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', injectCSS);
    } else {
      injectCSS();
    }
  }

  console.log('%c📋 ChartDrillDown v2.1 chargé — filterFn custom + _mois/_tranche + registerFilter', 'color:#0099ff;font-weight:700');

  return { show, showAll, hide, hideAll, injectCSS, registerFilter };
})();
} // end guard !window.ChartDrillDown
