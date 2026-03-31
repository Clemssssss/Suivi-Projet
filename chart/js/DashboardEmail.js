if (!window.DashboardEmail) {
window.DashboardEmail = (() => {
  'use strict';

  var EMAIL_CHARTS = [
    'biz-chart-perf-month',
    'biz-chart-perf-zone',
    'biz-chart-perf-client',
    'biz-chart-perf-type',
    'biz-chart-perf-zone-client',
    'biz-chart-perf-client-type',
    'biz-chart-pipe-zone',
    'biz-chart-pipe-client',
    'biz-chart-pipe-type',
    'biz-chart-pipe-zone-client',
    'biz-chart-pipe-client-type'
  ];

  function qs(id) {
    return document.getElementById(id);
  }

  function safeText(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function textOf(id) {
    var el = qs(id);
    if (!el) return '';
    return String(el.textContent || '').trim();
  }

  function labelOfSelect(id) {
    var el = qs(id);
    if (!el || !el.options || el.selectedIndex < 0) return '';
    return String(el.options[el.selectedIndex].textContent || '').trim();
  }

  function kpiValue(id) {
    var el = qs(id);
    if (!el) return '';
    var valueEl = el.querySelector('.business-kpi-value');
    return String((valueEl && valueEl.textContent) || el.textContent || '').trim();
  }

  function buildShareUrl() {
    var url = new URL(window.location.href);
    url.search = '';
    if (typeof AE !== 'undefined' && typeof AE.getURL === 'function') {
      var query = AE.getURL();
      if (query) url.search = '?' + query;
    }
    return url.toString();
  }

  function currentTimestamp() {
    var now = new Date();
    var yyyy = now.getFullYear();
    var mm = String(now.getMonth() + 1).padStart(2, '0');
    var dd = String(now.getDate()).padStart(2, '0');
    var hh = String(now.getHours()).padStart(2, '0');
    var mi = String(now.getMinutes()).padStart(2, '0');
    return {
      file: '' + yyyy + mm + dd + '-' + hh + mi,
      display: dd + '/' + mm + '/' + yyyy + ' ' + hh + ':' + mi
    };
  }

  function visibleCanvas(id) {
    var el = qs(id);
    if (!el || el.tagName !== 'CANVAS') return null;
    if (el.offsetParent === null) return null;
    return el;
  }

  function canvasTitle(canvas) {
    var card = canvas.closest('.chart-card, [data-chart-id]');
    if (!card) return canvas.id;
    var title = card.querySelector('.chart-title');
    return title ? String(title.textContent || '').replace(/[ⓘ]/g, '').trim() : canvas.id;
  }

  function captureCanvas(canvas) {
    try {
      var width = canvas.width || canvas.clientWidth || 1200;
      var height = canvas.height || canvas.clientHeight || 600;
      var maxWidth = 1200;
      var ratio = width > maxWidth ? (maxWidth / width) : 1;
      var out = document.createElement('canvas');
      out.width = Math.max(1, Math.round(width * ratio));
      out.height = Math.max(1, Math.round(height * ratio));
      var ctx = out.getContext('2d');
      ctx.fillStyle = '#101928';
      ctx.fillRect(0, 0, out.width, out.height);
      ctx.drawImage(canvas, 0, 0, out.width, out.height);
      return out.toDataURL('image/jpeg', 0.9);
    } catch (e) {
      return null;
    }
  }

  function collectCharts() {
    return EMAIL_CHARTS
      .map(function(id) {
        var canvas = visibleCanvas(id);
        if (!canvas) return null;
        return {
          id: id,
          title: canvasTitle(canvas),
          image: captureCanvas(canvas)
        };
      })
      .filter(function(item) { return item && item.image; });
  }

  function collectKpis() {
    return {
      performance: [
        { label: '€ gagnés', value: kpiValue('biz-kpi-won-year') },
        { label: '€ perdus', value: kpiValue('biz-kpi-lost-year') },
        { label: '€ gagnés + perdus', value: kpiValue('biz-kpi-decided-year') },
        { label: 'Taux de transfo', value: kpiValue('biz-kpi-rate-year') },
        { label: 'Nb dossiers décidés', value: kpiValue('biz-kpi-count-year') }
      ],
      pipeline: [
        { label: '€ Remis + En étude total', value: kpiValue('biz-kpi-pipe-bud') },
        { label: '€ Remis + En étude pondéré', value: kpiValue('biz-kpi-pipe-weighted') },
        { label: '% CA win proba / Bud', value: kpiValue('biz-kpi-pipe-ratio') }
      ]
    };
  }

  function getFilteredProjects() {
    if (window.AE && typeof window.AE.getFiltered === 'function') {
      return Array.isArray(window.AE.getFiltered()) ? window.AE.getFiltered() : [];
    }
    return Array.isArray(window.DATA) ? window.DATA : [];
  }

  function getProjectStatus(project) {
    if (window.ProjectUtils && typeof window.ProjectUtils.getStatus === 'function') {
      return window.ProjectUtils.getStatus(project);
    }
    return String(project && project['Statut'] || '').trim().toLowerCase();
  }

  function getProjectAmount(project, field) {
    var raw = project && project[field];
    if (window.ProjectUtils && typeof window.ProjectUtils.parseMontant === 'function') {
      return window.ProjectUtils.parseMontant(raw) || 0;
    }
    var n = parseFloat(raw);
    return isNaN(n) ? 0 : n;
  }

  function formatAmount(value) {
    if (window.ProjectUtils && typeof window.ProjectUtils.formatMontant === 'function') {
      return window.ProjectUtils.formatMontant(value, true);
    }
    return Math.round(Number(value || 0)).toLocaleString('fr-FR') + ' €';
  }

  function summarizeByDimension(projects, field, matcher, amountField, limit) {
    var buckets = {};
    (Array.isArray(projects) ? projects : []).forEach(function(project) {
      if (typeof matcher === 'function' && !matcher(project)) return;
      var label = String(project && project[field] || '').trim() || 'Non renseigné';
      if (!buckets[label]) buckets[label] = { label: label, amount: 0, count: 0 };
      buckets[label].amount += getProjectAmount(project, amountField || 'Bud');
      buckets[label].count += 1;
    });
    return Object.keys(buckets).map(function(key) {
      return buckets[key];
    }).sort(function(a, b) {
      return b.amount - a.amount || b.count - a.count || a.label.localeCompare(b.label);
    }).slice(0, limit || 5);
  }

  function collectNarrativeSections() {
    var projects = getFilteredProjects();
    var wonMatcher = function(project) { return getProjectStatus(project) === 'obtenu'; };
    var lostMatcher = function(project) { return getProjectStatus(project) === 'perdu'; };
    var pipeMatcher = function(project) {
      var raw = String(project && (project['Statut'] || project['MG Statut Odoo MG']) || '').trim().toLowerCase();
      return raw === 'remis' || raw === 'en etude';
    };

    return [
      {
        title: 'Top clients gagnés',
        rows: summarizeByDimension(projects, 'Client', wonMatcher, 'Bud', 5)
      },
      {
        title: 'Top zones gagnées',
        rows: summarizeByDimension(projects, 'Zone Géographique', wonMatcher, 'Bud', 5)
      },
      {
        title: 'Top clients perdus',
        rows: summarizeByDimension(projects, 'Client', lostMatcher, 'Bud', 5)
      },
      {
        title: 'Top pipe pondéré par client',
        rows: summarizeByDimension(projects, 'Client', pipeMatcher, 'CA win proba', 5)
      }
    ].filter(function(section) { return section.rows && section.rows.length; });
  }

  function collectContext() {
    return [
      { label: 'Année commerciale', value: labelOfSelect('year-filter') || 'Toutes les années' },
      { label: 'Champ date', value: labelOfSelect('date-field-selector') || 'Date réception' },
      { label: 'Mode CA', value: labelOfSelect('ca-mode') || 'CA Total (Bud)' },
      { label: 'Énergie', value: labelOfSelect('energy-type-filter') || 'Tous types' },
      { label: 'Période', value: labelOfSelect('timeline-preset') || 'Toutes les périodes' },
      { label: 'Mesure', value: labelOfSelect('biz-performance-view') || 'Montant (€ Bud)' },
      { label: 'Périmètre zone / client', value: labelOfSelect('biz-performance-combo-scope') || 'Même périmètre que le bloc' },
      { label: 'Statut affiché', value: labelOfSelect('biz-performance-status-filter') || 'Tout' },
      { label: 'Volume affiché', value: textOf('project-count') || '-- projets' }
    ];
  }

  function renderContextRows(items) {
    return items.map(function(item) {
      return '<tr>' +
        '<td style="padding:8px 10px;border:1px solid #d9e2ec;background:#f4f7fb;font-weight:700;width:220px;">' + safeText(item.label) + '</td>' +
        '<td style="padding:8px 10px;border:1px solid #d9e2ec;">' + safeText(item.value || '—') + '</td>' +
      '</tr>';
    }).join('');
  }

  function renderKpiCards(title, items, color) {
    return '<div style="margin-top:18px;">' +
      '<div style="font-size:18px;font-weight:800;color:#162334;margin-bottom:10px;">' + safeText(title) + '</div>' +
      '<table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:separate;border-spacing:10px 0;">' +
      '<tr>' +
      items.map(function(item) {
        return '<td style="background:#0f1723;border:1px solid #1f3144;border-radius:14px;padding:14px 16px;vertical-align:top;">' +
          '<div style="font-size:12px;color:#9fb3c8;text-transform:uppercase;letter-spacing:.08em;">' + safeText(item.label) + '</div>' +
          '<div style="font-size:26px;font-weight:900;color:' + color + ';margin-top:8px;">' + safeText(item.value || '—') + '</div>' +
        '</td>';
      }).join('') +
      '</tr></table></div>';
  }

  function renderCharts(charts) {
    if (!charts.length) return '';
    return '<div style="margin-top:22px;">' +
      '<div style="font-size:18px;font-weight:800;color:#162334;margin-bottom:12px;">Graphiques</div>' +
      charts.map(function(chart) {
        return '<div style="margin-bottom:22px;padding:14px;border:1px solid #d9e2ec;border-radius:16px;background:#ffffff;">' +
          '<div style="font-size:16px;font-weight:800;color:#162334;margin-bottom:10px;">' + safeText(chart.title) + '</div>' +
          '<img alt="' + safeText(chart.title) + '" src="' + chart.image + '" style="display:block;width:100%;max-width:980px;border-radius:12px;border:1px solid #e5ecf3;background:#101928;" />' +
        '</div>';
      }).join('') +
    '</div>';
  }

  function renderNarrativeSections(sections) {
    if (!sections.length) return '';
    return '<div style="margin-top:22px;">' +
      '<div style="font-size:18px;font-weight:800;color:#162334;margin-bottom:12px;">Lectures clés</div>' +
      sections.map(function(section) {
        return '<div style="margin-bottom:18px;padding:14px;border:1px solid #d9e2ec;border-radius:16px;background:#ffffff;">' +
          '<div style="font-size:15px;font-weight:800;color:#162334;margin-bottom:10px;">' + safeText(section.title) + '</div>' +
          '<table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;">' +
          section.rows.map(function(row) {
            return '<tr>' +
              '<td style="padding:8px 10px;border-top:1px solid #eef3f7;font-weight:700;">' + safeText(row.label) + '</td>' +
              '<td style="padding:8px 10px;border-top:1px solid #eef3f7;text-align:right;">' + safeText(formatAmount(row.amount)) + '</td>' +
              '<td style="padding:8px 10px;border-top:1px solid #eef3f7;text-align:right;color:#5a7089;">' + safeText(String(row.count) + ' dossier(s)') + '</td>' +
            '</tr>';
          }).join('') +
          '</table>' +
        '</div>';
      }).join('') +
    '</div>';
  }

  function buildEmailHtml() {
    var ts = currentTimestamp();
    var context = collectContext();
    var kpis = collectKpis();
    var charts = collectCharts();
    var narrative = collectNarrativeSections();
    var shareUrl = buildShareUrl();
    return [
      '<!DOCTYPE html>',
      '<html lang="fr"><head><meta charset="UTF-8"><title>Synthèse Dashboard</title></head>',
      '<body style="margin:0;padding:24px;background:#edf3f8;font-family:Segoe UI,Arial,sans-serif;color:#162334;">',
      '<div style="max-width:1040px;margin:0 auto;background:#ffffff;border-radius:20px;padding:28px;box-shadow:0 18px 50px rgba(12,24,41,.08);">',
      '<div style="font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#00a98f;">Suivi4me</div>',
      '<div style="font-size:30px;font-weight:900;color:#0f1723;margin-top:6px;">Synthèse commerciale du dashboard</div>',
      '<div style="font-size:14px;color:#5a7089;margin-top:8px;">Brouillon généré le ' + safeText(ts.display) + '</div>',
      '<div style="margin-top:16px;padding:14px 16px;border-radius:14px;background:#0f1723;color:#dce8f5;">',
      '<div style="font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#9fb3c8;">Lien de partage</div>',
      '<div style="margin-top:8px;word-break:break-all;font-size:14px;"><a href="' + safeText(shareUrl) + '" style="color:#00d4aa;text-decoration:none;">' + safeText(shareUrl) + '</a></div>',
      '</div>',
      '<div style="margin-top:22px;font-size:18px;font-weight:800;color:#162334;">Contexte de lecture</div>',
      '<table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;margin-top:10px;">',
      renderContextRows(context),
      '</table>',
      renderKpiCards('Prise d’affaires / Performance', kpis.performance, '#00d4aa'),
      renderKpiCards('Pipe commercial', kpis.pipeline, '#0099ff'),
      renderNarrativeSections(narrative),
      renderCharts(charts),
      '<div style="margin-top:22px;font-size:12px;color:#5a7089;">Email généré automatiquement depuis le dashboard. Les graphiques correspondent à l’état courant des filtres visibles.</div>',
      '</div></body></html>'
    ].join('');
  }

  function downloadTextFile(filename, content, contentType) {
    var blob = new Blob([content], { type: contentType || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    setTimeout(function() {
      URL.revokeObjectURL(url);
      link.remove();
    }, 1000);
  }

  function showToast(message) {
    var toast = qs('ux-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'ux-toast';
      toast.style.cssText = 'position:fixed;bottom:5rem;left:50%;transform:translateX(-50%) translateY(20px);z-index:10001;background:rgba(0,212,170,.15);border:1px solid rgba(0,212,170,.4);color:#00d4aa;padding:.55rem 1.2rem;border-radius:10px;font-size:.82rem;font-weight:600;font-family:system-ui,sans-serif;pointer-events:none;opacity:0;transition:opacity .25s,transform .25s;';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
    setTimeout(function() {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(20px)';
    }, 3200);
  }

  function createDraftEmail() {
    var ts = currentTimestamp();
    var subject = 'Synthese dashboard commercial - ' + (labelOfSelect('year-filter') || 'Toutes les annees');
    var html = buildEmailHtml();
    var eml = [
      'X-Unsent: 1',
      'Subject: ' + subject,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=UTF-8',
      '',
      html
    ].join('\r\n');

    downloadTextFile('dashboard-synthese-' + ts.file + '.eml', eml, 'message/rfc822;charset=utf-8');
    showToast('✉️ Brouillon email généré (.eml)');
  }

  function bind() {
    var btn = qs('btn-email-report');
    if (!btn || btn._emailBound) return;
    btn._emailBound = true;
    btn.addEventListener('click', createDraftEmail);
  }

  function init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bind);
    } else {
      bind();
    }
  }

  init();

  return {
    createDraftEmail: createDraftEmail
  };
})();
}
