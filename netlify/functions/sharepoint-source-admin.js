const {
  evaluateAccessPolicy,
  getSessionPayload,
  isAdminSession,
  isSameOrigin,
  jsonResponse,
  logAccess,
  readRequestBody
} = require('./_auth');
const { ensureSchema, query } = require('./_db');
const { upsertPlainDataset } = require('./_plain_dataset');
const { loadRowsFromRemoteBuffer } = require('./_dataset_import');

const SOURCE_KEY = 'sharepoint_excel_main';

function cleanText(value, max) {
  return String(value == null ? '' : value).trim().slice(0, max || 500);
}

function sanitizeConfig(input) {
  const config = input && typeof input === 'object' ? input : {};
  const requestedAuthMode = cleanText(config.authMode || 'none', 40);
  return {
    fileUrl: cleanText(config.fileUrl, 2000),
    authMode: requestedAuthMode === 'graph_share'
      ? 'graph_share'
      : (requestedAuthMode === 'bearer' ? 'bearer' : 'none'),
    bearerToken: cleanText(config.bearerToken, 4000),
    sourceName: cleanText(config.sourceName || 'SharePoint Excel', 255),
    datasetKey: cleanText(config.datasetKey || 'saip-main', 120) || 'saip-main'
  };
}

function maskConfig(config) {
  const safe = sanitizeConfig(config);
  return {
    fileUrl: safe.fileUrl,
    authMode: safe.authMode,
    hasBearerToken: !!safe.bearerToken,
    sourceName: safe.sourceName,
    datasetKey: safe.datasetKey
  };
}

async function ensureAdminAccess(event) {
  const session = getSessionPayload(event);
  if (!session || !session.user) {
    await logAccess(event, 'sharepoint_source_admin_unauthorized', 'warn', {});
    return { ok: false, response: jsonResponse(401, { ok: false, error: 'Unauthorized' }) };
  }

  const isAdmin = isAdminSession(session);
  if (!isAdmin) {
    await logAccess(event, 'sharepoint_source_admin_forbidden_non_admin', 'warn', {}, session.user);
    return { ok: false, response: jsonResponse(403, { ok: false, error: 'Forbidden' }) };
  }

  const access = await evaluateAccessPolicy(event.headers || {});
  if (!access.allowed) {
    await logAccess(event, 'sharepoint_source_admin_network_blocked', 'warn', {
      code: access.reason || '',
      ip: access.ip || ''
    }, session.user);
    return {
      ok: false,
      response: jsonResponse(403, { ok: false, error: 'Restricted network', code: access.reason || 'ip_not_whitelisted' })
    };
  }

  return { ok: true, session, access };
}

async function getSourceRecord() {
  await ensureSchema();
  const result = await query(
    `SELECT source_key AS "sourceKey",
            provider,
            dataset_key AS "datasetKey",
            source_name AS "sourceName",
            config,
            is_enabled AS "isEnabled",
            last_sync_status AS "lastSyncStatus",
            last_sync_message AS "lastSyncMessage",
            last_sync_at AS "lastSyncAt",
            last_row_count AS "lastRowCount",
            updated_by AS "updatedBy",
            created_at AS "createdAt",
            updated_at AS "updatedAt"
       FROM dashboard_external_sources
      WHERE source_key = $1
      LIMIT 1`,
    [SOURCE_KEY]
  );
  return result.rows[0] || null;
}

