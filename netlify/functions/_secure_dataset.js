const crypto = require('crypto');
const { ensureSchema, query, withTransaction } = require('./_db');

const DEFAULT_DATASET_KEY = 'saip-main';

function getDatasetEncryptionKey() {
  const raw = String(process.env.DATA_ENCRYPTION_KEY || '');
  if (!raw || raw.length < 32) {
    throw new Error('Missing DATA_ENCRYPTION_KEY');
  }
  return crypto.createHash('sha256').update(raw).digest();
}

function encryptDatasetPayload(payload) {
  const key = getDatasetEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    payloadNonce: iv.toString('base64'),
    payloadTag: tag.toString('base64'),
    payloadCiphertext: ciphertext.toString('base64'),
    payloadHash: crypto.createHash('sha256').update(plaintext).digest('hex'),
    rowCount: Array.isArray(payload && payload.data) ? payload.data.length : 0
  };
}

function decryptDatasetRecord(record) {
  if (!record) return null;
  const key = getDatasetEncryptionKey();
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(String(record.payloadNonce || ''), 'base64')
  );
  decipher.setAuthTag(Buffer.from(String(record.payloadTag || ''), 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(String(record.payloadCiphertext || ''), 'base64')),
    decipher.final()
  ]);
  return JSON.parse(plaintext.toString('utf8'));
}

async function upsertSecureDataset(datasetKey, sourceName, payload, actor) {
  const key = String(datasetKey || DEFAULT_DATASET_KEY).trim() || DEFAULT_DATASET_KEY;
  const encrypted = encryptDatasetPayload(payload);
  await ensureSchema();

  return withTransaction(async (client) => {
    const result = await client.query(
      `INSERT INTO dashboard_secure_datasets
        (dataset_key, source_name, payload_nonce, payload_tag, payload_ciphertext, row_count, payload_hash, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (dataset_key)
       DO UPDATE SET
         source_name = EXCLUDED.source_name,
         payload_nonce = EXCLUDED.payload_nonce,
         payload_tag = EXCLUDED.payload_tag,
         payload_ciphertext = EXCLUDED.payload_ciphertext,
         row_count = EXCLUDED.row_count,
         payload_hash = EXCLUDED.payload_hash,
         uploaded_by = EXCLUDED.uploaded_by,
         updated_at = NOW()
       RETURNING dataset_key AS "datasetKey", source_name AS "sourceName", row_count AS "rowCount",
                 payload_hash AS "payloadHash", uploaded_by AS "uploadedBy", created_at AS "createdAt", updated_at AS "updatedAt"`,
      [
        key,
        String(sourceName || ''),
        encrypted.payloadNonce,
        encrypted.payloadTag,
        encrypted.payloadCiphertext,
        encrypted.rowCount,
        encrypted.payloadHash,
        String(actor || '')
      ]
    );

    await client.query(
      `INSERT INTO dashboard_secure_dataset_audit (dataset_key, action, actor, details)
       VALUES ($1, 'upsert', $2, $3::jsonb)`,
      [key, String(actor || ''), JSON.stringify({ rowCount: encrypted.rowCount, sourceName: String(sourceName || '') })]
    );

    return result.rows[0];
  });
}

async function getSecureDataset(datasetKey) {
  const key = String(datasetKey || DEFAULT_DATASET_KEY).trim() || DEFAULT_DATASET_KEY;
  await ensureSchema();
  const result = await query(
    `SELECT dataset_key AS "datasetKey", source_name AS "sourceName", payload_nonce AS "payloadNonce",
            payload_tag AS "payloadTag", payload_ciphertext AS "payloadCiphertext", row_count AS "rowCount",
            payload_hash AS "payloadHash", uploaded_by AS "uploadedBy", created_at AS "createdAt", updated_at AS "updatedAt"
       FROM dashboard_secure_datasets
      WHERE dataset_key = $1
      LIMIT 1`,
    [key]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    meta: {
      datasetKey: row.datasetKey,
      sourceName: row.sourceName,
      rowCount: row.rowCount,
      payloadHash: row.payloadHash,
      uploadedBy: row.uploadedBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    },
    payload: decryptDatasetRecord(row)
  };
}

module.exports = {
  DEFAULT_DATASET_KEY,
  decryptDatasetRecord,
  encryptDatasetPayload,
  getSecureDataset,
  getDatasetEncryptionKey,
  upsertSecureDataset
};
