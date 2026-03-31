const { Pool } = require('pg');

let pool = null;

function getDatabaseUrl() {
  const value = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || '';
  if (!value) {
    throw new Error('Missing database URL');
  }
  return value;
}

function getPool() {
  if (pool) return pool;
  pool = new Pool({
    connectionString: getDatabaseUrl(),
    ssl: { rejectUnauthorized: false },
    max: 4,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000
  });
  return pool;
}

async function query(text, params) {
  const db = getPool();
  return db.query(text, params || []);
}

async function withTransaction(work) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw err;
  } finally {
    client.release();
  }
}

async function ensureSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS dashboard_state_documents (
      id BIGSERIAL PRIMARY KEY,
      scope TEXT NOT NULL,
      doc_type TEXT NOT NULL,
      doc_key TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      version INTEGER NOT NULL DEFAULT 1,
      UNIQUE (scope, doc_type, doc_key)
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS dashboard_state_audit (
      id BIGSERIAL PRIMARY KEY,
      scope TEXT NOT NULL,
      doc_type TEXT NOT NULL,
      doc_key TEXT NOT NULL,
      action TEXT NOT NULL,
      payload JSONB,
      actor TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS dashboard_access_logs (
      id BIGSERIAL PRIMARY KEY,
      event_type TEXT NOT NULL,
      level TEXT NOT NULL DEFAULT 'info',
      actor TEXT NOT NULL DEFAULT '',
      ip TEXT NOT NULL DEFAULT '',
      country TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT '',
      method TEXT NOT NULL DEFAULT '',
      path TEXT NOT NULL DEFAULT '',
      host TEXT NOT NULL DEFAULT '',
      origin TEXT NOT NULL DEFAULT '',
      referer TEXT NOT NULL DEFAULT '',
      request_id TEXT NOT NULL DEFAULT '',
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_dashboard_documents_type_scope ON dashboard_state_documents (doc_type, scope);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_dashboard_audit_type_scope ON dashboard_state_audit (doc_type, scope, created_at DESC);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_dashboard_access_logs_created_at ON dashboard_access_logs (created_at DESC);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_dashboard_access_logs_event_type ON dashboard_access_logs (event_type, created_at DESC);`);

  await query(`
    CREATE TABLE IF NOT EXISTS dashboard_login_attempts (
      throttle_key TEXT PRIMARY KEY,
      username_hint TEXT NOT NULL DEFAULT '',
      ip_hash TEXT NOT NULL DEFAULT '',
      user_agent_hash TEXT NOT NULL DEFAULT '',
      failure_count INTEGER NOT NULL DEFAULT 0,
      first_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      blocked_until TIMESTAMPTZ
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS dashboard_secure_datasets (
      dataset_key TEXT PRIMARY KEY,
      source_name TEXT NOT NULL DEFAULT '',
      payload_nonce TEXT NOT NULL,
      payload_tag TEXT NOT NULL,
      payload_ciphertext TEXT NOT NULL,
      row_count INTEGER NOT NULL DEFAULT 0,
      payload_hash TEXT NOT NULL DEFAULT '',
      uploaded_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS dashboard_secure_dataset_audit (
      id BIGSERIAL PRIMARY KEY,
      dataset_key TEXT NOT NULL,
      action TEXT NOT NULL,
      actor TEXT NOT NULL DEFAULT '',
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS dashboard_dataset_meta (
      dataset_key TEXT PRIMARY KEY,
      source_name TEXT NOT NULL DEFAULT '',
      row_count INTEGER NOT NULL DEFAULT 0,
      payload_hash TEXT NOT NULL DEFAULT '',
      uploaded_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS dashboard_dataset_rows (
      dataset_key TEXT NOT NULL,
      row_index INTEGER NOT NULL,
      project_id BIGINT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (dataset_key, row_index)
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS dashboard_dataset_audit (
      id BIGSERIAL PRIMARY KEY,
      dataset_key TEXT NOT NULL,
      action TEXT NOT NULL,
      actor TEXT NOT NULL DEFAULT '',
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_dashboard_login_attempts_blocked_until ON dashboard_login_attempts (blocked_until DESC);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_dashboard_secure_dataset_audit_key_created ON dashboard_secure_dataset_audit (dataset_key, created_at DESC);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_dashboard_dataset_rows_key_project_id ON dashboard_dataset_rows (dataset_key, project_id);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_dashboard_dataset_audit_key_created ON dashboard_dataset_audit (dataset_key, created_at DESC);`);
}

module.exports = {
  ensureSchema,
  getPool,
  query,
  withTransaction
};
