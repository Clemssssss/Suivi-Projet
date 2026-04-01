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
  if (!payload || !Array.isArray(payload.headers) || !Array.isArray(payload.rows)) {
    tbody.innerHTML = '<tr><td class="empty">Aucune donnée disponible pour cet onglet.</td></tr>';
    return;
  }

  titleEl.textContent = payload.title || 'Tableau detaille';
  subtitleEl.textContent = payload.subtitle || 'Vue detaillee ouverte depuis le dashboard';
  document.title = (payload.title || 'Tableau detaille') + ' - Dashboard';

  (payload.meta || []).forEach(function (item) {
    const pill = document.createElement('div');
    pill.className = 'pill';
    pill.textContent = item;
    metaEl.appendChild(pill);
  });

  const state = {
    sortIndex: 0,
    sortAsc: true,
    query: '',
    columnFilters: payload.headers.map(function () { return ''; })
  };

  function renderHeaders() {
    theadRow.innerHTML = '';
    filterRow.innerHTML = '';

    payload.headers.forEach(function (header, index) {
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

  function currentRows() {
    const query = normalizeText(state.query || '');
    let rows = payload.rows.slice();

    rows = rows.filter(function (row) {
      const globalMatch = !query || row.some(function (cell) {
        return normalizeText(cell).indexOf(query) !== -1;
      });
      if (!globalMatch) return false;

      return row.every(function (cell, index) {
        const filterValue = normalizeText(state.columnFilters[index] || '');
        if (!filterValue) return true;
        return normalizeText(cell).indexOf(filterValue) !== -1;
      });
    });

    rows.sort(function (a, b) {
      const av = parseSortable(a[state.sortIndex]);
      const bv = parseSortable(b[state.sortIndex]);
      if (av.type === bv.type && av.value < bv.value) return state.sortAsc ? -1 : 1;
      if (av.type === bv.type && av.value > bv.value) return state.sortAsc ? 1 : -1;
      const as = normalizeText(a[state.sortIndex]);
      const bs = normalizeText(b[state.sortIndex]);
      return state.sortAsc ? as.localeCompare(bs, 'fr') : bs.localeCompare(as, 'fr');
    });

    return rows;
  }

  function render() {
    renderHeaders();
    const rows = currentRows();
    countEl.textContent = rows.length + ' ligne' + (rows.length > 1 ? 's' : '') + ' / ' + payload.rows.length;
    tbody.innerHTML = rows.length
      ? rows.map(function (row) {
          return '<tr>' + row.map(function (cell) {
            return '<td>' + escapeHtml(cell) + '</td>';
          }).join('') + '</tr>';
        }).join('')
      : '<tr><td class="empty" colspan="' + payload.headers.length + '">Aucune ligne ne correspond aux filtres en cours.</td></tr>';
  }

  search.addEventListener('input', function () {
    state.query = search.value || '';
    render();
  });

  resetBtn.addEventListener('click', function () {
    state.query = '';
    state.columnFilters = payload.headers.map(function () { return ''; });
    search.value = '';
    render();
  });

  exportBtn.addEventListener('click', function () {
    const rows = [payload.headers].concat(currentRows());
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
    link.download = (payload.title || 'tableau').replace(/[^\w\-]+/g, '_') + '.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  });

  printBtn.addEventListener('click', function () {
    window.print();
  });

  render();
})();
