(function () {
  'use strict';

  var _activeYear   = null;
  var _statusFilter = 'tous'; // 'tous' | 'obtenu' | 'perdu' | 'offre'

  /* ── Helpers ── */
  function _raw() { return (typeof AE !== 'undefined') ? AE.getRaw() : (window.DATA || []); }
  function _fmt(v) {
    if (typeof ProjectUtils !== 'undefined' && ProjectUtils.formatMontant)
      return ProjectUtils.formatMontant(v, true);
    if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(2) + 'M€';
    if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(0) + 'k€';
    return v + '€';
  }
  function _pca(p, field) {
    var f = 'Bud'; // champ montant unique
    return (typeof ProjectUtils !== 'undefined'
      ? (ProjectUtils.parseMontant(p[f]) || 0)
      : (parseFloat(p[f]) || 0));
  }
  function _status(p) {
    return typeof ProjectUtils !== 'undefined' ? ProjectUtils.getStatus(p) : (p['Statut'] || 'autre');
  }

  /* ── Projets facturant sur une année (réalité comptable) + filtres AE (sauf annee) ── */
  function _projectsForYear(year) {
    var yr = String(year);
    // Source unique : _annee injecté par DataFilterEngine (via Analytics.getProjectYear)
    // NE PAS utiliser ca_facture_YYYY / Analytics.getFacturation (déprécié)
    var all = _raw().filter(function(p) {
      return String(p._annee || '') === yr;
    });
    // Appliquer filtres AE actifs sauf _annee (déjà filtré)
    if (typeof AE !== 'undefined' && AE.getFilters) {
      var af = AE.getFilters();
      all = all.filter(function(p) {
        return Object.keys(af).every(function(k) {
          if (k === '_annee') return true;
          var v = af[k];
          if (k === 'status' || k === 'Statut') return _status(p) === v;
          return String(p[k] || '') === String(v);
        });
      });
    }
    return all;
  }

  /* ── Appliquer le filtre statut local ── */
  function _filtered(projects) {
    if (_statusFilter === 'tous') return projects;
    return projects.filter(function (p) { return _status(p) === _statusFilter; });
  }

  /* ── Couleur / label statut ── */
  var STATUS_META = {
    obtenu: { label: 'Gagné',    color: '#00d4aa', bg: 'rgba(0,212,170,.15)'  },
    perdu:  { label: 'Perdu',    color: '#ff4d6d', bg: 'rgba(255,77,109,.15)' },
    offre:  { label: 'En cours', color: '#0099ff', bg: 'rgba(0,153,255,.15)'  },
    autre:  { label: 'Autre',    color: '#f5b740', bg: 'rgba(245,183,64,.12)' }
  };
  function _statusBadge(s) {
    var m = STATUS_META[s] || STATUS_META.autre;
    return '<span style="display:inline-block;padding:.15rem .5rem;border-radius:99px;font-size:.68rem;'
      + 'font-weight:600;font-family:var(--mono);background:' + m.bg + ';color:' + m.color + ';">'
      + m.label + '</span>';
  }

  /* ── Onglets années ── */
  function _buildTabs(years) {
    var el = document.getElementById('obj-detail-tabs');
    if (!el) return;
    el.innerHTML = years.map(function (yr) {
      var isActive = String(yr) === String(_activeYear);
      var total    = _projectsForYear(yr).length;
      return '<button class="obj-tab' + (isActive ? ' obj-tab-active' : '') + '" data-year="' + yr + '">'
        + yr + '<span class="obj-tab-badge">' + total + '</span>'
        + '</button>';
    }).join('');
    el.querySelectorAll('.obj-tab').forEach(function (btn) {
      btn.addEventListener('click', function () { window._objDetail.show(this.dataset.year); });
    });
  }

  /* ── Filtres statut ── */
  function _buildStatusFilters(allProjects) {
    var el = document.getElementById('obj-detail-status-filters');
    if (!el) return;
    var statuts = ['tous', 'obtenu', 'perdu', 'offre'];
    el.innerHTML = statuts.map(function (s) {
      var isActive = _statusFilter === s;
      var count = s === 'tous' ? allProjects.length
        : allProjects.filter(function (p) { return _status(p) === s; }).length;
      if (count === 0 && s !== 'tous') return '';
      var m = s === 'tous'
        ? { label: 'Tous', color: '#9fb3c8', bg: 'rgba(255,255,255,.06)' }
        : STATUS_META[s];
      var activeStyle = isActive
        ? 'background:' + m.bg + ';border-color:' + m.color + ';color:' + m.color + ';'
        : 'background:rgba(255,255,255,.03);border-color:rgba(255,255,255,.1);color:var(--dust);';
      return '<button class="obj-status-btn" data-status="' + s + '" style="'
        + 'font-family:var(--mono);font-size:.65rem;font-weight:600;padding:.22rem .65rem;'
        + 'border-radius:99px;border:1px solid;cursor:pointer;transition:all .18s;' + activeStyle + '">'
        + m.label + ' <span style="opacity:.7;">(' + count + ')</span>'
        + '</button>';
    }).join('');
    el.querySelectorAll('.obj-status-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        _statusFilter = this.dataset.status;
        _refresh();
      });
    });
  }

  /* ── Lignes du tableau ── */
  function _renderRows(projects) {
    var tbody = document.getElementById('obj-detail-tbody');
    if (!tbody) return;
    if (!projects.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--dust);'
        + 'padding:1.5rem;font-family:var(--mono);font-size:.75rem;">'
        + 'Aucun projet pour cette sélection.</td></tr>';
      return;
    }
    // Tri : obtenus en tête par CA décroissant, puis autres
    var sorted = projects.slice().sort(function (a, b) {
      var sa = _status(a), sb = _status(b);
      if (sa === 'obtenu' && sb !== 'obtenu') return -1;
      if (sb === 'obtenu' && sa !== 'obtenu') return  1;
      return _pca(b) - _pca(a); // [CORRIGÉ v2] compare par Bud
    });
    tbody.innerHTML = sorted.map(function (p) {
      var s   = _status(p);
      // [CORRIGÉ v2] Bud = source unique; obtenu → ca gagné, autres → même Bud
      var ca  = _pca(p);  // Bud si obtenu (utilisé pour affichage CA gagné)
      var cae = _pca(p);  // Bud pour tous statuts (était ca_etudie, champ inexistant)
      var ech = p['Date de retour demandée'] ? new Date(p['Date de retour demandée']).toLocaleDateString('fr-FR') : '—';
      var mw  = p['Puissance (MWc)'] ? parseFloat(p['Puissance (MWc)']).toFixed(1) + ' MW' : '—';

      // Montant facturé sur l'année active (réalité comptable)
      var caFact = 0;
      if (_activeYear && typeof Analytics !== 'undefined' && typeof Analytics.getFacturation === 'function') {
        var fact = Analytics.getFacturation(p);
        caFact = fact ? (parseFloat(fact[String(_activeYear)]) || 0) : 0;
      } else if (_activeYear) {
        caFact = 0; // [CORRIGÉ v2] champ ca_facture_YYYY absent de data.js
      }

      // Affichage : facturé si dispo, sinon ca_gagne (obtenu) ou ca_etudie (autres)
      var caDisplay, caColor;
      if (caFact > 0) {
        caDisplay = _fmt(caFact);
        caColor   = s === 'obtenu' ? 'var(--brand)' : '#8b78f8';
      } else if (s === 'obtenu') {
        caDisplay = ca > 0 ? _fmt(ca) : '—';
        caColor   = 'var(--brand)';
      } else {
        caDisplay = cae > 0 ? _fmt(cae) : '—';
        caColor   = s === 'perdu' ? 'var(--heat)' : '#0099ff';
      }

      // Indicateur si le projet provient d'une autre année commerciale
      var anneeComm = (p._annee != null && String(p._annee).trim() !== '')
        ? String(p._annee) : (p._annee ? String(p._annee) : null);
      var crossYearBadge = (anneeComm && _activeYear && anneeComm !== String(_activeYear))
        ? '<span title="Année commerciale : ' + anneeComm + '" style="font-size:.58rem;'
          + 'background:rgba(139,120,248,.2);color:#8b78f8;border-radius:3px;padding:0 3px;'
          + 'margin-left:4px;vertical-align:middle;font-family:var(--mono);">comml ' + anneeComm + '</span>'
        : '';

      return '<tr>'
        + '<td style="color:var(--snow);max-width:210px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + (p['Dénomination'] || '').replace(/"/g, '') + '">'
        + (p['Dénomination'] || '—') + crossYearBadge + '</td>'
        + '<td>' + _statusBadge(s) + '</td>'
        + '<td style="color:var(--pale);font-size:.78rem;white-space:nowrap;">' + (p['Client'] || '—') + '</td>'
        + '<td style="color:var(--pale);font-size:.78rem;">' + (p['Zone Géographique'] || '—') + '</td>'
        + '<td style="text-align:right;font-family:var(--mono);font-size:.8rem;font-weight:700;color:' + caColor + ';">' + caDisplay + '</td>'
        + '<td style="text-align:right;font-family:var(--mono);font-size:.72rem;color:var(--dust);">' + mw + '</td>'
        + '<td style="font-family:var(--mono);font-size:.7rem;color:var(--dust);white-space:nowrap;">' + ech + '</td>'
        + '</tr>';
    }).join('');
  }

  /* ── Refresh interne ── */
  function _refresh() {
    if (!_activeYear) return;
    var all      = _projectsForYear(_activeYear);
    var filtered = _filtered(all);

    // CA = Bud des projets obtenus (source unique de vérité — pas ca_facture_YYYY)
    var wonAll = all.filter(function(p) { return _status(p) === 'obtenu'; });
    var caTotal = wonAll.reduce(function(sum, p) {
      return sum + ((typeof ProjectUtils !== 'undefined' && ProjectUtils.getProjectAmount)
        ? ProjectUtils.getProjectAmount(p)
        : ((typeof ProjectUtils !== 'undefined'
          ? ProjectUtils.parseMontant(p['Bud'])
          : parseFloat(p['Bud'])) || 0));
    }, 0);

    var countEl = document.getElementById('obj-detail-count');
    var caEl    = document.getElementById('obj-detail-total-ca');

    // Compteur enrichi : "32 projets (8 gagnés)" quand filtre = tous
    var displayCount = filtered.length + ' projet' + (filtered.length !== 1 ? 's' : '');
    if (_statusFilter === 'tous' && wonAll.length > 0 && wonAll.length < all.length) {
      displayCount += ' (' + wonAll.length + ' gagné' + (wonAll.length !== 1 ? 's' : '') + ')';
    }
    if (countEl) countEl.textContent = displayCount;
    if (caEl)    caEl.textContent    = 'CA obtenu ' + _activeYear + ' : ' + _fmt(caTotal);

    _buildStatusFilters(all);
    _renderRows(filtered);
  }

  /* ── Show ── */
  function show(year) {
    _activeYear = String(year);
    var panel = document.getElementById('obj-detail-panel');
    var title = document.getElementById('obj-detail-title');
    if (!panel) return;

    panel.style.display = '';
    if (title) title.textContent = '📋 Projets — ' + _activeYear;

    var years = (window._v42 && window._v42.getForcedYears) ? window._v42.getForcedYears() : ['2024','2025','2026'];
    _buildTabs(years);
    _refresh();

    /* scrollIntoView supprimé — évite remontée de page */
  }

  /* ── Hide ── */
  function hide() {
    var panel = document.getElementById('obj-detail-panel');
    if (panel) panel.style.display = 'none';
    _activeYear = null;
  }

  /* ── Refresh public (après re-render barres / filtres) ── */
  function refresh() { if (_activeYear) show(_activeYear); }

  /* ── Wiring DOM ── */
  document.addEventListener('DOMContentLoaded', function () {
    var closeBtn = document.getElementById('obj-detail-close');
    if (closeBtn) closeBtn.addEventListener('click', hide);
  });

  window._objDetail = { show: show, hide: hide, refresh: refresh };
})();