async function saveSourceRecord(input, actor) {
  const config = sanitizeConfig(input);
  const isEnabled = !!input.isEnabled;
  const existing = await getSourceRecord();
  const persistedConfig = existing && existing.config ? sanitizeConfig(existing.config) : sanitizeConfig({});
  const finalConfig = {
    fileUrl: config.fileUrl,
    authMode: config.authMode,
    bearerToken: config.bearerToken ? config.bearerToken : persistedConfig.bearerToken,
    sourceName: config.sourceName,
    datasetKey: config.datasetKey
  };

  await query(
    `INSERT INTO dashboard_external_sources
      (source_key, provider, dataset_key, source_name, config, is_enabled, updated_by, created_at, updated_at)
     VALUES ($1, 'sharepoint_excel_url', $2, $3, $4::jsonb, $5, $6, NOW(), NOW())
     ON CONFLICT (source_key)
     DO UPDATE SET
       provider = EXCLUDED.provider,
       dataset_key = EXCLUDED.dataset_key,
       source_name = EXCLUDED.source_name,
       config = EXCLUDED.config,
       is_enabled = EXCLUDED.is_enabled,
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()`,
    [
      SOURCE_KEY,
      finalConfig.datasetKey,
      finalConfig.sourceName,
      JSON.stringify(finalConfig),
      isEnabled,
      actor
    ]
  );

  await query(
    `INSERT INTO dashboard_external_source_audit (source_key, action, actor, details)
     VALUES ($1, 'save_settings', $2, $3::jsonb)`,
    [SOURCE_KEY, actor, JSON.stringify({ isEnabled: isEnabled, datasetKey: finalConfig.datasetKey, sourceName: finalConfig.sourceName, authMode: finalConfig.authMode })]
  );

  return getSourceRecord();
}

async function updateSyncState(status, message, rowCount, actor) {
  await query(
    `UPDATE dashboard_external_sources
        SET last_sync_status = $2,
            last_sync_message = $3,
            last_row_count = $4,
            last_sync_at = NOW(),
            updated_by = $5,
            updated_at = NOW()
      WHERE source_key = $1`,
    [SOURCE_KEY, status, cleanText(message, 1000), Number(rowCount) || 0, actor]
  );
}

function buildFetchHeaders(config) {
  const headers = {
    'Accept': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/octet-stream;q=0.9, */*;q=0.5',
    'User-Agent': 'suivi4me-sharepoint-sync/1.0'
  };
  if (config.authMode === 'bearer' && config.bearerToken) {
    headers.Authorization = 'Bearer ' + config.bearerToken;
  }
  return headers;
}

function buildGraphHeaders(config) {
  if (!config.bearerToken) {
    throw new Error('Bearer token Graph/SharePoint manquant');
  }
  return {
    'Accept': 'application/json',
    'Authorization': 'Bearer ' + config.bearerToken,
    'User-Agent': 'suivi4me-sharepoint-sync/1.0'
  };
}

function encodeShareUrlForGraph(url) {
  return 'u!' + Buffer
    .from(String(url || ''), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

async function fetchResponseBuffer(response) {
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function fetchGraphShareDownload(config) {
  if (!config.fileUrl) {
    throw new Error('Lien de partage SharePoint manquant');
  }
  const shareId = encodeShareUrlForGraph(config.fileUrl);
  const graphUrl = 'https://graph.microsoft.com/v1.0/shares/' + shareId + '/driveItem';
  const graphResponse = await fetch(graphUrl, {
    method: 'GET',
    headers: buildGraphHeaders(config),
    redirect: 'follow'
  });
  if (!graphResponse.ok) {
    throw new Error('Résolution Graph impossible (' + graphResponse.status + ')');
  }
  const metadata = await graphResponse.json();
  const downloadUrl = metadata && metadata['@microsoft.graph.downloadUrl'];
  if (!downloadUrl) {
    throw new Error('Graph n’a pas fourni d’URL de téléchargement');
  }
  const downloadResponse = await fetch(downloadUrl, {
    method: 'GET',
    headers: {
      'Accept': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, text/csv;q=0.9, */*;q=0.5',
      'User-Agent': 'suivi4me-sharepoint-sync/1.0'
    },
    redirect: 'follow'
  });
  if (!downloadResponse.ok) {
    throw new Error('Téléchargement Graph impossible (' + downloadResponse.status + ')');
  }
  return {
    buffer: await fetchResponseBuffer(downloadResponse),
    contentType: downloadResponse.headers.get('content-type') || '',
    contentDisposition: downloadResponse.headers.get('content-disposition') || '',
    finalUrl: downloadResponse.url || downloadUrl,
    status: downloadResponse.status,
    resolver: 'graph',
    graphItemName: metadata && metadata.name ? String(metadata.name) : '',
    graphItemId: metadata && metadata.id ? String(metadata.id) : ''
  };
}

