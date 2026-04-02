const crypto = require('crypto');
const { Client } = require('pg');

function toBase64Url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function hashPassword(password) {
  const iterations = 210000;
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(String(password), salt, iterations, 32, 'sha256');
  return 'pbkdf2_sha256$' + iterations + '$' + toBase64Url(salt) + '$' + toBase64Url(hash);
}

function getDatabaseUrl() {
  const value = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || '';
  if (!value) throw new Error('Missing database URL: define NEON_DATABASE_URL or DATABASE_URL');
  return value;
}

async function ensureSchema(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS dashboard_auth_users (
      username TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_by TEXT NOT NULL DEFAULT '',
      updated_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function main() {
  const username = String(process.argv[2] || 'consultation').trim();
  const password = process.argv[3];
  const suppliedHash = process.argv[4];

  if (!username) {
    throw new Error('Username is required');
  }

  if (!password && !suppliedHash) {
    throw new Error('Usage: node scripts/create_consultation_user.js [username] <password> [passwordHash]');
  }

  const passwordHash = suppliedHash || hashPassword(password);
  const client = new Client({
    connectionString: getDatabaseUrl(),
    ssl: { rejectUnauthorized: String(process.env.DB_SSL_REJECT_UNAUTHORIZED || 'true').toLowerCase() !== 'false' }
  });

  await client.connect();
  try {
    await ensureSchema(client);
    await client.query(
      `
      INSERT INTO dashboard_auth_users (
        username,
        password_hash,
        role,
        is_active,
        created_by,
        updated_by,
        created_at,
        updated_at
      ) VALUES ($1, $2, 'consultation', TRUE, 'admin', 'admin', NOW(), NOW())
      ON CONFLICT (username)
      DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        role = 'consultation',
        is_active = TRUE,
        updated_by = 'admin',
        updated_at = NOW()
      `,
      [username, passwordHash]
    );

    console.log('Consultation user ready:', username);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err && err.message ? err.message : err);
  process.exit(1);
});
