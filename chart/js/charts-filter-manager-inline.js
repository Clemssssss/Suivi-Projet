if (!window.FilterManager) {
  window.FilterManager = (() => {
  'use strict';
  let _filters = []; // [{ type, value, label }]
  const _subs = [];

  function toggleFilter(type, value, label) {
    const idx = _filters.findIndex(f => f.type === type && f.value === value);
    if (idx !== -1) {
      _filters.splice(idx, 1);
    } else {
      // Un seul filtre par type
      _filters = _filters.filter(f => f.type !== type);
      _filters.push({ type, value, label: label || String(value) });
    }
    _push();
  }

  function setFilter(type, value, label) {
    _filters = _filters.filter(f => f.type !== type);
    if (value != null) _filters.push({ type, value, label: label || String(value) });
    _push();
  }

  function removeFilter(type) {
    _filters = _filters.filter(f => f.type !== type);
    _push();
  }

  function clearFiltersByType(type) { removeFilter(type); }

  function clearAll() { _filters = []; _push(); }

  function getFilters() { return _filters.slice(); }

  function hasFilter(type, value) {
    return _filters.some(f => f.type === type && f.value === value);
  }

  function subscribe(fn) { _subs.push(fn); }

  function _push() {
    _subs.forEach(fn => { try { fn(_filters.slice()); } catch(e) { console.error('[FilterManager]', e); } });
  }

  return { toggleFilter, setFilter, removeFilter, clearFiltersByType, clearAll, getFilters, hasFilter, subscribe };
})();
}
