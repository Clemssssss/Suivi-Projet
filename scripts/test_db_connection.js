const { query } = require('../netlify/functions/_db');

async function main() {
  const res = await query('select now() as server_time, current_database() as db_name, current_user as db_user');
  const row = (res && res.rows && res.rows[0]) || {};
  console.log(JSON.stringify({
    ok: true,
    serverTime: row.server_time || null,
    database: row.db_name || null,
    user: row.db_user || null
  }, null, 2));
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
