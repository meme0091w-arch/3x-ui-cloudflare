import { Hono } from 'hono';
import { Env } from '../types';
import { getAuth, requirePermission } from '../middleware';
import { logAudit } from '../db';

export const trafficRoutes = new Hono<{ Bindings: Env }>();

trafficRoutes.get('/', requirePermission('traffic.read'), async c => {
  const { userId = '', from = '', to = '', page = '1', pageSize = '50' } = c.req.query();
  const limit = Math.min(Math.max(Number(pageSize) || 50, 1), 100);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;
  let where = 'WHERE 1=1';
  const b: any[] = [];
  if (userId) { where += ' AND t.user_id=?'; b.push(Number(userId)); }
  if (from) { where += ' AND t.logged_at>=?'; b.push(Number(from)); }
  if (to) { where += ' AND t.logged_at<=?'; b.push(Number(to)); }
  const rows = await c.env.DB.prepare(
    `SELECT t.*,u.email FROM traffic_logs t JOIN users u ON u.id=t.user_id ${where} ORDER BY t.logged_at DESC LIMIT ? OFFSET ?`
  ).bind(...b, limit, offset).all();
  return c.json({ rows: rows.results });
});

trafficRoutes.get('/summary', requirePermission('traffic.read'), async c => {
  const rows = await c.env.DB.prepare(
    `SELECT u.id,u.email,u.status,u.traffic_limit_bytes,u.traffic_used_bytes,u.last_seen_at,
            COALESCE(SUM(t.upload_bytes),0) upload, COALESCE(SUM(t.download_bytes),0) download
     FROM users u LEFT JOIN traffic_logs t ON t.user_id=u.id
     GROUP BY u.id ORDER BY (upload+download) DESC`
  ).all();
  return c.json({ users: rows.results });
});

// Reconcile rewrites every user's counter, so it is a write operation. It used
// to inherit `traffic.read`, which let read-only viewers trigger it.
trafficRoutes.post('/reconcile', requirePermission('traffic.write'), async c => {
  const a = getAuth(c);
  const rows = await c.env.DB.prepare('SELECT user_id,SUM(upload_bytes+download_bytes) total FROM traffic_logs GROUP BY user_id').all<any>();
  const now = Date.now();
  const stmts = rows.results.map((r: any) =>
    c.env.DB.prepare('UPDATE users SET traffic_used_bytes=?,updated_at=? WHERE id=?').bind(Number(r.total || 0), now, r.user_id)
  );
  // One statement per user in a sequential loop times out on larger panels.
  for (let i = 0; i < stmts.length; i += 50) await c.env.DB.batch(stmts.slice(i, i + 50));
  await logAudit(c.env, a.adminId, 'traffic_reconcile', null, { users: stmts.length }, c.req.header('cf-connecting-ip') || null);
  return c.json({ ok: true, users: stmts.length });
});
