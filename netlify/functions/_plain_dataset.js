const crypto = require('crypto');
const { ensureSchema, query, withTransaction } = require('./_db');

const DEFAULT_DATASET_KEY = 'saip-main';

function computePayloadHash(rows) {
  const serialized = JSON.stringify(Array.isArray(rows) ? rows : []);
  return crypto.createHash('sha256').update(serialized).digest('hex');
}

async function upsertPlainDataset(datasetKey, sourceName, rows, actor) {
  const key = String(datasetKey || DEFAULT_DATASET_KEY).trim() || DEFAULT_DATASET_KEY;
  const list = Array.isArray(rows) ? rows : [];
  const payloadHash = computePayloadHash(list);
  await ensureSchema();

  return withTransaction(async (client) => {
    await client.query('DELETE FROM dashboard_dataset_rows WHERE dataset_key = $1', [key]);

    if (list.length) {
      const values = [];
      const params = [];
      let index = 1;

      list.forEach((row, rowIndex) => {
        values.push(`($${index++}, $${index++}, $${index++}, $${index++}::jsonb)`);
        params.push(
          key,
          rowIndex,
          Number(row && row.id) || (rowIndex + 1),
          JSON.stringify(row || {})
        );
      });

      await client.query(
        `INSERT INTO dashboard_dataset_rows (dataset_key, row_index, project_id, payload)
         VALUES ${values.join(', ')}`,
        params
      );
    }

    const result = await client.query(
      `INSERT INTO dashboard_dataset_meta
        (dataset_key, source_name, row_count, payload_hash, uploaded_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (dataset_key)
       DO UPDATE SET
         source_name = EXCLUDED.source_name,
         row_count = EXCLUDED.row_count,
         payload_hash = EXCLUDED.payload_hash,
         uploaded_by = EXCLUDED.uploaded_by,
         updated_at = NOW()
       RETURNING dataset_key AS "datasetKey", source_name AS "sourceName", row_count AS "rowCount",
                 payload_hash AS "payloadHash", uploaded_by AS "uploadedBy", created_at AS "createdAt", updated_at AS "updatedAt"`,
      [key, String(sourceName || ''), list.length, payloadHash, String(actor || '')]
    );

    await client.query(
      `INSERT INTO dashboard_dataset_audit (dataset_key, action, actor, details)
       VALUES ($1, 'upsert_plain', $2, $3::jsonb)`,
      [key, String(actor || ''), JSON.stringify({ rowCount: list.length, sourceName: String(sourceName || '') })]
    );

    return result.rows[0];
  });
}

async function getPlainDataset(datasetKey) {
  const key = String(datasetKey || DEFAULT_DATASET_KEY).trim() || DEFAULT_DATASET_KEY;
  await ensureSchema();

  const metaResult = await query(
    `SELECT dataset_key AS "datasetKey", source_name AS "sourceName", row_count AS "rowCount",
            payload_hash AS "payloadHash", uploaded_by AS "uploadedBy", created_at AS "createdAt", updated_at AS "updatedAt"
       FROM dashboard_dataset_meta
      WHERE dataset_key = $1
      LIMIT 1`,
    [key]
  );

  const meta = metaResult.rows[0];
  if (!meta) return null;

  const rowsResult = await query(
    `SELECT payload
       FROM dashboard_dataset_rows
      WHERE dataset_key = $1
      ORDER BY row_index ASC`,
    [key]
  );

  return {
    meta,
    data: rowsResult.rows.map((row) => row.payload || {})
  };
}

module.exports = {
  DEFAULT_DATASET_KEY,
  getPlainDataset,
  upsertPlainDataset
};
