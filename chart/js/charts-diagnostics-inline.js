(function () {
  'use strict';

  var _fmtCA = function(v) { return typeof ProjectUtils !== 'undefined' ? ProjectUtils.formatMontant(v, true) : (v/1e6).toFixed(2) + 'M€'; };

  /* ── Rendu des Diagnostics ───────────────────────────── */
  function renderDiagnostics(data) {
    var panel = document.getElementById('diagnostics-panel');
    if (!panel || typeof Analytics === 'undefined' || typeof Analytics.diagnostics !== 'function') return;

    var objectif = parseInt(document.getElementById('target-amount') && document.getElementById('target-amount').value, 10) || null;
    var diag = Analytics.diagnostics(data, {}, objectif);
    var score = Analytics.performanceScore(data, {}, objectif);

    // Score badge
    var scoreBadge = document.getElementById('diag-score-badge');
    var scoreVal   = document.getElementById('diag-score-val');
    var scoreLabel = document.getElementById('diag-score-label');
    if (scoreBadge) {
      scoreBadge.style.display = '';
      scoreBadge.style.borderColor = score.color;
    }
    if (scoreVal)   { scoreVal.textContent = score.score; scoreVal.style.color = score.color; }
    if (scoreLabel) { scoreLabel.textContent = score.emoji + ' ' + score.label; scoreLabel.style.color = score.color; }

    // Helper pour un item de diagnostic
    function makeItem(item, isAlert) {
      var borderColors = { risk: '#ff4d6d', warning: '#f5b740', alert: '#ff4d6d', info: '#0099ff' };
      var border = isAlert ? (borderColors[item.type] || '#f5b740') : '#00d4aa';
      return '<div style="background:rgba(255,255,255,.03);border-left:3px solid ' + border + ';border-radius:0 6px 6px 0;padding:.5rem .75rem;">'
        + '<div style="font-family:var(--sans);font-size:.8rem;color:var(--snow);font-weight:600;margin-bottom:.2rem;">' + (item.icon || '') + ' ' + item.title + '</div>'
        + '<div style="font-family:var(--sans);font-size:.75rem;color:var(--pale);line-height:1.45;">' + item.message + '</div>'
        + (item.action ? '<div style="font-family:var(--mono);font-size:.65rem;color:var(--dust);margin-top:.3rem;">→ ' + item.action + '</div>' : '')
        + '</div>';
    }

    function makeRec(item) {
      return '<div style="display:flex;gap:.5rem;align-items:flex-start;padding:.4rem .7rem;background:rgba(139,120,248,.06);border-radius:6px;">'
        + '<span style="font-size:.9rem;flex-shrink:0;">' + item.icon + '</span>'
        + '<div><div style="font-family:var(--sans);font-size:.78rem;color:var(--snow);font-weight:600;">' + item.title + '</div>'
        + '<div style="font-family:var(--sans);font-size:.73rem;color:var(--pale);line-height:1.4;">' + item.detail + '</div></div>'
        + '</div>';
    }

    var alertsEl = document.getElementById('diag-alerts');
    var strengthsEl = document.getElementById('diag-strengths');
    var recsEl = document.getElementById('diag-recommendations');

    if (alertsEl) alertsEl.innerHTML = diag.alerts.length
      ? diag.alerts.map(function(a) { return makeItem(a, true); }).join('')
      : '<div style="font-family:var(--mono);font-size:.72rem;color:var(--brand);opacity:.6;">Aucune alerte détectée ✓</div>';

    if (strengthsEl) strengthsEl.innerHTML = diag.strengths.length
      ? diag.strengths.map(function(s) { return makeItem(s, false); }).join('')
      : '<div style="font-family:var(--mono);font-size:.72rem;color:var(--dust);">En cours d\'analyse…</div>';

    if (recsEl) recsEl.innerHTML = diag.recommendations.length
      ? diag.recommendations.map(makeRec).join('')
      : '<div style="font-family:var(--mono);font-size:.72rem;color:var(--dust);">Aucune recommandation prioritaire.</div>';

    panel.style.display = '';
  }

  /* ── Rendu Projection ────────────────────────────────── */
  function renderForecast(data) {
    var panel = document.getElementById('forecast-panel');
    if (!panel || typeof Analytics === 'undefined' || typeof Analytics.forecastYearEnd !== 'function') return;

    var objectif = parseInt(document.getElementById('target-amount') && document.getElementById('target-amount').value, 10) || null;
    var f = Analytics.forecastYearEnd(data, {}, objectif);

    document.getElementById('forecast-label') && (document.getElementById('forecast-label').innerHTML = f.label);
    document.getElementById('forecast-confidence') && (document.getElementById('forecast-confidence').textContent = '(confiance ' + f.confidence + '%)');

    var grid = document.getElementById('forecast-grid');
    if (grid) {
      var items = [
        { label: 'CA Gagné', val: _fmtCA(f.gained), color: '#00d4aa', icon: '✅' },
        { label: 'Pipeline pondéré', val: _fmtCA(f.pipeline), color: '#8b78f8', icon: '⚖️' },
        { label: 'Tendance projetée', val: _fmtCA(f.trendContrib), color: '#0099ff', icon: '📈' },
        { label: 'Projection totale', val: _fmtCA(f.projected), color: '#f5b740', icon: '🔮' },
      ];
      if (f.objectif) items.push({ label: 'vs Objectif', val: (f.pctObjectif >= 100 ? '✅ ' : '⚠️ ') + f.pctObjectif + '%', color: f.pctObjectif >= 100 ? '#00d4aa' : '#ff4d6d', icon: '🎯' });
      grid.innerHTML = items.map(function(item) {
        return '<div style="background:rgba(255,255,255,.03);border-radius:8px;padding:.75rem 1rem;border:1px solid rgba(255,255,255,.06);">'
          + '<div style="font-family:var(--mono);font-size:.6rem;text-transform:uppercase;letter-spacing:.07em;color:var(--dust);margin-bottom:.35rem;">' + item.icon + ' ' + item.label + '</div>'
          + '<div style="font-family:var(--serif);font-size:1.05rem;font-weight:700;color:' + item.color + ';">' + item.val + '</div>'
          + '</div>';
      }).join('');
    }

    var bar = document.getElementById('forecast-bar');
    if (bar && f.objectif) {
      var pct = Math.min(100, Math.round((f.projected / f.objectif) * 100));
      setTimeout(function() { bar.style.width = pct + '%'; }, 100);
    }

    panel.style.display = '';
  }

  /* ── Rendu Comparaison ───────────────────────────────── */
  function renderComparison(data, aStart, aEnd, bStart, bEnd) {
    var result = document.getElementById('cmp-result');
    var metrics = document.getElementById('cmp-metrics');
    if (!result || !metrics || typeof Analytics === 'undefined' || typeof Analytics.comparePeriods !== 'function') return;

    var cmp = Analytics.comparePeriods(data, aStart, aEnd, bStart, bEnd);

    function dirIcon(d) { return d === 'up' ? '↑' : d === 'down' ? '↓' : '→'; }
    function dirColor(d) { return d === 'up' ? '#00d4aa' : d === 'down' ? '#ff4d6d' : '#f5b740'; }

    var items = [
      { label: 'CA Gagné — A', val: _fmtCA(cmp.caA), sub: cmp.periodA.label, color: '#dce8f5' },
      { label: 'CA Gagné — B', val: _fmtCA(cmp.caB), sub: cmp.periodB.label, color: '#dce8f5' },
      {
        label: 'Variation CA',
        val: dirIcon(cmp.caDirection) + ' ' + (cmp.caDeltaPct !== null ? (cmp.caDeltaPct >= 0 ? '+' : '') + cmp.caDeltaPct + '%' : 'N/A'),
        sub: _fmtCA(Math.abs(cmp.caDelta)) + ' ' + (cmp.caDelta >= 0 ? 'de plus' : 'de moins'),
        color: dirColor(cmp.caDirection)
      },
      {
        label: 'Taux conversion',
        val: dirIcon(cmp.rateDirection) + ' ' + (cmp.rateDelta !== null ? (cmp.rateDelta >= 0 ? '+' : '') + cmp.rateDelta + 'pt' : 'N/A'),
        sub: (cmp.rateA !== null ? cmp.rateA + '%' : '?') + ' vs ' + (cmp.rateB !== null ? cmp.rateB + '%' : '?'),
        color: dirColor(cmp.rateDirection)
      },
      {
        label: 'Volume projets',
        val: dirIcon(cmp.volDirection) + ' ' + (cmp.volDeltaPct !== null ? (cmp.volDeltaPct >= 0 ? '+' : '') + cmp.volDeltaPct + '%' : 'N/A'),
        sub: cmp.volA + ' vs ' + cmp.volB + ' projets',
        color: dirColor(cmp.volDirection)
      },
      {
        label: 'Tendance globale',
        val: cmp.globalTrend === 'progression' ? '🟢 En progression' : cmp.globalTrend === 'recul' ? '🔴 En recul' : '🟡 Mixte',
        sub: cmp.clientShifted ? 'Top client modifié' : (cmp.zoneShifted ? 'Zone leader modifiée' : 'Structure stable'),
        color: cmp.globalTrend === 'progression' ? '#00d4aa' : cmp.globalTrend === 'recul' ? '#ff4d6d' : '#f5b740'
      }
    ];

    metrics.innerHTML = items.map(function(item) {
      return '<div style="background:rgba(255,255,255,.04);border-radius:8px;padding:.75rem 1rem;border:1px solid rgba(255,255,255,.07);">'
        + '<div style="font-family:var(--mono);font-size:.6rem;text-transform:uppercase;letter-spacing:.07em;color:var(--dust);margin-bottom:.35rem;">' + item.label + '</div>'
        + '<div style="font-family:var(--serif);font-size:1.05rem;font-weight:700;color:' + item.color + ';margin-bottom:.2rem;">' + item.val + '</div>'
        + '<div style="font-family:var(--mono);font-size:.65rem;color:var(--dust);">' + item.sub + '</div>'
        + '</div>';
    }).join('');

    result.style.display = '';
  }

  /* ── Exposition publique ─────────────────────────────── */
  window._v3intelligence = { renderDiagnostics, renderForecast, renderComparison };

  /* ── Wiring DOMContentLoaded ─────────────────────────── */
  document.addEventListener('DOMContentLoaded', function () {

    // Toggle panels
    function togglePanel(btnId, panelId) {
      var btn   = document.getElementById(btnId);
      var panel = document.getElementById(panelId);
      if (!btn || !panel) return;
      btn.addEventListener('click', function () {
        var visible = panel.style.display !== 'none' && panel.style.display !== '';
        panel.style.display = visible ? 'none' : '';
        btn.style.borderColor = visible ? '' : 'var(--brand2)';
        btn.style.color       = visible ? '' : 'var(--brand2)';
        if (!visible) {
          var data = (typeof AE !== 'undefined') ? AE.getFiltered() : (window.DATA || []);
          if (panelId === 'diagnostics-panel') renderDiagnostics(data);
          if (panelId === 'forecast-panel')    renderForecast(data);
        }
      });
    }

    togglePanel('btn-toggle-diagnostics', 'diagnostics-panel');
    togglePanel('btn-toggle-forecast',    'forecast-panel');
    // Note : btn-toggle-compare est géré par le module v4.0
  });

  // Auto-refresh diagnostics & forecast when data updates
  var _origUpdate = window.update;
  window.update = function () {
    if (typeof _origUpdate === 'function') _origUpdate();
    var data = (typeof AE !== 'undefined') ? AE.getFiltered() : (window.DATA || []);
    var diagPanel = document.getElementById('diagnostics-panel');
    var forePanel = document.getElementById('forecast-panel');
    if (diagPanel && diagPanel.style.display !== 'none' && diagPanel.style.display !== '') renderDiagnostics(data);
    if (forePanel && forePanel.style.display !== 'none' && forePanel.style.display !== '') renderForecast(data);
  };

})();
