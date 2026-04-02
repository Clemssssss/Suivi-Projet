(function() {
  'use strict';

  function isDebugEnabled() {
    var host = String(window.location.hostname || '').toLowerCase();
    return host === 'localhost' || host === '127.0.0.1';
  }

  if (isDebugEnabled()) {
    window.__DASHBOARD_DEBUG__ = true;
    return;
  }

  window.__DASHBOARD_DEBUG__ = false;

  var original = {
    error: console.error ? console.error.bind(console) : function() {}
  };

  console.log = function() {};
  console.info = function() {};
  console.debug = function() {};
  console.warn = function() {};
  console.trace = function() {};

  console.error = function() {
    return original.error.apply(null, arguments);
  };
})();
