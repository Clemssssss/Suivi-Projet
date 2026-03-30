(function () {
  'use strict';

  var strategicMode = false; // false = Volume, true = Valeur (€)

  var btn = document.getElementById('btn-strategic');

  function updateBtn() {
    btn.textContent = strategicMode ? '💰 Mode Valeur (€)' : '📈 Mode Volume';
    btn.style.background = strategicMode
      ? 'linear-gradient(135deg,#f59e0b,#d97706)'
      : 'linear-gradient(135deg,#6366f1,#4f46e5)';
  }

  btn.addEventListener('click', function() {
    strategicMode = !strategicMode;
    if (strategicMode) {
      AE.setCAMode('ca_gagne'); // CA gagné = projets obtenus seulement
      notify('Mode Stratégique', 'Affichage en valeur €', 'info', 2000);
    } else {
      AE.setCAMode('Bud'); // [CORRIGÉ v2] ca_etudie → Bud (source unique)
      notify('Mode Volume', 'Affichage en nombre de projets', 'info', 2000);
    }
    updateBtn();
    if (typeof update === 'function') update();
  });

  updateBtn();
  window._strategicMode = { isValeur: function(){ return strategicMode; } };
})();
