import { Hono } from 'hono';
import { Env } from '../types';
import { requirePermission } from '../middleware';

export const logRoutes = new Hono<{ Bindings: Env }>();

function csv(rows: any[]) {
  if (!rows.length) return '';
  const keys = [...new Set(rows.flatMap(x => Object.keys(x)))];
  // Prefix formula-leading cells so spreadsheet apps do not evaluate log text.
  const q = (v: any) => {
    const s = String(v ?? '');
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  return [keys.map(q).join(','), ...rows.map(r => keys.map(k => q(r[k])).join(','))].join('\n');
}

async function rowsFor(c: any, type: string, search: string, limit: number, offset: number) {
  const like = `%${search}%`;
  let q = '';
  const b: any[] = [];
  if (type === 'audit') {
    q = 'SELECT a.*,ad.username FROM audit_logs a LEFT JOIN admins ad ON ad.id=a.admin_id WHERE 1=1';
    if (search) { q += ' AND (a.action LIKE ? OR a.target LIKE ? OR a.details LIKE ? OR ad.username LIKE ?)'; b.push(like, like, like, like); }
    q += ' ORDER BY a.created_at DESC LIMIT ? OFFSET ?';
  } else if (type === 'login') {
    // Search used to be silently dropped for these three types.
    q = 'SELECT l.*,a.username FROM login_logs l LEFT JOIN admins a ON a.id=l.admin_id WHERE 1=1';
    if (search) { q += ' AND (l.username LIKE ? OR l.ip LIKE ? OR l.reason LIKE ?)'; b.push(like, like, like); }
    q += ' ORDER BY l.created_at DESC LIMIT ? OFFSET ?';
  } else if (type === 'security') {
    q = 'SELECT s.*,a.username FROM security_logs s LEFT JOIN admins a ON a.id=s.admin_id WHERE 1=1';
    if (search) { q += ' AND (s.event LIKE ? OR s.severity LIKE ? OR s.details LIKE ? OR s.ip LIKE ?)'; b.push(like, like, like, like); }
    q += ' ORDER BY s.created_at DESC LIMIT ? OFFSET ?';
  } else {
    q = 'SELECT t.*,u.email FROM traffic_logs t JOIN users u ON u.id=t.user_id WHERE 1=1';
    if (search) { q += ' AND (u.email LIKE ? OR u.uuid LIKE ?)'; b.push(like, like); }
    q += ' ORDER BY t.logged_at DESC LIMIT ? OFFSET ?';
  }
  return (await c.env.DB.prepare(q).bind(...b, limit, offset).all()).results;
}

logRoutes.get('/', requirePermission('logs.read'), async c => {
  const { type = 'audit', search = '', page = '1', pageSize = '50' } = c.req.query();
  if (!['audit', 'login', 'security', 'traffic'].includes(type)) return c.json({ error: 'Invalid log type' }, 400);
  const limit = Math.min(Math.max(Number(pageSize) || 50, 1), 100);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;
  return c.json({ type, rows: await rowsFor(c, type, search, limit, offset) });
});

logRoutes.get('/export', requirePermission('logs.read'), async c => {
  const { type = 'audit', search = '' } = c.req.query();
  if (!['audit', 'login', 'security', 'traffic'].includes(type)) return c.json({ error: 'Invalid log type' }, 400);
  const rows = await rowsFor(c, type, search, 5000, 0);
  return new Response(csv(rows as any[]), {
    headers: {
      'content-type': 'text/csv;charset=UTF-8',
      'content-disposition': `attachment; filename="3xui-${type}-logs.csv"`
    }
  });
});