async function fetchWorkbookBuffer(config) {
  if (!config.fileUrl) {
    throw new Error('URL SharePoint/Excel manquante');
  }
  if (config.authMode === 'graph_share') {
    return fetchGraphShareDownload(config);
  }
  const response = await fetch(config.fileUrl, {
    method: 'GET',
    headers: buildFetchHeaders(config),
    redirect: 'follow'
  });
  if (!response.ok) {
    throw new Error('Téléchargement SharePoint impossible (' + response.status + ')');
  }
  return {
    buffer: await fetchResponseBuffer(response),
    contentType: response.headers.get('content-type') || '',
    contentDisposition: response.headers.get('content-disposition') || '',
    finalUrl: response.url || config.fileUrl,
    status: response.status,
    resolver: 'direct'
  };
}

function detectKind(payload) {
  const buffer = payload && payload.buffer ? payload.buffer : Buffer.alloc(0);
  const contentType = String(payload && payload.contentType ? payload.contentType : '').toLowerCase();
  const prefix = buffer.slice(0, 256).toString('utf8').trim().toLowerCase();
  if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b) return 'xlsx';
  if (prefix.startsWith('<!doctype html') || prefix.startsWith('<html') || prefix.includes('<head') || prefix.includes('<body')) return 'html';
  if (contentType.includes('text/csv') || contentType.includes('application/csv') || contentType.includes('text/plain')) return 'csv';
  if (/(;|,)/.test(prefix) && /\r?\n/.test(prefix)) return 'csv';
  return 'unknown';
}

async function testSource(config) {
  const remote = await fetchWorkbookBuffer(config);
  const kind = detectKind(remote);
  const result = {
    ok: true,
    kind: kind,
    contentType: remote.contentType || '',
    contentDisposition: remote.contentDisposition || '',
    finalUrl: remote.finalUrl || config.fileUrl,
    status: remote.status || 200,
    size: remote.buffer ? remote.buffer.length : 0,
    rowCount: 0,
    sheetName: '',
    resolver: remote.resolver || 'direct',
    graphItemName: remote.graphItemName || '',
    graphItemId: remote.graphItemId || ''
  };

  if (kind === 'html') {
    result.ok = false;
    result.message = 'Le lien retourne une page HTML SharePoint/Office, pas un téléchargement direct.';
    return result;
  }

  try {
    const loaded = await loadRowsFromRemoteBuffer(remote.buffer, { contentType: remote.contentType, url: remote.finalUrl });
    result.rowCount = loaded.rows.length;
    result.sheetName = loaded.sheetName || '';
    result.message = kind === 'csv'
      ? 'Source CSV exploitable détectée.'
      : 'Source Excel exploitable détectée.';
    return result;
  } catch (err) {
    result.ok = false;
    result.message = err && err.message ? err.message : 'Source non exploitable';
    return result;
  }
}

async function syncSource(actor) {
  const source = await getSourceRecord();
  if (!source) throw new Error('Source SharePoint non configurée');
  if (!source.isEnabled) throw new Error('Source SharePoint désactivée');
  const config = sanitizeConfig(source.config || {});
  const remote = await fetchWorkbookBuffer(config);
  const loaded = await loadRowsFromRemoteBuffer(remote.buffer, { contentType: remote.contentType, url: remote.finalUrl });
  if (!loaded.rows.length) {
    throw new Error('Aucune donnée importable trouvée dans le fichier SharePoint');
  }
  const sourceName = config.sourceName || source.sourceName || 'SharePoint Excel';
  const saved = await upsertPlainDataset(config.datasetKey, sourceName, loaded.rows, actor);
  await updateSyncState('success', 'Synchronisation OK', saved.rowCount, actor);
  await query(
    `INSERT INTO dashboard_external_source_audit (source_key, action, actor, details)
     VALUES ($1, 'sync_success', $2, $3::jsonb)`,
    [SOURCE_KEY, actor, JSON.stringify({ rowCount: saved.rowCount, datasetKey: saved.datasetKey, sourceName: sourceName, sheetName: loaded.sheetName || '' })]
  );
  return {
    rowCount: saved.rowCount,
    datasetKey: saved.datasetKey,
    sourceName: sourceName,
    sheetName: loaded.sheetName || ''
  };
}

