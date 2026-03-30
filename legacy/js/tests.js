/* =====================================================
   TESTS ET VÉRIFICATIONS DU MODULE TRELLO
   
   Script de validation pour s'assurer que le module
   fonctionne correctement avec votre application.
===================================================== */

// =====================================================
// TESTS DE PRÉ-INITIALISATION
// =====================================================

/**
 * Vérifier que l'environnement est prêt pour le module Trello
 */
function runPreInitializationTests() {
  console.group('🧪 Tests de pré-initialisation');
  
  const results = {
    passed: 0,
    failed: 0,
    warnings: 0
  };

  // Test 1 : ALL existe
  if (typeof ALL !== 'undefined') {
    console.log('✅ Test 1/6 : ALL est défini');
    results.passed++;
  } else {
    console.error('❌ Test 1/6 : ALL n\'est pas défini');
    results.failed++;
  }

  // Test 2 : ALL est un array
  if (Array.isArray(ALL)) {
    console.log('✅ Test 2/6 : ALL est un array');
    results.passed++;
  } else {
    console.error('❌ Test 2/6 : ALL n\'est pas un array');
    results.failed++;
  }

  // Test 3 : ALL contient des données
  if (ALL && ALL.length > 0) {
    console.log(`✅ Test 3/6 : ALL contient ${ALL.length} projets`);
    results.passed++;
  } else {
    console.warn('⚠️ Test 3/6 : ALL est vide');
    results.warnings++;
  }

  // Test 4 : save() existe
  if (typeof save === 'function') {
    console.log('✅ Test 4/6 : save() est défini');
    results.passed++;
  } else {
    console.warn('⚠️ Test 4/6 : save() n\'est pas défini (recommandé)');
    results.warnings++;
  }

  // Test 5 : formatDateDisplay() existe
  if (typeof formatDateDisplay === 'function') {
    console.log('✅ Test 5/6 : formatDateDisplay() est défini');
    results.passed++;
  } else {
    console.warn('⚠️ Test 5/6 : formatDateDisplay() n\'est pas défini (optionnel)');
    results.warnings++;
  }

  // Test 6 : Structure des données
  if (ALL && ALL.length > 0) {
    const firstProject = ALL[0];
    const requiredFields = ['id', 'projet', 'etat_correspondance_trello'];
    const hasAllFields = requiredFields.every(field => field in firstProject);
    
    if (hasAllFields) {
      console.log('✅ Test 6/6 : Structure des données correcte');
      results.passed++;
    } else {
      console.error('❌ Test 6/6 : Structure des données incorrecte');
      console.log('Champs requis:', requiredFields);
      console.log('Projet exemple:', firstProject);
      results.failed++;
    }
  } else {
    console.warn('⚠️ Test 6/6 : Impossible de vérifier la structure (ALL vide)');
    results.warnings++;
  }

  // Résumé
  console.log('\n📊 Résumé des tests :');
  console.log(`   ✅ Réussis : ${results.passed}`);
  console.log(`   ❌ Échoués : ${results.failed}`);
  console.log(`   ⚠️ Avertissements : ${results.warnings}`);

  if (results.failed === 0) {
    console.log('\n✨ L\'environnement est prêt pour le module Trello !');
  } else {
    console.log('\n⚠️ Corrigez les erreurs avant d\'initialiser le module.');
  }

  console.groupEnd();
  
  return results.failed === 0;
}


// =====================================================
// TESTS POST-INITIALISATION
// =====================================================

/**
 * Vérifier que le module est correctement initialisé
 */
