if (!window.DashboardNotes) {
window.DashboardNotes = (() => {
  'use strict';

  const DB_NAME = 'analytics-dashboard-notes';
  const STORE_NAME = 'notes';
  const STORAGE_KEY = 'analytics-dashboard-notes-fallback';
  const PAGE_KEY = 'chart';
  const REMOTE_SCOPE = 'chart';
  const REMOTE_TYPE = 'dashboard-note';
  const ELIGIBLE_SELECTOR = [
    '.chart-card[data-chart-id]',
    '.chart-title-actions button',
    '.btn-hdr',
    '.ctrl-inp',
    '.kpi',
    '.section-div',
    '.info-icon',
    '#btn-strategic',
    '.obj-title',
    '.obj-year-label',
    '.obj-year-bar-wrap',
    '.obj-input',
    '.obj-input-confirm',
    '#btn-dashboard-share',
    '#btn-dashboard-save',
    '#btn-dashboard-reset',
    '#ce-new-chart-btn'
  ].join(',');

  let _isInit = false;
  let _enabled = false;
  let _db = null;
  let _targets = [];
  let _activeTarget = null;
  let _notesCache = [];
  let _dom = {};
  let _refreshTimer = null;

  function _escapeHtml(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function _slug(v) {
    return String(v || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'target';
  }

  function _nowIso() {
    return new Date().toISOString();
  }

  function _fmtDate(v) {
    if (!v) return 'date inconnue';
    try {
      return new Date(v).toLocaleString('fr-FR', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit'
      });
    } catch (_) {
      return String(v);
    }
  }

  function _scheduleRefresh() {
    clearTimeout(_refreshTimer);
    _refreshTimer = setTimeout(function() {
      _collectTargets();
      _renderTargetBadges();
      if (_activeTarget) _renderTargetNotes();
    }, 120);
  }

  function _ensureStyles() {
    if (document.getElementById('dashboard-notes-styles')) return;
    var style = document.createElement('style');
    style.id = 'dashboard-notes-styles';
    style.textContent = `
body.notes-mode-active {
  cursor: crosshair;
}
body.notes-mode-active .dashboard-note-target {
  position: relative;
  outline: 1px dashed rgba(255, 186, 73, .55);
  outline-offset: 3px;
}
body.notes-mode-active .dashboard-note-target:hover {
  outline-color: rgba(255, 186, 73, .95);
  box-shadow: 0 0 0 4px rgba(255, 186, 73, .12);
}
.dashboard-note-target[data-note-count]:not([data-note-count="0"])::after {
  content: attr(data-note-count);
  position: absolute;
  top: -8px;
  right: -8px;
  min-width: 18px;
  height: 18px;
  border-radius: 99px;
  padding: 0 5px;
  background: linear-gradient(135deg, rgba(255,186,73,.98), rgba(255,125,73,.98));
  color: #09111c;
  border: 1px solid rgba(9,17,28,.35);
  font-size: 10px;
  font-weight: 700;
  font-family: var(--mono, monospace);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  pointer-events: none;
  z-index: 25;
}
#dashboard-notes-panel {
  position: fixed;
  top: 0;
  right: 0;
  width: min(430px, 100vw);
  height: 100vh;
  z-index: 10060;
  background: rgba(8, 15, 24, .98);
  border-left: 1px solid rgba(255,255,255,.08);
  box-shadow: -12px 0 40px rgba(0,0,0,.35);
  transform: translateX(104%);
  transition: transform .25s ease;
  display: flex;
  flex-direction: column;
}
#dashboard-notes-panel.open {
  transform: translateX(0);
}
.dashboard-notes-panel-header {
  padding: 1rem 1rem .85rem;
  border-bottom: 1px solid rgba(255,255,255,.08);
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: .75rem;
}
.dashboard-notes-panel-title {
  font-family: var(--mono, monospace);
  font-size: .72rem;
  text-transform: uppercase;
  letter-spacing: .08em;
  color: #ffba49;
  margin-bottom: .35rem;
}
.dashboard-notes-panel-target {
  color: #dce8f5;
  font-size: .92rem;
  line-height: 1.35;
  font-weight: 600;
}
.dashboard-notes-close,
.dashboard-notes-secondary,
.dashboard-notes-primary {
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,.12);
  cursor: pointer;
  transition: all .18s ease;
}
.dashboard-notes-close {
  background: transparent;
  color: #9fb3c8;
  width: 32px;
  height: 32px;
}
.dashboard-notes-close:hover {
  color: #fff;
  border-color: rgba(255,255,255,.28);
}
.dashboard-notes-body {
  padding: 1rem;
  overflow: auto;
  display: grid;
  gap: 1rem;
}
.dashboard-notes-meta {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: .65rem;
}
.dashboard-notes-field {
  display: grid;
  gap: .35rem;
}
.dashboard-notes-field label {
  color: #9fb3c8;
  font-size: .7rem;
  font-family: var(--mono, monospace);
  text-transform: uppercase;
  letter-spacing: .05em;
}
.dashboard-notes-field input,
.dashboard-notes-field select,
.dashboard-notes-field textarea {
  width: 100%;
  background: rgba(255,255,255,.03);
  color: #dce8f5;
  border: 1px solid rgba(255,255,255,.1);
  border-radius: 8px;
  padding: .65rem .75rem;
  font-size: .82rem;
  font-family: var(--sans, system-ui, sans-serif);
}
.dashboard-notes-field textarea {
  min-height: 96px;
  resize: vertical;
}
.dashboard-notes-actions {
  display: flex;
  gap: .6rem;
  flex-wrap: wrap;
}
.dashboard-notes-primary {
  background: linear-gradient(135deg, rgba(255,186,73,.96), rgba(255,125,73,.96));
  color: #0a121c;
  border-color: rgba(255,186,73,.45);
  padding: .7rem 1rem;
  font-weight: 700;
}
.dashboard-notes-primary:hover {
  transform: translateY(-1px);
}
.dashboard-notes-secondary {
  background: rgba(255,255,255,.04);
  color: #dce8f5;
  padding: .7rem 1rem;
}
.dashboard-notes-secondary:hover {
  border-color: rgba(255,255,255,.24);
}
.dashboard-notes-help {
  color: #6f8499;
  font-size: .78rem;
  line-height: 1.45;
}
.dashboard-notes-list {
  display: grid;
  gap: .7rem;
}
.dashboard-notes-item {
  background: rgba(255,255,255,.03);
  border: 1px solid rgba(255,255,255,.08);
  border-radius: 12px;
  padding: .85rem;
  display: grid;
  gap: .55rem;
}
.dashboard-notes-item-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: .75rem;
  flex-wrap: wrap;
}
.dashboard-notes-badges {
  display: flex;
  gap: .35rem;
  flex-wrap: wrap;
}
.dashboard-notes-pill {
  padding: .16rem .5rem;
  border-radius: 999px;
  font-size: .65rem;
  font-family: var(--mono, monospace);
  border: 1px solid rgba(255,255,255,.1);
  color: #dce8f5;
  background: rgba(255,255,255,.04);
}
.dashboard-notes-item-title {
  color: #fff;
  font-weight: 600;
  font-size: .82rem;
}
.dashboard-notes-item-body {
  color: #b8c7d8;
  font-size: .8rem;
  line-height: 1.55;
  white-space: pre-wrap;
}
.dashboard-notes-item-proposal {
  padding: .65rem .75rem;
  background: rgba(0,153,255,.08);
  border: 1px solid rgba(0,153,255,.18);
  border-radius: 10px;
  color: #dce8f5;
}
.dashboard-notes-item-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: .75rem;
  flex-wrap: wrap;
  color: #7e95ab;
  font-size: .72rem;
}
.dashboard-notes-delete {
  background: transparent;
  border: none;
  color: #ff7a7a;
  cursor: pointer;
  font-size: .74rem;
  padding: 0;
}
.dashboard-notes-empty {
  color: #71849a;
  font-size: .8rem;
  font-family: var(--mono, monospace);
}
.dashboard-notes-inline-tag {
  display: inline-flex;
  align-items: center;
  gap: .35rem;
  padding: .14rem .46rem;
  border-radius: 999px;
  border: 1px solid rgba(255,186,73,.18);
  background: rgba(255,186,73,.08);
  color: #ffba49;
  font-family: var(--mono, monospace);
  font-size: .65rem;
}
@media (max-width: 640px) {
  .dashboard-notes-meta {
    grid-template-columns: 1fr;
  }
}
`;
    document.head.appendChild(style);
  }

  function _openDb() {
    if (_db) return Promise.resolve(_db);
    if (!('indexedDB' in window)) return Promise.resolve(null);

    return new Promise(function(resolve) {
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function(event) {
        var db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          var store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('targetId', 'targetId', { unique: false });
          store.createIndex('pageKey', 'pageKey', { unique: false });
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
      };
      req.onsuccess = function(event) {
        _db = event.target.result;
        resolve(_db);
      };
      req.onerror = function() {
        console.warn('[DashboardNotes] IndexedDB indisponible, fallback localStorage');
        resolve(null);
      };
    });
  }

  async function _loadNotes() {
    if (typeof DashboardSharedStore !== 'undefined') {
      try {
        var remoteDocs = await DashboardSharedStore.list(REMOTE_TYPE, REMOTE_SCOPE);
        _notesCache = remoteDocs
          .map(function(doc) { return doc && doc.payload ? doc.payload : null; })
          .filter(function(note) { return note && note.pageKey === PAGE_KEY; });
        if (_notesCache.length) {
          await _saveNotesCache();
          return _notesCache.slice();
        }
      } catch (err) {
        console.warn('[DashboardNotes] Chargement DB indisponible, fallback local', err);
      }
    }

    var db = await _openDb();
    if (!db) {
      try {
        var raw = localStorage.getItem(STORAGE_KEY);
        _notesCache = raw ? JSON.parse(raw) : [];
      } catch (_) {
        _notesCache = [];
      }
      return _notesCache.slice();
    }

    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_NAME, 'readonly');
      var req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = function() {
        _notesCache = (req.result || []).filter(function(note) {
          return note.pageKey === PAGE_KEY;
        });
        resolve(_notesCache.slice());
      };
      req.onerror = function() {
        reject(req.error);
      };
    });
  }

  async function _saveNotesCache() {
    var db = await _openDb();
    if (!db) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_notesCache));
      return true;
    }

    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_NAME, 'readwrite');
      var store = tx.objectStore(STORE_NAME);
      _notesCache.forEach(function(note) {
        store.put(note);
      });
      tx.oncomplete = function() { resolve(true); };
      tx.onerror = function() { reject(tx.error); };
    });
  }

  async function _upsertNote(note) {
    var existingIndex = _notesCache.findIndex(function(item) { return item.id === note.id; });
    if (existingIndex === -1) _notesCache.push(note);
    else _notesCache.splice(existingIndex, 1, note);

    var db = await _openDb();
    if (!db) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_notesCache));
      if (typeof DashboardSharedStore !== 'undefined') {
        try { await DashboardSharedStore.upsert(REMOTE_TYPE, note.id, note, REMOTE_SCOPE); }
        catch (err) { console.warn('[DashboardNotes] Sync DB note impossible', err); }
      }
      return note;
    }

    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(note);
      tx.oncomplete = async function() {
        if (typeof DashboardSharedStore !== 'undefined') {
          try { await DashboardSharedStore.upsert(REMOTE_TYPE, note.id, note, REMOTE_SCOPE); }
          catch (err) { console.warn('[DashboardNotes] Sync DB note impossible', err); }
        }
        resolve(note);
      };
      tx.onerror = function() { reject(tx.error); };
    });
  }

  async function _deleteNote(id) {
    _notesCache = _notesCache.filter(function(note) { return note.id !== id; });
    var db = await _openDb();
    if (!db) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_notesCache));
      if (typeof DashboardSharedStore !== 'undefined') {
        try { await DashboardSharedStore.remove(REMOTE_TYPE, id, REMOTE_SCOPE); }
        catch (err) { console.warn('[DashboardNotes] Suppression DB note impossible', err); }
      }
      return true;
    }
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = async function() {
        if (typeof DashboardSharedStore !== 'undefined') {
          try { await DashboardSharedStore.remove(REMOTE_TYPE, id, REMOTE_SCOPE); }
          catch (err) { console.warn('[DashboardNotes] Suppression DB note impossible', err); }
        }
        resolve(true);
      };
      tx.onerror = function() { reject(tx.error); };
    });
  }

  function _buildTargetInfo(el) {
    if (!el) return null;

    if (el.matches('.obj-year-label, .obj-year-bar-wrap, .obj-input, .obj-input-confirm')) {
      var year = el.dataset.objYear || (el.closest('.obj-year-block') && el.closest('.obj-year-block').dataset.objYear) || 'unknown-year';
      var role = el.matches('.obj-year-label') ? 'label'
        : el.matches('.obj-year-bar-wrap') ? 'progress'
        : el.matches('.obj-input-confirm') ? 'confirm'
        : 'input';
      var roleLabel = role === 'label' ? 'Libellé année'
        : role === 'progress' ? 'Barre de progression'
        : role === 'confirm' ? 'Validation objectif'
        : 'Champ objectif';
      return {
        element: el,
        targetId: 'objective-year:' + year + ':' + role,
        targetType: 'objective-year',
        label: 'Objectif CA — ' + roleLabel + ' ' + year,
        meta: { year: year, role: role }
      };
    }

    if (el.matches('.obj-title')) {
      return {
        element: el,
        targetId: 'objective:title',
        targetType: 'objective',
        label: el.textContent.replace(/\s+/g, ' ').trim() || 'Objectif CA',
        meta: {}
      };
    }

    if (el.matches('.chart-title-actions button')) {
      var card = el.closest('.chart-card[data-chart-id]');
      var chartId = card ? card.dataset.chartId : 'unknown-chart';
      var actionLabel = el.title || el.textContent.trim() || 'action';
      return {
        element: el,
        targetId: 'chart-action:' + chartId + ':' + _slug(actionLabel),
        targetType: 'chart-action',
        label: actionLabel + ' — ' + (card && card.querySelector('.chart-title') ? card.querySelector('.chart-title').textContent.replace(/\s+/g, ' ').trim() : chartId),
        meta: { chartId: chartId }
      };
    }

    if (el.matches('.chart-card[data-chart-id]')) {
      return {
        element: el,
        targetId: 'chart:' + el.dataset.chartId,
        targetType: 'chart',
        label: el.querySelector('.chart-title') ? el.querySelector('.chart-title').textContent.replace(/\s+/g, ' ').trim() : el.dataset.chartId,
        meta: { chartId: el.dataset.chartId }
      };
    }

    if (el.matches('.ctrl-inp')) {
      var control = el.closest('.ctrl-grp');
      var label = control && control.querySelector('.ctrl-lbl') ? control.querySelector('.ctrl-lbl').textContent.replace(/\s+/g, ' ').trim() : (el.id || el.name || 'champ');
      return {
        element: el,
        targetId: 'control:' + (el.id || _slug(label)),
        targetType: 'control',
        label: label,
        meta: { controlId: el.id || null }
      };
    }

    if (el.matches('.btn-hdr, #btn-strategic')) {
      var btnLabel = el.title || el.textContent.replace(/\s+/g, ' ').trim() || el.id || 'bouton';
      return {
        element: el,
        targetId: 'button:' + (el.id || _slug(btnLabel)),
        targetType: 'button',
        label: btnLabel,
        meta: { buttonId: el.id || null }
      };
    }

    if (el.matches('#btn-dashboard-share, #btn-dashboard-save, #btn-dashboard-reset, #ce-new-chart-btn')) {
      var explicitLabel = el.title || el.textContent.replace(/\s+/g, ' ').trim() || el.id || 'bouton';
      return {
        element: el,
        targetId: 'button:' + (el.id || _slug(explicitLabel)),
        targetType: 'button',
        label: explicitLabel,
        meta: { buttonId: el.id || null }
      };
    }

    if (el.matches('.kpi')) {
      var kpiLabel = el.querySelector('.kpi-lbl') ? el.querySelector('.kpi-lbl').textContent.replace(/\s+/g, ' ').trim() : 'KPI';
      return {
        element: el,
        targetId: 'kpi:' + (el.dataset.ft || _slug(kpiLabel)),
        targetType: 'kpi',
        label: kpiLabel,
        meta: { kpiKey: el.dataset.ft || null }
      };
    }

    if (el.matches('.section-div')) {
      var sectionLabel = el.querySelector('.section-lbl') ? el.querySelector('.section-lbl').textContent.replace(/\s+/g, ' ').trim() : 'Section';
      return {
        element: el,
        targetId: 'section:' + _slug(sectionLabel),
        targetType: 'section',
        label: sectionLabel,
        meta: {}
      };
    }

    if (el.matches('.info-icon')) {
      var infoText = el.getAttribute('data-info') || el.parentElement && el.parentElement.textContent || 'Info';
      infoText = String(infoText).replace(/\s+/g, ' ').trim().slice(0, 80);
      return {
        element: el,
        targetId: 'info:' + _slug(infoText),
        targetType: 'info',
        label: infoText,
        meta: {}
      };
    }

    return null;
  }

  function _collectTargets() {
    _targets = [];
    document.querySelectorAll(ELIGIBLE_SELECTOR).forEach(function(el) {
      var info = _buildTargetInfo(el);
      if (!info || !info.targetId) return;
      el.classList.add('dashboard-note-target');
      el.setAttribute('data-note-target-id', info.targetId);
      el.setAttribute('data-note-target-type', info.targetType);
      _targets.push(info);
    });
  }

  function _targetNotes(targetId) {
    return _notesCache
      .filter(function(note) { return note.pageKey === PAGE_KEY && note.targetId === targetId; })
      .sort(function(a, b) { return String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')); });
  }

  function _renderTargetBadges() {
    var counts = {};
    _notesCache.forEach(function(note) {
      if (note.pageKey !== PAGE_KEY) return;
      counts[note.targetId] = (counts[note.targetId] || 0) + 1;
    });

    _targets.forEach(function(target) {
      var count = counts[target.targetId] || 0;
      target.element.setAttribute('data-note-count', String(count));
      target.element.setAttribute('title', _enabled
        ? ('Mode notes actif — cliquer pour annoter' + (count ? ' (' + count + ' note' + (count > 1 ? 's' : '') + ')' : ''))
        : (target.element.getAttribute('title') || ''));
    });
  }

  function _ensureDom() {
    if (_dom.button && _dom.panel) return;

    var headerActions = document.querySelector('.hdr-right');
    if (headerActions && !document.getElementById('btn-notes-mode')) {
      var btn = document.createElement('button');
      btn.id = 'btn-notes-mode';
      btn.className = 'btn-hdr';
      btn.textContent = '📝 Mode notes';
      btn.title = 'Activer le mode notes et suggestions';
      btn.addEventListener('click', function() {
        _toggleMode();
      });
      headerActions.appendChild(btn);
      _dom.button = btn;
    } else {
      _dom.button = document.getElementById('btn-notes-mode');
    }

    if (!document.getElementById('dashboard-notes-panel')) {
      var panel = document.createElement('aside');
      panel.id = 'dashboard-notes-panel';
      panel.innerHTML = `
        <div class="dashboard-notes-panel-header">
          <div>
            <div class="dashboard-notes-panel-title">Mode notes</div>
            <div class="dashboard-notes-panel-target" id="dashboard-notes-target-name">Sélectionnez un élément à annoter</div>
          </div>
          <button type="button" class="dashboard-notes-close" id="dashboard-notes-close">✕</button>
        </div>
        <div class="dashboard-notes-body">
          <div class="dashboard-notes-help" id="dashboard-notes-help">
            Activez le mode puis cliquez sur un graphique, un bouton, un KPI ou un champ pour enregistrer une observation et proposer une modification.
          </div>
          <form id="dashboard-notes-form" style="display:grid;gap:1rem;">
            <div class="dashboard-notes-field">
              <label for="dashboard-notes-title">Titre</label>
              <input id="dashboard-notes-title" name="title" type="text" placeholder="Ex: tooltip peu clair">
            </div>
            <div class="dashboard-notes-meta">
              <div class="dashboard-notes-field">
                <label for="dashboard-notes-category">Catégorie</label>
                <select id="dashboard-notes-category" name="category">
                  <option value="amelioration">Amélioration</option>
                  <option value="bug">Bug</option>
                  <option value="ux">UX</option>
                  <option value="data">Data</option>
                  <option value="copy">Texte / libellé</option>
                </select>
              </div>
              <div class="dashboard-notes-field">
                <label for="dashboard-notes-priority">Priorité</label>
                <select id="dashboard-notes-priority" name="priority">
                  <option value="moyenne">Moyenne</option>
                  <option value="faible">Faible</option>
                  <option value="haute">Haute</option>
                  <option value="critique">Critique</option>
                </select>
              </div>
              <div class="dashboard-notes-field">
                <label for="dashboard-notes-status">Statut</label>
                <select id="dashboard-notes-status" name="status">
                  <option value="a_etudier">À étudier</option>
                  <option value="a_faire">À faire</option>
                  <option value="en_cours">En cours</option>
                  <option value="fait">Fait</option>
                </select>
              </div>
              <div class="dashboard-notes-field">
                <label for="dashboard-notes-author">Auteur</label>
                <input id="dashboard-notes-author" name="author" type="text" placeholder="Nom / rôle">
              </div>
            </div>
            <div class="dashboard-notes-field">
              <label for="dashboard-notes-body">Observation</label>
              <textarea id="dashboard-notes-body" name="body" placeholder="Ce qui pose problème, ce qui manque, ce qui mérite d'être revu..."></textarea>
            </div>
            <div class="dashboard-notes-field">
              <label for="dashboard-notes-proposal">Proposition de modification</label>
              <textarea id="dashboard-notes-proposal" name="proposal" placeholder="Ce que vous proposez de changer concrètement..."></textarea>
            </div>
            <div class="dashboard-notes-actions">
              <button type="submit" class="dashboard-notes-primary">Enregistrer la note</button>
              <button type="button" class="dashboard-notes-secondary" id="dashboard-notes-export">Exporter les notes</button>
              <button type="button" class="dashboard-notes-secondary" id="dashboard-notes-clear-form">Vider le formulaire</button>
            </div>
          </form>
          <div style="display:grid;gap:.65rem;">
            <div class="dashboard-notes-inline-tag" id="dashboard-notes-target-tag">Aucun élément sélectionné</div>
            <div class="dashboard-notes-list" id="dashboard-notes-list"></div>
          </div>
        </div>
      `;
      document.body.appendChild(panel);
    }

    _dom.panel = document.getElementById('dashboard-notes-panel');
    _dom.form = document.getElementById('dashboard-notes-form');
    _dom.close = document.getElementById('dashboard-notes-close');
    _dom.export = document.getElementById('dashboard-notes-export');
    _dom.clear = document.getElementById('dashboard-notes-clear-form');
    _dom.targetName = document.getElementById('dashboard-notes-target-name');
    _dom.targetTag = document.getElementById('dashboard-notes-target-tag');
    _dom.list = document.getElementById('dashboard-notes-list');
    _dom.help = document.getElementById('dashboard-notes-help');

    _dom.close.addEventListener('click', _closePanel);
    _dom.clear.addEventListener('click', _clearForm);
    _dom.export.addEventListener('click', _exportNotes);
    _dom.form.addEventListener('submit', _submitForm);
  }

  function _setButtonState() {
    if (!_dom.button) return;
    if (_enabled) {
      _dom.button.style.borderColor = 'rgba(255,186,73,.48)';
      _dom.button.style.color = '#ffba49';
      _dom.button.style.background = 'rgba(255,186,73,.08)';
    } else {
      _dom.button.style.borderColor = '';
      _dom.button.style.color = '';
      _dom.button.style.background = '';
    }
  }

  function _toggleMode(forceValue) {
    _enabled = typeof forceValue === 'boolean' ? forceValue : !_enabled;
    document.body.classList.toggle('notes-mode-active', _enabled);
    _setButtonState();
    if (_enabled) {
      _openPanel();
      if (_dom.help) {
        _dom.help.textContent = 'Mode notes actif. Cliquez sur un élément du dashboard pour attacher une note ou une proposition de modification.';
      }
    } else {
      _closePanel();
      if (_dom.help) {
        _dom.help.textContent = 'Activez le mode puis cliquez sur un graphique, un bouton, un KPI ou un champ pour enregistrer une observation et proposer une modification.';
      }
    }
  }

  function _openPanel() {
    if (_dom.panel) _dom.panel.classList.add('open');
  }

  function _closePanel() {
    if (_dom.panel) _dom.panel.classList.remove('open');
  }

  function _clearForm() {
    if (_dom.form) _dom.form.reset();
  }

  function _setActiveTarget(target) {
    _activeTarget = target;
    if (_enabled) _openPanel();

    if (!_dom.targetName || !_dom.targetTag) return;
    if (!target) {
      _dom.targetName.textContent = 'Sélectionnez un élément à annoter';
      _dom.targetTag.textContent = 'Aucun élément sélectionné';
      _dom.list.innerHTML = '<div class="dashboard-notes-empty">Aucune note à afficher.</div>';
      return;
    }

    _dom.targetName.textContent = target.label;
    _dom.targetTag.textContent = target.targetType + ' • ' + target.targetId;
    _renderTargetNotes();
  }

  function _renderTargetNotes() {
    if (!_dom.list) return;
    if (!_activeTarget) {
      _dom.list.innerHTML = '<div class="dashboard-notes-empty">Sélectionnez un élément pour afficher ses notes.</div>';
      return;
    }

    var notes = _targetNotes(_activeTarget.targetId);
    if (!notes.length) {
      _dom.list.innerHTML = '<div class="dashboard-notes-empty">Aucune note enregistrée sur cet élément pour le moment.</div>';
      return;
    }

    _dom.list.innerHTML = notes.map(function(note) {
      var body = note.body ? '<div class="dashboard-notes-item-body">' + _escapeHtml(note.body) + '</div>' : '';
      var proposal = note.proposal ? '<div class="dashboard-notes-item-proposal"><strong>Proposition</strong><br>' + _escapeHtml(note.proposal) + '</div>' : '';
      return `
        <article class="dashboard-notes-item">
          <div class="dashboard-notes-item-head">
            <div class="dashboard-notes-item-title">${_escapeHtml(note.title || 'Note sans titre')}</div>
            <div class="dashboard-notes-badges">
              <span class="dashboard-notes-pill">${_escapeHtml(note.category || 'amelioration')}</span>
              <span class="dashboard-notes-pill">${_escapeHtml(note.priority || 'moyenne')}</span>
              <span class="dashboard-notes-pill">${_escapeHtml(note.status || 'a_etudier')}</span>
            </div>
          </div>
          ${body}
          ${proposal}
          <div class="dashboard-notes-item-footer">
            <span>Par ${_escapeHtml(note.author || 'anonyme')} • ${_fmtDate(note.updatedAt || note.createdAt)}</span>
            <button type="button" class="dashboard-notes-delete" data-note-delete="${_escapeHtml(note.id)}">Supprimer</button>
          </div>
        </article>
      `;
    }).join('');

    _dom.list.querySelectorAll('[data-note-delete]').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        await _deleteNote(btn.getAttribute('data-note-delete'));
        _renderTargetBadges();
        _renderTargetNotes();
      });
    });
  }

  async function _submitForm(event) {
    event.preventDefault();
    if (!_activeTarget) {
      if (typeof notify === 'function') {
        notify('Mode notes', 'Sélectionnez d’abord un élément du dashboard', 'warning', 2200);
      }
      return;
    }

    var fd = new FormData(_dom.form);
    var now = _nowIso();
    var note = {
      id: 'note-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      pageKey: PAGE_KEY,
      targetId: _activeTarget.targetId,
      targetType: _activeTarget.targetType,
      targetLabel: _activeTarget.label,
      title: String(fd.get('title') || '').trim(),
      category: String(fd.get('category') || 'amelioration').trim(),
      priority: String(fd.get('priority') || 'moyenne').trim(),
      status: String(fd.get('status') || 'a_etudier').trim(),
      author: String(fd.get('author') || '').trim(),
      body: String(fd.get('body') || '').trim(),
      proposal: String(fd.get('proposal') || '').trim(),
      createdAt: now,
      updatedAt: now
    };

    if (!note.title && !note.body && !note.proposal) {
      if (typeof notify === 'function') {
        notify('Mode notes', 'Ajoutez au moins un titre, une observation ou une proposition', 'warning', 2200);
      }
      return;
    }

    await _upsertNote(note);
    _clearForm();
    _renderTargetBadges();
    _renderTargetNotes();

    if (typeof notify === 'function') {
      notify('Note enregistrée', _activeTarget.label, 'success', 2200);
    }
  }

  function _exportNotes() {
    var payload = _notesCache
      .filter(function(note) { return note.pageKey === PAGE_KEY; })
      .sort(function(a, b) { return String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')); });

    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'dashboard-notes-' + PAGE_KEY + '.json';
    link.click();
    setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
  }

  function _findTargetFromEvent(event) {
    var targetEl = event.target.closest(ELIGIBLE_SELECTOR);
    if (!targetEl) return null;
    var id = targetEl.getAttribute('data-note-target-id');
    if (!id) return _buildTargetInfo(targetEl);
    return _targets.find(function(item) { return item.targetId === id && item.element === targetEl; }) || _buildTargetInfo(targetEl);
  }

  function _bindGlobalListeners() {
    document.addEventListener('click', function(event) {
      var clickedInsidePanel = event.target.closest('#dashboard-notes-panel, #btn-notes-mode');
      if (!_enabled) {
        if (!clickedInsidePanel && _dom.panel && !_dom.panel.contains(event.target)) _closePanel();
        return;
      }

      if (clickedInsidePanel) return;

      var target = _findTargetFromEvent(event);
      if (!target) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      _setActiveTarget(target);
    }, true);

    document.addEventListener('keydown', function(event) {
      if (event.key === 'Escape' && _enabled) {
        _toggleMode(false);
      }
    });

    var observer = new MutationObserver(_scheduleRefresh);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });

    var originalUpdate = window.update;
    if (typeof originalUpdate === 'function') {
      window.update = function() {
        var result = originalUpdate.apply(this, arguments);
        _scheduleRefresh();
        return result;
      };
    }
  }

  async function init() {
    if (_isInit) return;
    _isInit = true;

    _ensureStyles();
    _ensureDom();
    _collectTargets();
    await _loadNotes();
    _renderTargetBadges();
    _setActiveTarget(null);
    _closePanel();
    _setButtonState();
    _bindGlobalListeners();
    console.log('[DashboardNotes] ✅ Mode notes prêt (IndexedDB/localStorage)');
  }

  return {
    init: init,
    open: function() { _openPanel(); },
    enable: function() { _toggleMode(true); },
    disable: function() { _toggleMode(false); },
    getNotes: function() { return _notesCache.slice(); }
  };
})();
}