async function buildPayload() {
  const source = await getSourceRecord();
  return {
    ok: true,
    source: source ? {
      sourceKey: source.sourceKey,
      provider: source.provider,
      datasetKey: source.datasetKey,
      sourceName: source.sourceName,
      config: maskConfig(source.config || {}),
      isEnabled: !!source.isEnabled,
      lastSyncStatus: source.lastSyncStatus,
      lastSyncMessage: source.lastSyncMessage,
      lastSyncAt: source.lastSyncAt,
      lastRowCount: source.lastRowCount,
      updatedBy: source.updatedBy,
      createdAt: source.createdAt,
      updatedAt: source.updatedAt
    } : null
  };
}

exports.handler = async function(event) {
  const auth = await ensureAdminAccess(event);
  if (!auth.ok) return auth.response;

  if (event.httpMethod === 'GET') {
    const payload = await buildPayload();
    await logAccess(event, 'sharepoint_source_admin_view', 'info', {
      configured: !!payload.source
    }, auth.session.user);
    return jsonResponse(200, payload);
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { ok: false, error: 'Method not allowed' });
  }

  if (!isSameOrigin(event.headers || {})) {
    await logAccess(event, 'sharepoint_source_admin_forbidden_origin', 'warn', {}, auth.session.user);
    return jsonResponse(403, { ok: false, error: 'Forbidden' });
  }

  let body;
  try {
    body = readRequestBody(event);
  } catch (err) {
    return jsonResponse(400, { ok: false, error: 'Invalid request body' });
  }

  const action = cleanText(body.action, 60);
  try {
    if (action === 'save_settings') {
      await saveSourceRecord(body, auth.session.user);
      await logAccess(event, 'sharepoint_source_admin_save', 'info', {}, auth.session.user);
      return jsonResponse(200, await buildPayload());
    }

    if (action === 'trigger_sync') {
      const result = await syncSource(auth.session.user);
      await logAccess(event, 'sharepoint_source_admin_sync', 'info', result, auth.session.user);
      return jsonResponse(200, Object.assign(await buildPayload(), { syncResult: result }));
    }

    if (action === 'test_source') {
      const source = await getSourceRecord();
      const config = sanitizeConfig(Object.assign({}, source && source.config ? source.config : {}, body || {}));
      const result = await testSource(config);
      await logAccess(event, 'sharepoint_source_admin_test', result.ok ? 'info' : 'warn', result, auth.session.user);
      return jsonResponse(200, Object.assign(await buildPayload(), { testResult: result }));
    }

    return jsonResponse(400, { ok: false, error: 'Unknown action' });
  } catch (err) {
    await updateSyncState('error', err && err.message ? err.message : 'sync_error', 0, auth.session.user).catch(() => {});
    await query(
      `INSERT INTO dashboard_external_source_audit (source_key, action, actor, details)
       VALUES ($1, 'sync_error', $2, $3::jsonb)`,
      [SOURCE_KEY, auth.session.user, JSON.stringify({ action: action, error: err && err.message ? err.message : 'sync_error' })]
    ).catch(() => {});
    await logAccess(event, 'sharepoint_source_admin_error', 'error', {
      action: action,
      error: err && err.message ? err.message : 'sharepoint_source_admin_error'
    }, auth.session.user);
    return jsonResponse(500, { ok: false, error: err && err.message ? err.message : 'Unable to process SharePoint source' });
  }
};