function runPostInitializationTests() {
  console.group('🧪 Tests post-initialisation');
  
  const results = {
    passed: 0,
    failed: 0,
    warnings: 0
  };

  // Test 1 : initTrelloView existe
  if (typeof initTrelloView === 'function') {
    console.log('✅ Test 1/5 : initTrelloView() est disponible');
    results.passed++;
  } else {
    console.error('❌ Test 1/5 : initTrelloView() n\'existe pas');
    results.failed++;
  }

  // Test 2 : toggleTrelloView existe
  if (typeof toggleTrelloView === 'function') {
    console.log('✅ Test 2/5 : toggleTrelloView() est disponible');
    results.passed++;
  } else {
    console.error('❌ Test 2/5 : toggleTrelloView() n\'existe pas');
    results.failed++;
  }

  // Test 3 : Container Trello existe
  const container = document.getElementById('trello-view');
  if (container) {
    console.log('✅ Test 3/5 : Container Trello créé');
    results.passed++;
  } else {
    console.error('❌ Test 3/5 : Container Trello non créé');
    results.failed++;
  }

  // Test 4 : Styles injectés
  const styles = document.getElementById('trello-view-styles');
  if (styles) {
    console.log('✅ Test 4/5 : Styles CSS injectés');
    results.passed++;
  } else {
    console.error('❌ Test 4/5 : Styles CSS non injectés');
    results.failed++;
  }

  // Test 5 : Bouton de bascule
  const button = document.querySelector('#toggle-trello, [id*="trello"]');
  if (button) {
    console.log('✅ Test 5/5 : Bouton de bascule trouvé');
    results.passed++;
  } else {
    console.warn('⚠️ Test 5/5 : Bouton de bascule non trouvé');
    results.warnings++;
  }

  // Résumé
  console.log('\n📊 Résumé des tests :');
  console.log(`   ✅ Réussis : ${results.passed}`);
  console.log(`   ❌ Échoués : ${results.failed}`);
  console.log(`   ⚠️ Avertissements : ${results.warnings}`);

  if (results.failed === 0) {
    console.log('\n✨ Le module Trello est correctement initialisé !');
  } else {
    console.log('\n⚠️ Le module a des problèmes d\'initialisation.');
  }

  console.groupEnd();
  
  return results.failed === 0;
}


// =====================================================
// TESTS DE FONCTIONNALITÉ
// =====================================================

/**
 * Tester les fonctionnalités du module
 */
function runFunctionalityTests() {
  console.group('🧪 Tests de fonctionnalité');
  
  // Test 1 : Ouverture/Fermeture
  console.log('Test 1/3 : Ouverture/Fermeture de la vue');
  try {
    const container = document.getElementById('trello-view');
    const initialState = container.style.display;
    
    toggleTrelloView();
    const afterToggle1 = container.style.display;
    
    toggleTrelloView();
    const afterToggle2 = container.style.display;
    
    if (afterToggle1 !== initialState && afterToggle2 === initialState) {
      console.log('✅ Bascule fonctionne correctement');
    } else {
      console.error('❌ Problème avec la bascule');
    }
  } catch (error) {
    console.error('❌ Erreur lors du test de bascule:', error);
  }

  // Test 2 : Modification de données
  console.log('\nTest 2/3 : Modification de données');
  try {
    const originalLength = ALL.length;
    const testProject = {
      id: 999999,
      projet: "TEST_PROJECT",
      etat_correspondance_trello: "Offre remise",
      societe: "TEST",
      zone_geo: "Test",
      consultation_cahors: "Non",
      creation: "2026-01-01",
      echeance: "2026-12-31",
      notes: "Test"
    };
    
    ALL.push(testProject);
    
    if (ALL.length === originalLength + 1) {
      console.log('✅ Modification de ALL fonctionne');
      
      // Nettoyer
      ALL.pop();
      console.log('✅ Nettoyage effectué');
    } else {
      console.error('❌ Problème avec la modification de ALL');
    }
  } catch (error) {
    console.error('❌ Erreur lors du test de modification:', error);
  }

  // Test 3 : Sauvegarde
  console.log('\nTest 3/3 : Sauvegarde');
  try {
    if (typeof save === 'function') {
      save();
      console.log('✅ save() s\'exécute sans erreur');
    } else {
      console.warn('⚠️ save() non disponible');
    }
  } catch (error) {
    console.error('❌ Erreur lors de save():', error);
  }

  console.groupEnd();
}


// =====================================================
// TESTS DE PERFORMANCE
// =====================================================

/**
 * Vérifier les performances du module
 */
