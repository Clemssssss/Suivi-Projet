(function() {
  'use strict';

  var state = {
    currentUser: '',
    role: '',
    lastSummary: null,
    lastDiff: null
  };

  function qs(id) { return document.getElementById(id); }

  function setStatus(message, className) {
    var el = qs('upload-status');
    if (!el) return;
    el.className = 'status' + (className ? (' ' + className) : '');
    el.textContent = message;
  }

  function updateHeaderUser() {
    var el = qs('auth-user-label');
    if (el) el.textContent = state.currentUser ? ('🔒 ' + state.currentUser + ' · ' + (state.role || 'admin')) : '🔒 Session';
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderDiff(diff) {
    state.lastDiff = diff || null;
    var grid = qs('diff-grid');
    var details = qs('diff-details');
    if (!grid || !details) return;

    var cards = [
      ['Ajouts', diff && typeof diff.addedCount === 'number' ? diff.addedCount : '—', 'is-add'],
      ['Modifications', diff && typeof diff.changedCount === 'number' ? diff.changedCount : '—', 'is-change'],
      ['Suppressions', diff && typeof diff.removedCount === 'number' ? diff.removedCount : '—', 'is-remove'],
      ['Inchangés', diff && typeof diff.unchangedCount === 'number' ? diff.unchangedCount : '—', 'is-same']
    ];
    grid.innerHTML = cards.map(function(card) {
      return '<div class="diff-card ' + card[2] + '"><span>' + escapeHtml(card[0]) + '</span><strong>' + escapeHtml(card[1]) + '</strong></div>';
    }).join('');

    if (!diff) {
      details.innerHTML = '<div class="empty">Aucun écart analysé pour le moment.</div>';
      return;
    }

    var blocks = [];
    if (Array.isArray(diff.changedFieldLeaders) && diff.changedFieldLeaders.length) {
      blocks.push(
        '<div class="diff-title">Champs les plus touchés</div><ul class="micro-list">' +
        diff.changedFieldLeaders.map(function(item) {
          return '<li><code>' + escapeHtml(item.field) + '</code> modifié sur ' + escapeHtml(item.count) + ' ligne(s)</li>';
        }).join('') +
        '</ul>'
      );
    }
    if (Array.isArray(diff.sampleAdded) && diff.sampleAdded.length) {
      blocks.push(
        '<div class="diff-title">Exemples d\'ajouts</div><ul class="micro-list">' +
        diff.sampleAdded.map(function(label) { return '<li>' + escapeHtml(label) + '</li>'; }).join('') +
        '</ul>'
      );
    }
    if (Array.isArray(diff.sampleChanged) && diff.sampleChanged.length) {
      blocks.push(
        '<div class="diff-title">Exemples de modifications</div><ul class="micro-list">' +
        diff.sampleChanged.map(function(item) {
          var suffix = Array.isArray(item.changedFields) && item.changedFields.length
            ? ' — champs : ' + item.changedFields.map(function(field) { return escapeHtml(field); }).join(', ')
            : '';
          return '<li>' + escapeHtml(item.label) + suffix + '</li>';
        }).join('') +
        '</ul>'
      );
    }
    if (Array.isArray(diff.sampleRemoved) && diff.sampleRemoved.length) {
      blocks.push(
        '<div class="diff-title">Exemples de suppressions</div><ul class="micro-list">' +
        diff.sampleRemoved.map(function(label) { return '<li>' + escapeHtml(label) + '</li>'; }).join('') +
        '</ul>'
      );
    }

    details.innerHTML = blocks.length ? blocks.join('') : '<div class="empty">Aucune différence détectée entre le fichier et la DB actuelle.</div>';
  }

  function updateSummary(summary, actionLabel, diff) {
    state.lastSummary = summary || null;
    var rows = [
      ['Fichier', summary && summary.fileName ? summary.fileName : '—'],
      ['Dataset', qs('dataset-key').value.trim() || 'saip-main'],
      ['Feuille détectée', summary && summary.sheetName ? summary.sheetName : '—'],
      ['Lignes actuelles DB', diff && typeof diff.existingRowCount === 'number' ? String(diff.existingRowCount) : '—'],
      ['Nb lignes', summary && typeof summary.rowCount === 'number' ? String(summary.rowCount) : '—'],
      ['Colonnes', summary && Array.isArray(summary.columns) && summary.columns.length ? summary.columns.join(', ') : '—'],
      ['Dernière action', actionLabel || '—']
    ];
    qs('upload-summary').innerHTML = rows.map(function(row) {
      return '<div>' + escapeHtml(row[0]) + '</div><div>' + escapeHtml(row[1]) + '</div>';
    }).join('');

    var wrap = qs('sample-wrap');
    var sample = summary && Array.isArray(summary.sample) ? summary.sample : [];
    if (!sample.length) {
      wrap.innerHTML = '<div class="empty" style="padding:1rem;">Aucun aperçu pour le moment.</div>';
      renderDiff(diff || null);
      return;
    }

    var columns = summary.columns || Object.keys(sample[0] || {}).slice(0, 8);
    wrap.innerHTML =
      '<table><thead><tr>' +
      columns.map(function(col) { return '<th>' + escapeHtml(col) + '</th>'; }).join('') +
      '</tr></thead><tbody>' +
      sample.map(function(row) {
        return '<tr>' + columns.map(function(col) {
          var value = row[col];
          return '<td>' + escapeHtml(value == null ? '' : value) + '</td>';
        }).join('') + '</tr>';
      }).join('') +
      '</tbody></table>';

    renderDiff(diff || null);
  }

  async function fetchJson(url, options) {
    var response = await fetch(url, Object.assign({
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Accept': 'application/json' }
    }, options || {}));
    var data = await response.json();
    if (!response.ok) throw new Error(data && data.error ? data.error : ('HTTP ' + response.status));
    return data;
  }

  function readFileAsBase64(file) {
    return new Promise(function(resolve, reject) {
      var reader = new FileReader();
      reader.onload = function() {
        var result = String(reader.result || '');
        var base64 = result.indexOf(',') >= 0 ? result.split(',').pop() : result;
        resolve(base64);
      };
      reader.onerror = function() { reject(new Error('Impossible de lire le fichier')); };
      reader.readAsDataURL(file);
    });
  }

  async function buildPayload(action) {
    var input = qs('dataset-file');
    var file = input && input.files ? input.files[0] : null;
    if (!file) throw new Error('Choisissez un fichier Excel ou CSV');
    if (file.size > (10 * 1024 * 1024)) throw new Error('Fichier trop volumineux (max 10 Mo)');

    return {
      action: action,
      datasetKey: qs('dataset-key').value.trim() || 'saip-main',
      sourceName: qs('source-name').value.trim() || file.name,
      fileName: file.name,
      contentType: file.type || '',
      fileBase64: await readFileAsBase64(file)
    };
  }

  async function runAction(action) {
    var payload = await buildPayload(action);
    setStatus(action === 'analyze' ? 'Analyse du fichier en cours…' : 'Import en base en cours…');
    var data = await fetchJson('/.netlify/functions/upload-dataset-admin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    updateSummary(data.summary || null, action === 'analyze' ? 'Analyse terminée' : 'DB mise à jour', data.diff || null);
    if (action === 'analyze') {
      var analyzeMessage = 'Analyse OK : ' + (data.summary && data.summary.rowCount ? data.summary.rowCount : 0) + ' ligne(s) détectée(s).';
      if (data.diff) {
        analyzeMessage += ' Ajouts ' + (data.diff.addedCount || 0) + ' · modifs ' + (data.diff.changedCount || 0) + ' · suppressions ' + (data.diff.removedCount || 0) + '.';
      }
      setStatus(analyzeMessage, 'ok');
    } else {
      setStatus('DB mise à jour : ' + (data.rowCount || 0) + ' ligne(s) importée(s).', 'ok');
    }
  }

  async function initAuth() {
    if (!window.AuthClient || typeof window.AuthClient.status !== 'function') {
      window.location.replace('/chart/login.html?next=' + encodeURIComponent('/chart/dataset-upload.html'));
      return false;
    }
    var auth = await window.AuthClient.status();
    if (!(auth.ok && auth.data && auth.data.authenticated)) {
      window.location.replace('/chart/login.html?next=' + encodeURIComponent('/chart/dataset-upload.html'));
      return false;
    }
    if (!(auth.data && auth.data.isAdmin)) {
      window.location.replace('/chart/chart.html');
      return false;
    }
    state.currentUser = typeof auth.data.user === 'string' ? auth.data.user : '';
    state.role = typeof auth.data.role === 'string' ? auth.data.role : 'admin';
    updateHeaderUser();
    return true;
  }

  function bindLogout() {
    var button = qs('btn-logout');
    if (!button || button._logoutBound) return;
    button._logoutBound = true;
    button.addEventListener('click', async function() {
      button.disabled = true;
      try { await window.AuthClient.logout(); } catch (_) {}
      window.location.replace('/chart/login.html');
    });
  }

  function bindActions() {
    var analyzeBtn = qs('btn-analyze');
    var importBtn = qs('btn-import');

    if (analyzeBtn && !analyzeBtn._bound) {
      analyzeBtn._bound = true;
      analyzeBtn.addEventListener('click', function() {
        analyzeBtn.disabled = true;
        runAction('analyze').catch(function(err) {
          setStatus('Erreur : ' + (err && err.message ? err.message : 'analyse impossible'), 'err');
        }).finally(function() {
          analyzeBtn.disabled = false;
        });
      });
    }

    if (importBtn && !importBtn._bound) {
      importBtn._bound = true;
      importBtn.addEventListener('click', function() {
        var diff = state.lastDiff;
        var confirmMessage = 'Cette action va remplacer le dataset existant en base pour cette dataset key.';
        if (diff) {
          confirmMessage += '\n\nAperçu détecté :'
            + '\n- Ajouts : ' + String(diff.addedCount || 0)
            + '\n- Modifications : ' + String(diff.changedCount || 0)
            + '\n- Suppressions : ' + String(diff.removedCount || 0);
        }
        confirmMessage += '\n\nContinuer ?';
        if (!window.confirm(confirmMessage)) {
          return;
        }
        importBtn.disabled = true;
        runAction('import').catch(function(err) {
          setStatus('Erreur : ' + (err && err.message ? err.message : 'import impossible'), 'err');
        }).finally(function() {
          importBtn.disabled = false;
        });
      });
    }
  }

  async function init() {
    bindLogout();
    bindActions();
    updateSummary(null, '—', null);
    var ok = await initAuth();
    if (!ok) return;
    setStatus('Choisissez un fichier puis lancez une analyse.', '');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
