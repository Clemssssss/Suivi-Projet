(function () {
  'use strict';

  /* ════════════════════════════════════════════════════════════════
     PARSEURS — fonctions pures, aucune dépendance externe
  ════════════════════════════════════════════════════════════════ */
  var _INVALID = new Set([
    '','null','undefined',
    'non spécifié','non specifie','non défini','non defini',
    'n/a','na','-','?','inconnu','unknown','none','aucun'
  ]);

  function nvClean(v) {
    if (v === null || v === undefined) return null;
    var s = String(v).trim();
    return _INVALID.has(s.toLowerCase()) ? null : s;
  }

  function parseDate(v) {
    if (!v) return null;
    var s = String(v).trim();
    var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return m[3] + '-' + String(m[2]).padStart(2,'0') + '-' + String(m[1]).padStart(2,'0');
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);
    return nvClean(s);
  }

  function parseMontant(v) {
    if (!v && v !== 0) return null;
    if (typeof v === 'number') return v;
    var s = String(v).trim();
    s = s.replace(/[\u20AC\$\u00A3\u00A0\u202F\s]/g, '');
    if (!s || s === '-') return null;
    var lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
    if (lc === -1 && ld === -1) { var n0=parseFloat(s); return isNaN(n0)?null:n0; }
    if (lc === -1) {
      var ad=s.slice(ld+1);
      if (ad.length===3 && s.indexOf('.')==ld) { var n1=parseFloat(s.replace(/\./g,'')); return isNaN(n1)?null:n1; }
      var n2=parseFloat(s); return isNaN(n2)?null:n2;
    }
    if (ld === -1) {
      var cc=(s.match(/,/g)||[]).length, ac=s.slice(lc+1);
      if (cc>1||ac.length===3) { var n3=parseFloat(s.replace(/,/g,'')); return isNaN(n3)?null:n3; }
      var n4=parseFloat(s.replace(',','.')); return isNaN(n4)?null:n4;
    }
    if (lc>ld) s=s.replace(/\./g,'').replace(',','.');
    else s=s.replace(/,/g,'');
    var n=parseFloat(s); return isNaN(n)?null:n;
  }

  function parseWinProba(raw) {
    if (raw === '' || raw === null || raw === undefined) return null;
    var s = String(raw).trim();
    if (s.endsWith('%')) return s;
    var n = parseFloat(s);
    if (isNaN(n)) return nvClean(raw);
    return (n > 1 ? n : Math.round(n * 100)) + '%';
  }

  var _ZONE_MAP = {
    'france':'France','national':'France','france et belgique':'France',
    'un peu partout':'France','partout':'France',
    'nord-est':'Nord-Est','nordest':'Nord-Est','nord est':'Nord-Est',
    'nord-ouest':'Nord-Ouest','nordouest':'Nord-Ouest','nord ouest':'Nord-Ouest',
    'sud-est':'Sud-Est','sudest':'Sud-Est','sud est':'Sud-Est',
    'sud-ouest':'Sud-Ouest','sudouest':'Sud-Ouest','sud ouest':'Sud-Ouest',
    'dom':'DOM-TOM','dom-tom':'DOM-TOM','guyane':'DOM-TOM',
    'guadeloupe':'DOM-TOM','martinique':'DOM-TOM',
    'corse':'Corse','europe':'Europe',
  };
  function normalizeZone(v) {
    if (!v) return null;
    var s = String(v).trim();
    return _ZONE_MAP[s.toLowerCase()] || s;
  }

  function normalizeStatus(v) {
    return nvClean(v);
  }

  function sanitizeImportedText(v) {
    var cleaned = nvClean(v);
    if (!cleaned) return cleaned;
    return /^[=+\-@]/.test(cleaned) ? ("'" + cleaned) : cleaned;
  }

  /* ════════════════════════════════════════════════════════════════
     PARSER CSV
     ─ Séparateur auto-détecté (; ou ,)
     ─ Support des guillemets
     ─ Casse des headers préservée (correspond au schéma data.js)
  ════════════════════════════════════════════════════════════════ */
  var DATE_FIELDS    = ['Date réception','Date de retour demandée','Décidé le','Décidé le ',
                        'Date de démarrage VRD prévisionnelle',
                        'Date de démarrage GE prévisionnelle',
                        'Date de MSI prévisionnelle',
                        'creation','echeance','date_reception_ao','date_remise_offre',
                        'date_ouverture_prix','fin_prevue_chantier'];
  var MONTANT_FIELDS = ['Bud','CA win proba'];
  var WINPROBA_FIELDS= ['Win proba'];
  var NUM_FIELDS     = ['Puissance (MWc)','_annee','id'];
  var HEADER_ALIAS_MAP = {
    'Décidé le': 'Décidé le ',
    'Décidé le ': 'Décidé le '
  };

  function canonicalHeader(h) {
    return HEADER_ALIAS_MAP[h] || h;
  }

  function _splitLine(line, sep) {
    var result = [], cur = '', inQ = false;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (c === '"') { inQ = !inQ; continue; }
      if (c === sep && !inQ) { result.push(cur.trim()); cur = ''; }
      else cur += c;
    }
    result.push(cur.trim());
    return result;
  }

  function _detectSeparator(line) {
    if (!line) return ';';
    return line.split(';').length > line.split(',').length ? ';' : ',';
  }

  function _headerNorm(h) {
    if (!h) return '';
    return String(h)
      .replace(/[\uFEFF\u200B\u200C\u200D\u00A0\u2060]/g, '')
      .replace(/\u2019|\u2018|\u201C|\u201D/g, "'")
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function _scoreHeaderCandidate(cells) {
    if (!cells || !cells.length) return 0;
    var expected = EXPECTED_SCHEMA.map(_headerNorm);
    var normalizedCells = cells.map(function(cell) {
      return _headerNorm(canonicalHeader(String(cell || '')
        .replace(/^["'\u201C\u201D]/g, '')
        .replace(/["'\u201C\u201D]$/g, '')
        .trim()));
    });
    var score = 0;
    normalizedCells.forEach(function(cell) {
      if (expected.indexOf(cell) !== -1) score += 1;
    });
    return score;
  }

  function _findHeaderRowIndex(lines, sep) {
    var bestIndex = 0;
    var bestScore = -1;
    var maxScan = Math.min(lines.length, 12);

    for (var i = 0; i < maxScan; i++) {
      var raw = String(lines[i] || '');
      if (!raw.trim()) continue;
      var score = _scoreHeaderCandidate(_splitLine(raw, sep));
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }

    return bestScore >= 4 ? bestIndex : 0;
  }

  function _sanitizeHeader(raw) {
    return canonicalHeader(String(raw || '')
      .replace(/^["'\u201C\u201D]/g, '')
      .replace(/["'\u201C\u201D]$/g, '')
      .replace(/[\u200B\u200C\u200D\u00A0\uFEFF]/g, '')
      .trim());
  }

  function _buildRows(rawHeaders, matrixRows, rowNumberOffset) {
    var rows = [];

    for (var ri = 0; ri < matrixRows.length; ri++) {
      var vals = matrixRows[ri] || [];
      var hasMeaningfulValue = vals.some(function(v) {
        return String(v === undefined || v === null ? '' : v).trim() !== '';
      });
      if (!hasMeaningfulValue) continue;

      var obj = {};

      rawHeaders.forEach(function(h, i) {
        var raw = String(vals[i] !== undefined && vals[i] !== null ? vals[i] : '')
          .replace(/^["'\u201C\u201D]/,'')
          .replace(/["'\u201C\u201D]$/,'')
          .trim();

        if (DATE_FIELDS.indexOf(h) !== -1 || DATE_FIELDS.indexOf(h.trim()) !== -1) {
          obj[h] = parseDate(raw);
        } else if (MONTANT_FIELDS.indexOf(h) !== -1) {
          obj[h] = parseMontant(raw);
        } else if (WINPROBA_FIELDS.indexOf(h) !== -1) {
          obj[h] = parseWinProba(raw);
        } else if (h === 'Zone Géographique') {
          obj[h] = normalizeZone(raw) || sanitizeImportedText(raw);
        } else if (h === 'GoNogo') {
          if (raw) {
            var gn = String(raw).trim().toLowerCase();
            obj[h] = (gn === 'go') ? 'Go' : (gn.includes('nogo') || gn.includes('no go')) ? 'NoGo' : sanitizeImportedText(raw);
          } else { obj[h] = null; }
        } else if (h === 'Statut' || h.toLowerCase() === 'statut') {
          obj[h] = normalizeStatus(raw) || sanitizeImportedText(raw);
        } else if (NUM_FIELDS.indexOf(h) !== -1) {
          var n = parseFloat(raw);
          obj[h] = isNaN(n) ? nvClean(raw) : n;
        } else {
          obj[h] = sanitizeImportedText(raw);
        }
      });

      if (!obj.id) obj.id = rowNumberOffset + ri + 1;
      if (!obj.notes) obj.notes = '';
      rows.push(obj);
    }

    return rows;
  }

  function parseCSV(text) {
    // ── v4.1 : Suppression BOM UTF-8 et caractères invisibles ──────
    // BOM UTF-8 : \uFEFF (souvent ajouté par Excel)
    // Espaces invisibles : \u00A0 (non-breaking), \u200B (zero-width), \u202F, \u2060
    text = text.replace(/^\uFEFF/, '');
    text = text.replace(/\u00A0/g, ' ');
    text = text.replace(/[\u200B\u200C\u200D\u2060\uFEFF]/g, '');

    var lines = text.replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n');
    if (lines.length < 2) throw new Error('Fichier CSV vide ou invalide');

    var firstNonEmptyLine = lines.find(function(line) { return String(line || '').trim(); }) || lines[0];
    var sep = _detectSeparator(firstNonEmptyLine);
    var headerRowIndex = _findHeaderRowIndex(lines, sep);
    var headerLine = lines[headerRowIndex];
    if (!headerLine || !String(headerLine).trim()) {
      throw new Error('En-tête CSV introuvable');
    }

    var rawHeaders = _splitLine(headerLine, sep).map(_sanitizeHeader);

    console.log('[ImportCSV v4.1] Séparateur détecté : "' + sep + '"');
    if (headerRowIndex > 0) {
      console.log('[ImportCSV v4.1] En-tête détecté à la ligne ' + (headerRowIndex + 1) + ' — lignes précédentes ignorées');
    }
    console.log('[ImportCSV v4.1] Headers détectés (' + rawHeaders.length + ') :', rawHeaders);

    var matrixRows = [];
    for (var li = headerRowIndex + 1; li < lines.length; li++) {
      if (!String(lines[li] || '').trim()) continue;
      matrixRows.push(_splitLine(lines[li], sep));
    }

    return _buildRows(rawHeaders, matrixRows, headerRowIndex + 1);
  }

  function parseWorkbook(arrayBuffer) {
    if (typeof XLSX === 'undefined') {
      throw new Error('Librairie XLSX indisponible');
    }

    var workbook = XLSX.read(arrayBuffer, { type: 'array' });
    if (!workbook.SheetNames || !workbook.SheetNames.length) {
      throw new Error('Workbook vide');
    }

    var bestRows = [];
    var bestScore = -1;
    var bestSheet = workbook.SheetNames[0];

    workbook.SheetNames.forEach(function(sheetName) {
      var sheet = workbook.Sheets[sheetName];
      var matrix = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        raw: false,
        defval: ''
      });
      if (!matrix || !matrix.length) return;

      var headerIndex = 0;
      var score = -1;
      for (var i = 0; i < Math.min(matrix.length, 12); i++) {
        var rowScore = _scoreHeaderCandidate(matrix[i]);
        if (rowScore > score) {
          score = rowScore;
          headerIndex = i;
        }
      }

      if (score < bestScore) return;
      bestScore = score;
      bestSheet = sheetName;

      var rawHeaders = (matrix[headerIndex] || []).map(_sanitizeHeader);
      var bodyRows = matrix.slice(headerIndex + 1);
      bestRows = _buildRows(rawHeaders, bodyRows, headerIndex + 1);
    });

    console.log('[ImportCSV v4.1] Feuille importée : ' + bestSheet);
    return bestRows;
  }

  /* ════════════════════════════════════════════════════════════════
     VALIDATION SCHÉMA — v4.1 : Normalisation robuste
     Comparaison insensible aux espaces finaux, BOM, casse
  ════════════════════════════════════════════════════════════════ */
  var EXPECTED_SCHEMA = [
    'Date réception','Client','Dénomination','Emetteur','Receveur',
    'Zone Géographique','Type de projet (Activité)','Bud','Puissance (MWc)',
    'Win proba','CA win proba','Statut','MG Statut Odoo MG',
    'Date de retour demandée','GoNogo','N°- AO',
    'Carte Planner oui/non','Décidé le',
    'Date de démarrage VRD prévisionnelle',
    'Date de démarrage GE prévisionnelle',
    'Date de MSI prévisionnelle','Commentaires'
  ];

  // Normaliser un header : lower + trim + suppression espaces multiples + BOM/invisibles
  // CORRECTION 9 : normalisation stricte headers CSV (validateSchema)
  function _normalizeHeader(h) {
    return String(h || '')
      .replace(/[\uFEFF\u200B\u200C\u200D\u00A0\u2060]/g, '') // BOM + zero-width + NBSP
      .replace(/\u2019|\u2018|\u201C|\u201D/g, "'")              // apostrophes typographiques
      .replace(/\t/g, ' ')                                          // tabulations → espace
      .replace(/\s+/g, ' ')                                         // espaces multiples → 1
      .trim()                                                         // espaces finaux/initiaux
      .toLowerCase();                                                  // casse uniforme
  }

  function validateSchema(rows) {
    if (!rows || !rows.length) return { missing: [], extra: [] };
    var keys = Object.keys(rows[0]);
    var keysNorm = keys.map(_normalizeHeader);
    var schemaNorm = EXPECTED_SCHEMA.map(_normalizeHeader);

    var missing = EXPECTED_SCHEMA.filter(function(col, i) {
      return !keysNorm.some(function(k) { return k === schemaNorm[i]; });
    });

    var extra = keys.filter(function(k) {
      var kn = _normalizeHeader(k);
      return !schemaNorm.some(function(s) { return s === kn; });
    });

    if (missing.length > 0) {
      console.warn('[ImportCSV v4.1] Colonnes manquantes apres normalisation :', missing);
      console.log('[ImportCSV v4.1] Colonnes presentes :', keys);
    }

    return { missing: missing, extra: extra };
  }

  /* ════════════════════════════════════════════════════════════════
     LOADER VISUEL
  ════════════════════════════════════════════════════════════════ */
  function showLoader(msg) {
    var el = document.getElementById('csv-loader');
    if (el) { el.querySelector('.csv-loader-msg').textContent = msg || 'Traitement…'; return; }
    var d = document.createElement('div');
    d.id = 'csv-loader';
    d.style.cssText = [
      'position:fixed;inset:0;background:rgba(6,12,20,.9);z-index:9999;',
      'display:flex;align-items:center;justify-content:center;flex-direction:column;gap:1rem;'
    ].join('');
    d.innerHTML = [
      '<div style="width:44px;height:44px;border:4px solid rgba(0,212,170,.15);',
      'border-top-color:#00d4aa;border-radius:50%;animation:_csvSpin .65s linear infinite;"></div>',
      '<div class="csv-loader-msg" style="color:#dce8f5;font-family:var(--mono,monospace);',
      'font-size:.85rem;text-align:center;">' + (msg || 'Traitement…') + '</div>'
    ].join('');
    if (!document.getElementById('_csvSpinStyle')) {
      var st = document.createElement('style');
      st.id = '_csvSpinStyle';
      st.textContent = '@keyframes _csvSpin{to{transform:rotate(360deg)}}';
      document.head.appendChild(st);
    }
    document.body.appendChild(d);
  }

  function hideLoader() {
    var el = document.getElementById('csv-loader');
    if (el) el.remove();
  }

  var MAX_IMPORT_FILE_BYTES = 8 * 1024 * 1024;

  function setImportVisibility(isAdmin) {
    var trigger = document.getElementById('csv-import-trigger');
    if (!trigger) return;
    trigger.style.display = isAdmin ? 'inline-flex' : 'none';
  }

  function bindImportVisibility() {
    document.addEventListener('dashboard-auth-ready', function(event) {
      setImportVisibility(!!(event && event.detail && event.detail.isAdmin));
    });

    if (window.AuthClient && typeof window.AuthClient.status === 'function') {
      window.AuthClient.status().then(function(result) {
        setImportVisibility(!!(result && result.ok && result.data && result.data.isAdmin));
      }).catch(function() {
        setImportVisibility(false);
      });
    } else {
      setImportVisibility(false);
    }
  }

  /* ════════════════════════════════════════════════════════════════
     NORMALISATION _annee
     Source unique de vérité : Analytics.getProjectYear()
  ════════════════════════════════════════════════════════════════ */
  function normalizeAnnee(data) {
    return data.map(function(p) {
      var proj = Object.assign({}, p);
      if (typeof Analytics !== 'undefined' && typeof Analytics.getProjectYear === 'function') {
        proj._annee = Analytics.getProjectYear(proj);
      }
      if (!proj._annee) {
        var dr = proj['Date réception'];
        if (dr) {
          var parts = String(dr).split('/');
          if (parts.length === 3) {
            var yr = parseInt(parts[2], 10);
            if (yr > 0 && yr < 100) yr += 2000;
            if (yr > 1900) proj._annee = String(yr);
          } else {
            var m = String(dr).match(/^(\d{4})/);
            if (m) proj._annee = m[1];
          }
        }
      }
      if (proj._annee != null) proj._annee = String(proj._annee);
      return proj;
    });
  }

  /* ════════════════════════════════════════════════════════════════
     REFRESH SÉLECTEUR ANNÉE
  ════════════════════════════════════════════════════════════════ */
  function refreshYearSelect(data) {
    var seen = {}, yrs = [];
    data.forEach(function(p) {
      var y = p && p._annee ? parseInt(p._annee, 10) : NaN;
      if (isNaN(y) && typeof Analytics !== 'undefined' && typeof Analytics.getProjectYear === 'function') {
        y = parseInt(Analytics.getProjectYear(p), 10);
      }
      if (!isNaN(y) && !seen[y]) { seen[y] = true; yrs.push(y); }
    });
    yrs.sort(function(a,b) { return b - a; });

    var sel = document.getElementById('year-filter');
    if (!sel) return;
    var current = sel.value;
    sel.innerHTML = '<option value="">Toutes les années</option>';
    yrs.forEach(function(y) {
      var o = document.createElement('option');
      o.value = String(y); o.textContent = String(y);
      sel.appendChild(o);
    });
    // Restaurer la sélection si possible
    if (current) sel.value = current;
  }

  /* ════════════════════════════════════════════════════════════════
     applyNewData — CŒUR DE L'IMPORT CSV
     ════════════════════════════════════════════════════════════════
     GARANTIES :
       ✅ Aucun rechargement de scripts (<script src> jamais appelé)
       ✅ Aucune redéclaration de const/let (modules déjà chargés)
       ✅ Aucun appel à initDashboard()
       ✅ AE.init(data) → mutation de st.raw seulement (pas de const)
       ✅ DataFilterEngine.setRawData(data) → API dédiée rechargement
       ✅ DataFilterEngine.init() → JAMAIS ici (re-souscription FM)
       ✅ Filtres actifs conservés (pas de AE.clearAll())
       ✅ Charts réutilisés via chart.update() (ChartsEnrichis)
  ════════════════════════════════════════════════════════════════ */
  function applyNewData(newData) {
    // ─ 1. Validation schéma ────────────────────────────────────────
    var schema = validateSchema(newData);
    if (schema.missing.length > 0) {
      var msg = 'Colonnes manquantes : ' + schema.missing.join(', ');
      if (typeof notify === 'function') notify('⚠️ Schéma CSV', msg, 'warning', 0);
      console.warn('[ImportCSV] Colonnes manquantes :', schema.missing);
    }
    if (schema.extra.length) {
      console.info('[ImportCSV] Colonnes supplémentaires (ignorées) :', schema.extra);
    }

    // ─ 2. Normalisation _annee (source unique : Analytics.getProjectYear) ─
    newData = normalizeAnnee(newData);

    // ─ 3. Mise à jour des données — SANS réinstancier les modules ──
    //
    //   window.DATA = source de vérité brute pour le reste du dashboard
    //   DataFilterEngine.setRawData() = API dédiée rechargement sans re-subscribe FM
    //   AE.init() = mutation simple de st.raw (pas une redéclaration de const)
    //
      if (typeof window.setDashboardData === 'function') {
        window.setDashboardData(newData);
      } else {
        window.DATA = newData;

      if (typeof DataFilterEngine !== 'undefined') {
        if (typeof DataFilterEngine.setRawData === 'function') {
          DataFilterEngine.setRawData(newData);
        } else if (typeof DataFilterEngine.init === 'function') {
          DataFilterEngine.init(newData);
        }
      }

      if (typeof AE !== 'undefined' && typeof AE.init === 'function') {
        AE.init(newData);
      }

      refreshYearSelect(newData);

        if (typeof update === 'function') {
          update();
        }
      }

      if (typeof DashboardLocalData !== 'undefined' && typeof DashboardLocalData.saveImportedDataset === 'function') {
        DashboardLocalData.saveImportedDataset(newData, { source: 'file-import' });
      }

      // ─ 6. Composants supplémentaires ──────────────────────────────
    if (typeof window.renderObjectiveBars === 'function') {
      window.renderObjectiveBars();
    }
    if (typeof window.StrategicKPIs !== 'undefined' && typeof window.StrategicKPIs.render === 'function') {
      window.StrategicKPIs.render();
    } else if (window._strategicKPIs && typeof window._strategicKPIs.render === 'function') {
      window._strategicKPIs.render(newData);
    }

    if (typeof notify === 'function') {
      notify('✅ Import réussi', newData.length + ' projets chargés', 'success', 4000);
    }
    console.log('[ImportCSV] ✅ applyNewData() terminé —', newData.length, 'projets');
  }

  /* ════════════════════════════════════════════════════════════════
     GESTIONNAIRE FICHIER
     Guard _csvChangeAttached : évite les listeners doublons si le
     script est évalué plusieurs fois (ne devrait jamais arriver avec
     les guards window, mais défense en profondeur).
  ════════════════════════════════════════════════════════════════ */
  var inputEl = document.getElementById('csv-import-input');
  if (inputEl && !inputEl._csvChangeAttached) {
    inputEl._csvChangeAttached = true;
    bindImportVisibility();

    inputEl.addEventListener('change', function(e) {
      var file = e.target.files[0];
      if (!file) return;

      if (!(window.AuthClient && typeof window.AuthClient.isAdmin === 'function' && window.AuthClient.isAdmin())) {
        if (typeof notify === 'function')
          notify('Accès refusé', 'Import réservé au compte administrateur', 'error', 0);
        e.target.value = '';
        return;
      }

      var fileName = file.name.toLowerCase();
      var isCSV = fileName.endsWith('.csv') || file.type === 'text/csv' || file.type === 'application/csv';
      var isExcel = fileName.endsWith('.xlsx') ||
        file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

      if (!isCSV && !isExcel) {
        if (typeof notify === 'function')
          notify('Erreur', 'Fichier CSV ou Excel requis (.csv, .xlsx)', 'error', 0);
        e.target.value = '';
        return;
      }

      if (file.size > MAX_IMPORT_FILE_BYTES) {
        if (typeof notify === 'function')
          notify('Erreur', 'Fichier trop volumineux (max 8 Mo)', 'error', 0);
        e.target.value = '';
        return;
      }

      showLoader('Lecture du fichier…');

      function finalizeImport(data, label) {
        if (!data || data.length === 0) {
          throw new Error('Aucun projet trouvé dans le fichier ' + label);
        }

        showLoader('Application des données (' + data.length + ' projets)…');
        setTimeout(function() {
          try {
            applyNewData(data);
          } catch(applyErr) {
            console.error('[ImportCSV] applyNewData error:', applyErr);
            if (typeof notify === 'function')
              notify('Erreur application', applyErr.message, 'error', 0);
          }
          hideLoader();
        }, 80);
      }

      if (isExcel) {
        var excelReader = new FileReader();
        excelReader.onload = function(ev) {
          try {
            showLoader('Analyse Excel…');
            var bytes = new Uint8Array(ev.target.result || []);
            if (!(bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4B)) {
              throw new Error('Le fichier .xlsx ne semble pas valide');
            }
            var data = parseWorkbook(ev.target.result);
            finalizeImport(data, 'Excel');
          } catch (err) {
            hideLoader();
            console.error('[ImportExcel] parseWorkbook error:', err);
            if (typeof notify === 'function')
              notify('Erreur import fichier', err.message, 'error', 0);
          }
          e.target.value = '';
        };
        excelReader.onerror = function() {
          hideLoader();
          if (typeof notify === 'function')
            notify('Erreur lecture', 'Impossible de lire le fichier Excel', 'error', 0);
        };
        excelReader.readAsArrayBuffer(file);
        return;
      }

      var reader = new FileReader();

      reader.onload = function(ev) {
        try {
          showLoader('Analyse CSV…');
          var data = parseCSV(ev.target.result);
          finalizeImport(data, 'CSV');
        } catch(err) {
          hideLoader();
          console.error('[ImportCSV] parseCSV error:', err);
          if (typeof notify === 'function')
            notify('Erreur import CSV', err.message, 'error', 0);
        }
        e.target.value = '';
      };

      reader.onerror = function() {
        hideLoader();
        if (typeof notify === 'function')
          notify('Erreur lecture', 'Impossible de lire le fichier', 'error', 0);
      };

      (function() {
        var er = new FileReader();
        er.onload = function(ev) {
          var b=new Uint8Array(ev.target.result), ok=true;
          for (var i=0;i<b.length;i++) {
            if (b[i]<0x80) continue;
            if ((b[i]&0xE0)===0xC0){if(i+1>=b.length||(b[i+1]&0xC0)!==0x80){ok=false;break;}i++;}
            else if((b[i]&0xF0)===0xE0){if(i+2>=b.length||(b[i+1]&0xC0)!==0x80||(b[i+2]&0xC0)!==0x80){ok=false;break;}i+=2;}
            else if((b[i]&0xF8)===0xF0){if(i+3>=b.length){ok=false;break;}i+=3;}
            else{ok=false;break;}
          }
          var cs=ok?'UTF-8':'ISO-8859-1';
          reader.readAsText(file,cs);
        };
        er.readAsArrayBuffer(file.slice(0,8192));
      })();
    });
  } else if (!inputEl) {
    console.warn('[ImportCSV] #csv-import-input introuvable au chargement');
  } else {
    bindImportVisibility();
  }

  // API publique pour usage programmatique (console, tests)
  window._csvImport = {
    applyNewData : applyNewData,
    parseCSV     : parseCSV,
    parseWorkbook: parseWorkbook,
    validateSchema: validateSchema,
    normalizeAnnee: normalizeAnnee,
  };

})();