function runPerformanceTests() {
  console.group('🧪 Tests de performance');
  
  // Test 1 : Temps de rendu
  console.log('Test 1/2 : Temps de rendu initial');
  const start = performance.now();
  
  try {
    toggleTrelloView(); // Ouvrir
    const end = performance.now();
    const duration = end - start;
    
    console.log(`⏱️ Temps de rendu : ${duration.toFixed(2)}ms`);
    
    if (duration < 1000) {
      console.log('✅ Performance excellente (< 1s)');
    } else if (duration < 3000) {
      console.log('⚠️ Performance acceptable (1-3s)');
    } else {
      console.warn('⚠️ Performance lente (> 3s)');
    }
    
    toggleTrelloView(); // Refermer
  } catch (error) {
    console.error('❌ Erreur lors du test de performance:', error);
  }

  // Test 2 : Utilisation mémoire
  console.log('\nTest 2/2 : Utilisation mémoire');
  if (performance.memory) {
    const usedMemory = (performance.memory.usedJSHeapSize / 1048576).toFixed(2);
    console.log(`💾 Mémoire utilisée : ${usedMemory} MB`);
  } else {
    console.log('ℹ️ Informations mémoire non disponibles');
  }

  console.groupEnd();
}


// =====================================================
// RAPPORT COMPLET
// =====================================================

/**
 * Générer un rapport complet de tous les tests
 */
