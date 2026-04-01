(function () {
  'use strict';

  const STORAGE_KEY = 'dashboard.chart.tableView';
  const titleEl = document.getElementById('title');
  const subtitleEl = document.getElementById('subtitle');
  const metaEl = document.getElementById('meta');
  const theadRow = document.getElementById('thead-row');
  const tbody = document.getElementById('tbody');
  const countEl = document.getElementById('count');
  const search = document.getElementById('search');
  const exportBtn = document.getElementById('export-csv');
  const printBtn = document.getElementById('print-page');

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

  const payload = loadPayload();
  if (!payload || !Array.isArray(payload.headers) || !Array.isArray(payload.rows)) {
    tbody.innerHTML = '<tr><td class="empty">Aucune donnée disponible pour cet onglet.</td></tr>';
    return;
  }

  titleEl.textContent = payload.title || 'Tableau détaillé';
  subtitleEl.textContent = payload.subtitle || 'Vue détaillée ouverte depuis le dashboard';
  document.title = (payload.title || 'Tableau détaillé') + ' — Dashboard';

  (payload.meta || []).forEach(function (item) {
    const pill = document.createElement('div');
    pill.className = 'pill';
    pill.textContent = item;
    metaEl.appendChild(pill);
  });

  let sortState = { index: 0, asc: true };
  payload.headers.forEach(function (header, index) {
    const th = document.createElement('th');
    th.textContent = header;
    th.addEventListener('click', function () {
      sortState.asc = sortState.index === index ? !sortState.asc : true;
      sortState.index = index;
      render();
    });
    theadRow.appendChild(th);
  });

  function currentRows() {
    const query = (search.value || '').trim().toLowerCase();
    let rows = payload.rows.slice();
    if (query) {
      rows = rows.filter(function (row) {
        return row.some(function (cell) {
          return String(cell || '').toLowerCase().includes(query);
        });
      });
    }
    rows.sort(function (a, b) {
      const av = String(a[sortState.index] || '').trim();
      const bv = String(b[sortState.index] || '').trim();
      const an = parseFloat(av.replace(/[^\d.,-]/g, '').replace(',', '.'));
      const bn = parseFloat(bv.replace(/[^\d.,-]/g, '').replace(',', '.'));
      if (isFinite(an) && isFinite(bn)) return sortState.asc ? an - bn : bn - an;
      return sortState.asc ? av.localeCompare(bv, 'fr') : bv.localeCompare(av, 'fr');
    });
    return rows;
  }

  function render() {
    const rows = currentRows();
    countEl.textContent = rows.length + ' ligne' + (rows.length > 1 ? 's' : '');
    tbody.innerHTML = rows.length
      ? rows.map(function (row) {
          return '<tr>' + row.map(function (cell) {
            return '<td>' + escapeHtml(cell) + '</td>';
          }).join('') + '</tr>';
        }).join('')
      : '<tr><td class="empty" colspan="' + payload.headers.length + '">Aucune ligne ne correspond à la recherche.</td></tr>';
  }

  search.addEventListener('input', render);

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
