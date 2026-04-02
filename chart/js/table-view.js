(function () {
  'use strict';

  const STORAGE_KEY = 'dashboard.chart.tableView';
  const titleEl = document.getElementById('title');
  const subtitleEl = document.getElementById('subtitle');
  const metaEl = document.getElementById('meta');
  const theadRow = document.getElementById('thead-row');
  const filterRow = document.getElementById('filter-row');
  const tbody = document.getElementById('tbody');
  const countEl = document.getElementById('count');
  const search = document.getElementById('search');
  const viewSelect = document.getElementById('view-select');
  const viewNav = document.getElementById('view-nav');
  const viewNavLabel = document.getElementById('view-nav-label');
  const viewChips = document.getElementById('view-chips');
  const viewPrevBtn = document.getElementById('view-prev');
  const viewNextBtn = document.getElementById('view-next');
  const editBar = document.getElementById('edit-bar');
  const editCopy = document.getElementById('edit-copy');
  const editStatus = document.getElementById('edit-status');
  const toggleEditBtn = document.getElementById('toggle-edit');
  const cancelEditBtn = document.getElementById('cancel-edit');
  const saveDbBtn = document.getElementById('save-db');
  const exportBtn = document.getElementById('export-csv');
  const printBtn = document.getElementById('print-page');
  const resetBtn = document.getElementById('reset-filters');

  function loadPayload() {
    try {
      const params = new URLSearchParams(window.location.search);
      const token = params.get('key');
      const raw = token
        ? (localStorage.getItem(STORAGE_KEY + '.' + token) || localStorage.getItem(STORAGE_KEY))
        : localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeText(value) {
    return String(value == null ? '' : value)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function parseSortable(value) {
    const text = String(value == null ? '' : value).trim();
    if (!text) return { type: 'text', value: '' };

    const numeric = text.replace(/\s/g, '').replace(/€/g, '').replace(/,/g, '.');
    const multiplier = /m$/i.test(numeric) ? 1000000 : /k$/i.test(numeric) ? 1000 : 1;
    const base = numeric.replace(/[mk]$/i, '');
    const parsed = parseFloat(base);
    if (isFinite(parsed)) return { type: 'number', value: parsed * multiplier };

    const parts = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (parts) {
      return { type: 'date', value: new Date(parts[3] + '-' + parts[2] + '-' + parts[1]).getTime() };
    }

    return { type: 'text', value: normalizeText(text) };
  }

  const payload = loadPayload();
  if (!payload) {
    tbody.innerHTML = '<tr><td class="empty">Aucune donnée disponible pour cet onglet.</td></tr>';
    return;
  }
  const views = Array.isArray(payload.views) && payload.views.length
    ? payload.views.filter(function(view) {
        return view && Array.isArray(view.headers) && Array.isArray(view.rows);
      })
    : [];
  let activeViewId = payload.selectedViewId || (views[0] && views[0].id) || '';

  function getActivePayload() {
    if (views.length) {
      return views.find(function(view) { return view.id === activeViewId; }) || views[0];
    }
    return payload;
  }

  if (!getActivePayload() || !Array.isArray(getActivePayload().headers) || !Array.isArray(getActivePayload().rows)) {
    tbody.innerHTML = '<tr><td class="empty">Aucune donnée disponible pour cet onglet.</td></tr>';
    return;
  }

  const state = {
    sortIndex: 0,
    sortAsc: true,
    query: '',
    columnFilters: getActivePayload().headers.map(function () { return ''; }),
    isAdmin: false,
    editMode: false,
    drafts: {}
  };

  function cloneRows(rows) {
    return (Array.isArray(rows) ? rows : []).map(function(row) {
      return Object.assign({}, row || {});
    });
  }

  function getViewKey() {
    return activeViewId || '__root__';
  }

  function getEditablePayload() {
    const activePayload = getActivePayload();
    if (
      activePayload &&
      Array.isArray(activePayload.editableRows) &&
      Array.isArray(activePayload.editableColumns) &&
      activePayload.editableColumns.length
    ) {
      return activePayload;
    }
    return null;
  }

  function getWorkingEditableRows() {
    const editablePayload = getEditablePayload();
    if (!editablePayload) return null;
    const key = getViewKey();
    if (!Array.isArray(state.drafts[key])) {
      state.drafts[key] = cloneRows(editablePayload.editableRows);
    }
    return state.drafts[key];
  }

  function getActiveHeaders() {
    const editablePayload = getEditablePayload();
    if (editablePayload) {
      return editablePayload.editableColumns.map(function(column) { return column.key; });
    }
    return getActivePayload().headers;
  }

  function resetStateForView() {
    state.sortIndex = 0;
    state.sortAsc = true;
    state.query = '';
    search.value = '';
    state.columnFilters = getActiveHeaders().map(function () { return ''; });
    state.editMode = false;
  }

  function renderHeaderMeta(activePayload) {
    titleEl.textContent = activePayload.title || 'Tableau detaille';
    subtitleEl.textContent = activePayload.subtitle || 'Vue detaillee ouverte depuis le dashboard';
    document.title = (activePayload.title || 'Tableau detaille') + ' - Dashboard';
    metaEl.innerHTML = '';
    (activePayload.meta || []).forEach(function(item) {
      const pill = document.createElement('div');
      pill.className = 'pill';
      pill.textContent = item;
      metaEl.appendChild(pill);
    });
  }

  function renderViewSelect() {
    if (!viewSelect) return;
    if (!views.length) {
      if (viewNav) viewNav.hidden = true;
      viewSelect.innerHTML = '';
      return;
    }
    if (viewNav) viewNav.hidden = false;
    viewSelect.innerHTML = views.map(function(view) {
      const label = view.selectorLabel || view.title || 'Vue';
      const selected = view.id === activeViewId ? ' selected' : '';
      return '<option value="' + escapeHtml(view.id || '') + '"' + selected + '>' + escapeHtml(label) + '</option>';
    }).join('');
    const activeView = getActivePayload();
    if (viewNavLabel && activeView) {
      const activeLabel = activeView.selectorLabel || activeView.title || 'Vue';
      viewNavLabel.textContent = activeLabel + ' (' + (views.findIndex(function(view) { return view.id === activeViewId; }) + 1) + '/' + views.length + ')';
    }
    if (viewPrevBtn) viewPrevBtn.disabled = views.length <= 1;
    if (viewNextBtn) viewNextBtn.disabled = views.length <= 1;
    if (viewChips) {
      viewChips.innerHTML = views.map(function(view) {
        const active = view.id === activeViewId ? ' is-active' : '';
        const label = view.selectorLabel || view.title || 'Vue';
        return '<button type="button" class="view-chip' + active + '" data-view-id="' + escapeHtml(view.id || '') + '">' + escapeHtml(label) + '</button>';
      }).join('');
      Array.prototype.forEach.call(viewChips.querySelectorAll('.view-chip'), function(btn) {
        btn.addEventListener('click', function() {
          activateView(btn.getAttribute('data-view-id') || '');
        });
      });
    }
  }

  function activateView(viewId) {
    const nextViewId = viewId || (views[0] && views[0].id) || '';
    if (!nextViewId || nextViewId === activeViewId) return;
    activeViewId = nextViewId;
    resetStateForView();
    render();
  }

  function stepView(direction) {
    if (!views.length) return;
    const currentIndex = Math.max(0, views.findIndex(function(view) { return view.id === activeViewId; }));
    const nextIndex = (currentIndex + direction + views.length) % views.length;
    activateView(views[nextIndex] && views[nextIndex].id);
  }

  function renderHeaders() {
    const headers = getActiveHeaders();
    theadRow.innerHTML = '';
    filterRow.innerHTML = '';

    headers.forEach(function (header, index) {
      const th = document.createElement('th');
      const sorted = state.sortIndex === index;
      const arrow = sorted ? (state.sortAsc ? '▲' : '▼') : '↕';
      th.innerHTML = escapeHtml(header) + '<span class="sort-indicator">' + arrow + '</span>';
      th.addEventListener('click', function () {
        state.sortAsc = state.sortIndex === index ? !state.sortAsc : true;
        state.sortIndex = index;
        render();
      });
      theadRow.appendChild(th);

      const filterTh = document.createElement('th');
      const input = document.createElement('input');
      input.className = 'column-filter';
      input.type = 'text';
      input.placeholder = 'Filtrer';
      input.value = state.columnFilters[index] || '';
      input.setAttribute('data-index', String(index));
      input.addEventListener('input', function () {
        state.columnFilters[index] = input.value || '';
        render();
      });
      filterTh.appendChild(input);
      filterRow.appendChild(filterTh);
    });
  }

  function buildWorkingRows() {
    const editablePayload = getEditablePayload();
    if (editablePayload) {
      const columns = editablePayload.editableColumns || [];
      const rows = getWorkingEditableRows() || [];
      return rows.map(function(row, rowIndex) {
        return {
          rowIndex: rowIndex,
          cells: columns.map(function(column) {
            return row && row[column.key] != null ? String(row[column.key]) : '';
          })
        };
      });
    }
    return (getActivePayload().rows || []).map(function(row, rowIndex) {
      return { rowIndex: rowIndex, cells: Array.isArray(row) ? row.slice() : [] };
    });
  }

  function currentRows() {
    const headers = getActiveHeaders();
    const query = normalizeText(state.query || '');
    let rows = buildWorkingRows();

    rows = rows.filter(function (row) {
      const globalMatch = !query || row.cells.some(function (cell) {
        return normalizeText(cell).indexOf(query) !== -1;
      });
      if (!globalMatch) return false;

      return row.cells.every(function (cell, index) {
        const filterValue = normalizeText(state.columnFilters[index] || '');
        if (!filterValue) return true;
        return normalizeText(cell).indexOf(filterValue) !== -1;
      });
    });

    rows.sort(function (a, b) {
      const av = parseSortable(a.cells[state.sortIndex]);
      const bv = parseSortable(b.cells[state.sortIndex]);
      if (av.type === bv.type && av.value < bv.value) return state.sortAsc ? -1 : 1;
      if (av.type === bv.type && av.value > bv.value) return state.sortAsc ? 1 : -1;
      const as = normalizeText(a.cells[state.sortIndex]);
      const bs = normalizeText(b.cells[state.sortIndex]);
      return state.sortAsc ? as.localeCompare(bs, 'fr') : bs.localeCompare(as, 'fr');
    });

    return rows;
  }

  function updateEditBar() {
    const editablePayload = getEditablePayload();
    const canEdit = !!(editablePayload && state.isAdmin);
    if (editBar) editBar.hidden = !canEdit;
    if (!canEdit) return;

    const workingRows = getWorkingEditableRows() || [];
    const originalRows = editablePayload.editableRows || [];
    let dirtyCount = 0;
    workingRows.forEach(function(row, index) {
      if (JSON.stringify(row || {}) !== JSON.stringify(originalRows[index] || {})) dirtyCount += 1;
    });

    if (editCopy) {
      editCopy.textContent = state.editMode
        ? 'Les cellules sont modifiables. Vous pouvez corriger puis sauvegarder le dataset en base.'
        : 'Ouvrez le mode édition pour corriger les lignes visibles du dataset.';
    }
    if (editStatus) {
      editStatus.textContent = dirtyCount
        ? dirtyCount + ' ligne' + (dirtyCount > 1 ? 's' : '') + ' modifiée' + (dirtyCount > 1 ? 's' : '')
        : (state.editMode ? 'Mode édition actif' : 'Aucune modification');
    }
    if (toggleEditBtn) toggleEditBtn.textContent = state.editMode ? '👁️ Quitter l’édition' : '✏️ Modifier';
    if (cancelEditBtn) cancelEditBtn.hidden = !state.editMode;
    if (saveDbBtn) {
      saveDbBtn.hidden = !state.editMode;
      saveDbBtn.disabled = !dirtyCount;
    }
    document.body.classList.toggle('is-editing', !!state.editMode);
  }

  async function refreshAuth() {
    if (!window.AuthClient || typeof window.AuthClient.status !== 'function') return;
    try {
      const auth = await window.AuthClient.status();
      state.isAdmin = !!(auth && auth.ok && auth.data && auth.data.isAdmin);
    } catch (_) {
      state.isAdmin = false;
    }
  }

  async function saveEditsToDb() {
    const editablePayload = getEditablePayload();
    if (!editablePayload || !state.isAdmin) return;

    const originalRows = editablePayload.editableRows || [];
    const workingRows = getWorkingEditableRows() || [];
    const changes = [];
    workingRows.forEach(function(row, index) {
      const before = originalRows[index] || {};
      const after = row || {};
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        changes.push({ original: before, updated: after });
      }
    });

    if (!changes.length) {
      updateEditBar();
      return;
    }

    if (saveDbBtn) saveDbBtn.disabled = true;
    if (editStatus) editStatus.textContent = 'Sauvegarde en base en cours…';

    const response = await fetch('/.netlify/functions/save-dataset-table-admin', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        datasetKey: editablePayload.datasetKey || payload.datasetKey || 'saip-main',
        sourceName: editablePayload.sourceName || payload.sourceName || 'Tableau Excel',
        changes: changes
      })
    });
    const data = await response.json();
    if (!response.ok || !data || !data.ok) {
      throw new Error(data && data.error ? data.error : ('HTTP ' + response.status));
    }

    editablePayload.editableRows = cloneRows(workingRows);
    editablePayload.rows = workingRows.map(function(row) {
      return (editablePayload.editableColumns || []).map(function(column) {
        return row && row[column.key] != null ? String(row[column.key]) : '';
      });
    });
    state.editMode = false;
    updateEditBar();
    render();
  }

  function render() {
    const activePayload = getActivePayload();
    renderHeaderMeta(activePayload);
    renderViewSelect();
    renderHeaders();
    const rows = currentRows();
    const totalRows = buildWorkingRows().length;
    countEl.textContent = rows.length + ' ligne' + (rows.length > 1 ? 's' : '') + ' / ' + totalRows;
    tbody.innerHTML = rows.length
      ? rows.map(function (row) {
          const editablePayload = getEditablePayload();
          return '<tr>' + row.cells.map(function (cell, columnIndex) {
            const header = getActiveHeaders()[columnIndex];
            if (state.editMode && editablePayload) {
              return '<td data-editable="1"><input class="cell-editor" type="text" data-row-index="' + row.rowIndex + '" data-column-key="' + escapeHtml(header) + '" value="' + escapeHtml(cell) + '"></td>';
            }
            return '<td>' + escapeHtml(cell) + '</td>';
          }).join('') + '</tr>';
        }).join('')
      : '<tr><td class="empty" colspan="' + getActiveHeaders().length + '">Aucune ligne ne correspond aux filtres en cours.</td></tr>';
    updateEditBar();
  }

  search.addEventListener('input', function () {
    state.query = search.value || '';
    render();
  });

  resetBtn.addEventListener('click', function () {
    resetStateForView();
    render();
  });

  if (viewSelect) {
    viewSelect.addEventListener('change', function() {
      activateView(viewSelect.value || (views[0] && views[0].id) || '');
    });
  }

  if (viewPrevBtn) {
    viewPrevBtn.addEventListener('click', function() {
      stepView(-1);
    });
  }

  if (viewNextBtn) {
    viewNextBtn.addEventListener('click', function() {
      stepView(1);
    });
  }

  if (tbody) {
    tbody.addEventListener('input', function(event) {
      const input = event.target;
      if (!input || !input.classList || !input.classList.contains('cell-editor')) return;
      const editablePayload = getEditablePayload();
      const workingRows = getWorkingEditableRows();
      if (!editablePayload || !workingRows) return;
      const rowIndex = Number(input.getAttribute('data-row-index'));
      const columnKey = input.getAttribute('data-column-key') || '';
      if (!Number.isInteger(rowIndex) || rowIndex < 0 || !workingRows[rowIndex]) return;
      workingRows[rowIndex][columnKey] = input.value;
      updateEditBar();
    });
  }

  if (toggleEditBtn) {
    toggleEditBtn.addEventListener('click', function() {
      if (!state.isAdmin || !getEditablePayload()) return;
      state.editMode = !state.editMode;
      render();
    });
  }

  if (cancelEditBtn) {
    cancelEditBtn.addEventListener('click', function() {
      const editablePayload = getEditablePayload();
      if (!editablePayload) return;
      state.drafts[getViewKey()] = cloneRows(editablePayload.editableRows || []);
      state.editMode = false;
      render();
    });
  }

  if (saveDbBtn) {
    saveDbBtn.addEventListener('click', async function() {
      try {
        await saveEditsToDb();
      } catch (err) {
        if (editStatus) editStatus.textContent = err && err.message ? err.message : 'Erreur de sauvegarde';
        if (saveDbBtn) saveDbBtn.disabled = false;
      }
    });
  }

  exportBtn.addEventListener('click', function () {
    const activePayload = getActivePayload();
    const rows = [getActiveHeaders()].concat(currentRows().map(function(row) { return row.cells; }));
    const csv = rows.map(function (row) {
      return row.map(function (cell) {
        const value = String(cell == null ? '' : cell).replace(/"/g, '""');
        return '"' + value + '"';
      }).join(';');
    }).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = (activePayload.title || 'tableau').replace(/[^\w\-]+/g, '_') + '.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  });

  printBtn.addEventListener('click', function () {
    window.print();
  });

  async function init() {
    if (views.length && !activeViewId) activeViewId = views[0].id || '';
    await refreshAuth();
    render();
  }

  init();
})();