function generateFullReport() {
  console.clear();
  console.log('%c🧪 RAPPORT COMPLET DES TESTS - MODULE TRELLO', 'font-size: 16px; font-weight: bold; color: #3b82f6');
  console.log('='.repeat(60));
  
  // Informations système
  console.log('\n📱 Informations système :');
  console.log(`   Navigateur : ${navigator.userAgent}`);
  console.log(`   Langue : ${navigator.language}`);
  console.log(`   Date : ${new Date().toLocaleString()}`);
  
  // Exécuter tous les tests
  console.log('\n' + '='.repeat(60));
  const preInit = runPreInitializationTests();
  
  if (preInit) {
    console.log('\n' + '='.repeat(60));
    const postInit = runPostInitializationTests();
    
    if (postInit) {
      console.log('\n' + '='.repeat(60));
      runFunctionalityTests();
      
      console.log('\n' + '='.repeat(60));
      runPerformanceTests();
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('%c✅ RAPPORT TERMINÉ', 'font-size: 14px; font-weight: bold; color: #10b981');
}


// =====================================================
// TESTS INTERACTIFS
// =====================================================

/**
 * Menu interactif pour lancer des tests individuels
 */
function showTestMenu() {
  console.clear();
  console.log('%c📋 MENU DE TESTS TRELLO', 'font-size: 16px; font-weight: bold');
  console.log('\nCommandes disponibles :');
  console.log('  runPreInitializationTests()  - Tests avant initialisation');
  console.log('  runPostInitializationTests() - Tests après initialisation');
  console.log('  runFunctionalityTests()      - Tests de fonctionnalité');
  console.log('  runPerformanceTests()        - Tests de performance');
  console.log('  generateFullReport()         - Rapport complet');
  console.log('\nPour voir ce menu à nouveau : showTestMenu()');
}


// =====================================================
// AUTO-EXPORT DES FONCTIONS
// =====================================================

// Exposer toutes les fonctions pour utilisation dans la console
window.runPreInitializationTests = runPreInitializationTests;
window.runPostInitializationTests = runPostInitializationTests;
window.runFunctionalityTests = runFunctionalityTests;
window.runPerformanceTests = runPerformanceTests;
window.generateFullReport = generateFullReport;
window.showTestMenu = showTestMenu;


// =====================================================
// EXÉCUTION AUTOMATIQUE
// =====================================================

// Si ce fichier est chargé après l'initialisation du module,
// afficher le menu automatiquement
if (document.readyState === 'complete') {
  showTestMenu();
} else {
  window.addEventListener('load', showTestMenu);
}


// =====================================================
// HELPER : STATISTIQUES SUR LES DONNÉES
// =====================================================

/**
 * Afficher des statistiques sur les données
 */
function showDataStatistics() {
  if (!ALL || !Array.isArray(ALL)) {
    console.error('❌ ALL n\'est pas disponible');
    return;
  }

  console.group('📊 Statistiques des données');
  
  console.log(`Total de projets : ${ALL.length}`);
  
  // Par statut
  const byStatus = {};
  ALL.forEach(p => {
    const status = p.etat_correspondance_trello || 'Non défini';
    byStatus[status] = (byStatus[status] || 0) + 1;
  });
  
  console.log('\nPar statut :');
  Object.entries(byStatus)
    .sort((a, b) => b[1] - a[1])
    .forEach(([status, count]) => {
      console.log(`   ${status} : ${count}`);
    });
  
  // Par société
  const bySociete = {};
  ALL.forEach(p => {
    const societe = p.societe || 'Non défini';
    bySociete[societe] = (bySociete[societe] || 0) + 1;
  });
  
  console.log('\nTop 5 sociétés :');
  Object.entries(bySociete)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .forEach(([societe, count]) => {
      console.log(`   ${societe} : ${count}`);
    });
  
  // Par zone
  const byZone = {};
  ALL.forEach(p => {
    const zone = p.zone_geo || 'Non défini';
    byZone[zone] = (byZone[zone] || 0) + 1;
  });
  
  console.log('\nPar zone géographique :');
  Object.entries(byZone)
    .sort((a, b) => b[1] - a[1])
    .forEach(([zone, count]) => {
      console.log(`   ${zone} : ${count}`);
    });
  
  // Projets avec notes
  const withNotes = ALL.filter(p => p.notes && p.notes.trim()).length;
  console.log(`\nProjets avec notes : ${withNotes} (${((withNotes/ALL.length)*100).toFixed(1)}%)`);
  
  // Consultations CAHORS
  const cahors = ALL.filter(p => p.consultation_cahors === 'Oui').length;
  console.log(`Consultations CAHORS : ${cahors} (${((cahors/ALL.length)*100).toFixed(1)}%)`);
  
  console.groupEnd();
}

window.showDataStatistics = showDataStatistics;


// =====================================================
// HELPER : VÉRIFIER L'INTÉGRITÉ DES DONNÉES
// =====================================================

/**
 * Vérifier l'intégrité des données
 */
function checkDataIntegrity() {
  if (!ALL || !Array.isArray(ALL)) {
    console.error('❌ ALL n\'est pas disponible');
    return;
  }

  console.group('🔍 Vérification de l\'intégrité des données');
  
  let issues = 0;
  
  ALL.forEach((project, index) => {
    const errors = [];
    
    // Vérifier l'ID
    if (!project.id) errors.push('ID manquant');
    
    // Vérifier les doublons d'ID
    const duplicates = ALL.filter(p => p.id === project.id);
    if (duplicates.length > 1) errors.push('ID dupliqué');
    
    // Vérifier le projet
    if (!project.projet || !project.projet.trim()) errors.push('Nom de projet vide');
    
    // Vérifier les dates
    if (project.echeance && !/^\d{4}-\d{2}-\d{2}$/.test(project.echeance)) {
      errors.push('Format échéance invalide');
    }
    if (project.creation && !/^\d{4}-\d{2}-\d{2}$/.test(project.creation)) {
      errors.push('Format création invalide');
    }
    
    if (errors.length > 0) {
      console.warn(`⚠️ Projet #${index + 1} (ID: ${project.id}) :`, errors.join(', '));
      issues++;
    }
  });
  
  if (issues === 0) {
    console.log('✅ Aucun problème détecté');
  } else {
    console.warn(`⚠️ ${issues} projet(s) avec des problèmes`);
  }
  
  console.groupEnd();
}

window.checkDataIntegrity = checkDataIntegrity;


console.log('\n💡 Nouvelles commandes disponibles :');
console.log('  showDataStatistics()   - Statistiques sur les données');
console.log('  checkDataIntegrity()   - Vérifier l\'intégrité des données');
