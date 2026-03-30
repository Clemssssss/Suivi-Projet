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

  await query(`CREATE INDEX IF NOT EXISTS idx_dashboard_documents_type_scope ON dashboard_state_documents (doc_type, scope);`);
  await query(`CREATE INDEX IF NOT EXISTS idx_dashboard_audit_type_scope ON dashboard_state_audit (doc_type, scope, created_at DESC);`);
}

module.exports = {
  ensureSchema,
  getPool,
  query,
  withTransaction
};
