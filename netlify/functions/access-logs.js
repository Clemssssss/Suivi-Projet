const { evaluateAccessPolicy, getSessionPayload, jsonResponse, logAccess } = require('./_auth');
const { ensureSchema, query } = require('./_db');

function cleanText(value, max) {
  return String(value || '').trim().slice(0, max || 120);
}

function cleanLimit(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 100;
  return Math.max(1, Math.min(300, Math.floor(n)));
}

exports.handler = async function(event) {
  const session = getSessionPayload(event);
  if (!session || !session.user) {
    await logAccess(event, 'access_logs_unauthorized', 'warn', {});
    return jsonResponse(401, { ok: false, error: 'Unauthorized' });
  }

  const access = await evaluateAccessPolicy(event.headers || {});
  if (!access.allowed) {
    await logAccess(event, 'access_logs_network_blocked', 'warn', { code: access.reason || '', ip: access.ip || '' }, session.user);
    return jsonResponse(403, { ok: false, error: 'Restricted network', code: access.reason || 'ip_not_whitelisted' });
  }

  if (event.httpMethod !== 'GET') {
    await logAccess(event, 'access_logs_method_not_allowed', 'warn', { method: event.httpMethod }, session.user);
    return jsonResponse(405, { ok: false, error: 'Method not allowed' });
  }

  try {
    await ensureSchema();
    const params = event.queryStringParameters || {};
    const limit = cleanLimit(params.limit);
    const eventType = cleanText(params.eventType, 120);
    const level = cleanText(params.level, 20);
    const search = cleanText(params.search, 120);

    const where = [];
    const values = [];

    if (eventType) {
      values.push(eventType);
      where.push(`event_type = $${values.length}`);
    }
    if (level) {
      values.push(level);
      where.push(`level = $${values.length}`);
    }
    if (search) {
      values.push('%' + search + '%');
      where.push(`(
        actor ILIKE $${values.length}
        OR ip ILIKE $${values.length}
        OR country ILIKE $${values.length}
        OR user_agent ILIKE $${values.length}
        OR path ILIKE $${values.length}
        OR event_type ILIKE $${values.length}
      )`);
    }

    values.push(limit);
    const sql = `
      SELECT id, event_type AS "eventType", level, actor, ip, country,
             user_agent AS "userAgent", method, path, host, origin, referer,
             request_id AS "requestId", details, created_at AS "createdAt"
      FROM dashboard_access_logs
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY created_at DESC
      LIMIT $${values.length}
    `;

    const result = await query(sql, values);
    await logAccess(event, 'access_logs_view', 'info', {
      eventTypeFilter: eventType,
      levelFilter: level,
      search: search,
      count: result.rows.length
    }, session.user);

    return jsonResponse(200, {
      ok: true,
      logs: result.rows
    });
  } catch (err) {
    await logAccess(event, 'access_logs_error', 'error', {
      error: err && err.message ? err.message : 'access_logs_error'
    }, session.user);
    return jsonResponse(500, { ok: false, error: 'Unable to load logs' });
  }
};
