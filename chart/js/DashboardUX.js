/**
 * ════════════════════════════════════════════════════════════════
 *  DASHBOARD UX v1.1 — Améliorations Expérience Utilisateur
 * ════════════════════════════════════════════════════════════════
 *
 *  Correctifs v1.1 :
 *   ✅ Mode focus : drawImage au lieu de JSON.parse(config) — compatible
 *      avec les configs Chart.js contenant des fonctions (callbacks)
 *   ✅ Focus : fond sombre injecté derrière le canvas avant drawImage
 *   ✅ Focus : export PNG depuis le canvas haute résolution (2x devicePixelRatio)
 * ════════════════════════════════════════════════════════════════
 */
if (!window.DashboardUX) {
window.DashboardUX = (() => {
  'use strict';

  let _isInit = false;

  /* ══════════════════════════════════════════════════════
     1. MODE FOCUS — Plein écran pour un graphique
  ══════════════════════════════════════════════════════ */
  function _openFocus(chartId) {
    const canvas = document.getElementById(chartId);
    if (!canvas) { console.warn('[DashboardUX] canvas introuvable:', chartId); return; }

    const card  = canvas.closest('.chart-card, [data-chart-id]');
    const title = card
      ? (card.querySelector('.chart-title')?.textContent?.trim().replace(/[ⓘ]/g, '').trim() || chartId)
      : chartId;

    // Fermer un éventuel overlay déjà ouvert
    document.getElementById('ux-focus-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'ux-focus-overlay';
    overlay.style.cssText = [
      'position:fixed;inset:0;z-index:10000;',
      'background:rgba(6,12,20,.96);backdrop-filter:blur(8px);',
      'display:flex;flex-direction:column;align-items:center;justify-content:center;',
      'padding:2rem;gap:1rem;',
    ].join('');

    // Header
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;width:100%;max-width:1400px;';
    header.innerHTML = `
      <span style="font-size:1.05rem;font-weight:700;color:#dce8f5;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${title}</span>
      <div style="display:flex;gap:.5rem;flex-shrink:0;margin-left:1rem;">
        <button id="ux-focus-png" style="padding:.35rem .8rem;background:rgba(0,212,170,.12);border:1px solid rgba(0,212,170,.3);border-radius:8px;color:#00d4aa;font-size:.78rem;cursor:pointer;font-weight:600;">💾 Export PNG</button>
        <button id="ux-focus-close" style="padding:.35rem .8rem;background:rgba(255,77,109,.12);border:1px solid rgba(255,77,109,.25);border-radius:8px;color:#ff4d6d;font-size:.78rem;cursor:pointer;font-weight:600;">✕ Fermer</button>
      </div>
    `;

    // Canvas de rendu haute résolution
    const dpr        = window.devicePixelRatio || 1;
    const maxW       = Math.min(window.innerWidth  - 80,  1400);
    const maxH       = Math.min(window.innerHeight - 160, 820);
    const focusCanvas = document.createElement('canvas');
    focusCanvas.width  = maxW  * dpr;
    focusCanvas.height = maxH  * dpr;
    focusCanvas.style.cssText = `max-width:${maxW}px;max-height:${maxH}px;width:100%;border-radius:12px;`;

    overlay.appendChild(header);
    overlay.appendChild(focusCanvas);
    document.body.appendChild(overlay);

    // Dessiner le graphique dans le focus canvas
    const ctx = focusCanvas.getContext('2d');

    function _drawChart() {
      ctx.clearRect(0, 0, focusCanvas.width, focusCanvas.height);
      // Fond sombre pour que le graphique soit visible
      ctx.fillStyle = '#101928';
      ctx.roundRect ? ctx.roundRect(0, 0, focusCanvas.width, focusCanvas.height, 12 * dpr)
                    : ctx.fillRect(0, 0, focusCanvas.width, focusCanvas.height);
      ctx.fill();
      // Dessiner le graphique source
      try {
        ctx.drawImage(canvas, 0, 0, focusCanvas.width, focusCanvas.height);
      } catch (err) {
        console.warn('[DashboardUX] drawImage failed:', err);
        // Afficher un message d'erreur dans le canvas
        ctx.fillStyle = '#9fb3c8';
        ctx.font = `${16 * dpr}px system-ui,sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('Graphique non disponible', focusCanvas.width / 2, focusCanvas.height / 2);
      }
    }

    _drawChart();

    // Rafraîchir si le graphique est animé
    let _rafId = null;
    function _refreshLoop() {
      _drawChart();
      _rafId = requestAnimationFrame(_refreshLoop);
    }
    // Arrêter la boucle après 1.5s (animations terminées)
    _rafId = requestAnimationFrame(_refreshLoop);
    setTimeout(() => { if (_rafId) cancelAnimationFrame(_rafId); _rafId = null; }, 1500);

    // Export PNG
    header.querySelector('#ux-focus-png').addEventListener('click', () => {
      if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
      _drawChart();
      const link = document.createElement('a');
      link.download = title.replace(/[^a-zA-Z0-9àâäéèêëïîôùûüç\s\-]/g, '').trim().substring(0, 40) + '.png';
      link.href = focusCanvas.toDataURL('image/png', 1.0);
      link.click();
    });

    function _close() {
      if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null; }
      overlay.remove();
      document.removeEventListener('keydown', _escHandler);
    }

    header.querySelector('#ux-focus-close').addEventListener('click', _close);
    overlay.addEventListener('click', e => { if (e.target === overlay) _close(); });

    const _escHandler = e => { if (e.key === 'Escape') _close(); };
    document.addEventListener('keydown', _escHandler);
  }

  function _resolveChartInstance(canvas) {
    if (typeof Chart === 'undefined') return null;
    if (typeof Chart.getChart === 'function') {
      const inst = Chart.getChart(canvas);
      if (inst) return inst;
    }
    if (Chart.instances) {
      return Object.values(Chart.instances).find(i => i.canvas === canvas) || null;
    }
    return null;
  }

  /* ══════════════════════════════════════════════════════
     2. EXPORT PNG PAR GRAPHIQUE
  ══════════════════════════════════════════════════════ */
  function _exportPNG(canvas, title) {
    const link = document.createElement('a');
    link.download = (title || 'graphique').replace(/[^a-zA-Z0-9àâäéèêëïîôùûüç\s\-]/g, '').trim().substring(0, 40) + '.png';
    link.href = canvas.toDataURL('image/png', 1.0);
    link.click();
  }

  function exportChartPNG(chartId) {
    const canvas = document.getElementById(chartId);
    if (!canvas) return;
    const card  = canvas.closest('[data-chart-id]');
    const title = card ? (card.querySelector('.chart-title')?.textContent?.trim() || chartId) : chartId;
    _exportPNG(canvas, title);
  }

  /* ══════════════════════════════════════════════════════
     3. LIEN PARTAGEABLE AVEC FILTRES ACTIFS
  ══════════════════════════════════════════════════════ */
  function copyShareLink() {
    const url = new URL(window.location.href);
    url.search = '';
    if (typeof AE !== 'undefined' && typeof AE.getURL === 'function') {
      const query = AE.getURL();
      if (query) url.search = '?' + query;
    }

    navigator.clipboard.writeText(url.toString()).then(() => _showToast('🔗 Lien copié !'))
      .catch(() => {
        const ta = document.createElement('textarea');
        ta.value = url.toString();
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
        _showToast('🔗 Lien copié !');
      });
  }

  function _restoreFromURL() {
    const params = new URLSearchParams(window.location.search);
    const hasCanonicalState = Array.from(params.keys()).some(key => key === 'ca' || key === 'year' || key.indexOf('f_') === 0);
    if (hasCanonicalState) return;

    const filtersParam = params.get('filters');
    if (filtersParam && typeof FilterManager !== 'undefined') {
      try { JSON.parse(filtersParam).forEach(f => { if (f.t && f.v) FilterManager.toggleFilter(f.t, f.v, f.v); }); }
      catch (e) { console.warn('[DashboardUX] Invalid filters in URL:', e); }
    }
    const caMode = params.get('caMode');
    if (caMode) { const sel = document.getElementById('ca-mode'); if (sel) { sel.value = caMode; sel.dispatchEvent(new Event('change')); } }
    const year = params.get('year');
    if (year) { const yf = document.getElementById('year-filter'); if (yf) { yf.value = year; yf.dispatchEvent(new Event('change')); } }
  }

  function _showToast(msg) {
    let toast = document.getElementById('ux-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'ux-toast';
      toast.style.cssText = 'position:fixed;bottom:5rem;left:50%;transform:translateX(-50%) translateY(20px);z-index:10001;background:rgba(0,212,170,.15);border:1px solid rgba(0,212,170,.4);color:#00d4aa;padding:.5rem 1.2rem;border-radius:10px;font-size:.82rem;font-weight:600;font-family:system-ui,sans-serif;pointer-events:none;opacity:0;transition:opacity .25s,transform .25s;';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity   = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(-50%) translateY(20px)'; }, 2500);
  }

  /* ══════════════════════════════════════════════════════
     4. INJECTION DES BOUTONS FOCUS SUR CHAQUE CARTE
  ══════════════════════════════════════════════════════ */
  function _injectCardButtons() {
    document.querySelectorAll('.chart-card[data-chart-id]').forEach(card => {
      if (card.querySelector('.ux-focus-btn')) return;
      const chartId = card.dataset.chartId;
      const actions = card.querySelector('.chart-title-actions');
      if (!actions) return;

      const focusBtn = document.createElement('button');
      focusBtn.className = 'ux-focus-btn';
      focusBtn.title     = 'Mode plein écran';
      focusBtn.innerHTML = '⛶';
      focusBtn.style.cssText = 'background:transparent;border:1px solid rgba(255,255,255,.08);color:#9fb3c8;border-radius:6px;width:28px;height:28px;font-size:.82rem;cursor:pointer;transition:all .15s;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;';
      focusBtn.addEventListener('mouseenter', () => { focusBtn.style.borderColor='rgba(0,153,255,.4)'; focusBtn.style.color='#0099ff'; });
      focusBtn.addEventListener('mouseleave', () => { focusBtn.style.borderColor='rgba(255,255,255,.08)'; focusBtn.style.color='#9fb3c8'; });
      focusBtn.addEventListener('click', e => { e.stopPropagation(); _openFocus(chartId); });

      // Insérer avant le premier bouton existant (safe)
      const firstBtn = actions.querySelector('button');
      if (firstBtn && firstBtn.parentNode === actions) actions.insertBefore(focusBtn, firstBtn);
      else actions.appendChild(focusBtn);
    });
  }

  /* ══════════════════════════════════════════════════════
     5. BOUTON PARTAGE GLOBAL
  ══════════════════════════════════════════════════════ */
  function _injectShareButton() {
    if (document.getElementById('ux-share-btn')) return;
    const headerActions = document.querySelector('.hdr-actions-main, .hdr-right, .hdr-actions, .header-actions');
    if (!headerActions) return;
    const btn = document.createElement('button');
    btn.id = 'ux-share-btn';
    btn.title   = 'Copier le lien avec filtres actifs';
    btn.innerHTML = '🔗';
    btn.style.cssText = 'background:rgba(0,153,255,.1);border:1px solid rgba(0,153,255,.25);color:#0099ff;border-radius:8px;padding:.35rem .5rem;font-size:.85rem;cursor:pointer;transition:all .15s;';
    btn.addEventListener('click', copyShareLink);
    headerActions.appendChild(btn);
  }

  /* ══════════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════════ */
  function init() {
    if (_isInit) return;
    _isInit = true;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', _setup);
    } else {
      setTimeout(_setup, 300);
    }
    console.log('[DashboardUX] ✅ Prêt (v1.1 — focus via drawImage)');
  }

  function _setup() {
    _injectCardButtons();
    _injectShareButton();
    _restoreFromURL();

    const origUpdate = window.update;
    if (typeof origUpdate === 'function') {
      window.update = function() {
        const r = origUpdate.apply(this, arguments);
        setTimeout(_injectCardButtons, 600);
        return r;
      };
    }
  }

  return { init, openFocus: _openFocus, exportChartPNG, copyShareLink };
})();
}
