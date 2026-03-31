const { getSessionPayload, jsonResponse, logAccess } = require('./_auth');
const { getPlainDataset, DEFAULT_DATASET_KEY } = require('./_plain_dataset');
const { getSecureDataset } = require('./_secure_dataset');

exports.handler = async function(event) {
  const session = getSessionPayload(event);
  if (!session || !session.user) {
    await logAccess(event, 'dataset_projects_unauthorized', 'warn', {});
    return jsonResponse(401, { ok: false, error: 'Unauthorized' });
  }

  if (event.httpMethod !== 'GET') {
    await logAccess(event, 'dataset_projects_method_not_allowed', 'warn', { method: event.httpMethod }, session.user);
    return jsonResponse(405, { ok: false, error: 'Method not allowed' });
  }

  const params = event.queryStringParameters || {};
  const datasetKey = String(params.datasetKey || DEFAULT_DATASET_KEY).trim() || DEFAULT_DATASET_KEY;

  try {
    let record = await getPlainDataset(datasetKey);
    let source = 'plain';

    if (!record || !Array.isArray(record.data)) {
      const legacy = await getSecureDataset(datasetKey);
      if (legacy && legacy.payload && Array.isArray(legacy.payload.data)) {
        record = {
          meta: legacy.meta,
          data: legacy.payload.data
        };
        source = 'secure_fallback';
      }
    }

    if (!record || !Array.isArray(record.data)) {
      await logAccess(event, 'dataset_projects_not_found', 'warn', { datasetKey }, session.user);
      return jsonResponse(404, { ok: false, error: 'Dataset not found' });
    }

    await logAccess(event, 'dataset_projects_loaded', 'info', {
      datasetKey,
      rowCount: record.meta.rowCount,
      sourceName: record.meta.sourceName,
      storageMode: source
    }, session.user);

    return jsonResponse(200, {
      ok: true,
      datasetKey: datasetKey,
      sourceName: record.meta.sourceName,
      rowCount: record.meta.rowCount,
      updatedAt: record.meta.updatedAt,
      payloadHash: record.meta.payloadHash,
      storageMode: source,
      data: record.data
    });
  } catch (err) {
    console.error('[dataset-projects] Unexpected error', err);
    await logAccess(event, 'dataset_projects_error', 'error', {
      datasetKey,
      error: err && err.message ? err.message : 'dataset_error'
    }, session.user);
    return jsonResponse(500, { ok: false, error: 'Dataset error' });
  }
};
