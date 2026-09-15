import { Hono } from 'hono';
import { Env } from '../types';
import { hashPassword } from '../auth';
import { getAuth, requirePermission } from '../middleware';
import { logAudit, revokeAdminSessions } from '../db';

export const adminRoutes = new Hono<{ Bindings: Env }>();
const ip = (c: any) => c.req.header('cf-connecting-ip') || null;

async function superadminCount(env: Env) {
  const r = await env.DB.prepare("SELECT COUNT(*) n FROM admins WHERE role='superadmin'").first<{ n: number }>();
  return Number(r?.n || 0);
}

adminRoutes.get('/admins', requirePermission('admin.read'), async c => {
  const rows = await c.env.DB.prepare('SELECT id,username,role,must_change_password,created_at,last_login_at,last_login_ip FROM admins ORDER BY id').all();
  return c.json({ admins: rows.results });
});

adminRoutes.post('/admins', requirePermission('admin.write'), async c => {
  const a = getAuth(c);
  const b: any = await c.req.json().catch(() => null);
  const username = String(b?.username || '').trim();
  const password = String(b?.password || '');
  if (!/^[A-Za-z0-9_.-]{3,64}$/.test(username) || password.length < 10) return c.json({ error: 'Invalid username or password' }, 400);
  const role = String(b?.role || 'viewer');
  const r = await c.env.DB.prepare('SELECT 1 FROM roles WHERE name=?').bind(role).first();
  if (!r) return c.json({ error: 'Unknown role' }, 400);
  try {
    const x = await c.env.DB.prepare('INSERT INTO admins(username,password_hash,must_change_password,role,created_at) VALUES(?,?,?,?,?)')
      .bind(username, await hashPassword(password), 1, role, Date.now()).run();
    await logAudit(c.env, a.adminId, 'create_admin', String(x.meta.last_row_id), { username, role }, ip(c));
    return c.json({ id: Number(x.meta.last_row_id) }, 201);
  } catch { return c.json({ error: 'Username already exists' }, 409); }
});

adminRoutes.patch('/admins/:id', requirePermission('admin.write'), async c => {
  const a = getAuth(c);
  const id = Number(c.req.param('id'));
  if (!Number.isInteger(id)) return c.json({ error: 'Invalid id' }, 400);
  const b: any = await c.req.json().catch(() => null);
  const target = await c.env.DB.prepare('SELECT id,role FROM admins WHERE id=?').bind(id).first<any>();
  if (!target) return c.json({ error: 'Not found' }, 404);

  const sets: string[] = [];
  const bind: any[] = [];
  if (b?.role) {
    const ok = await c.env.DB.prepare('SELECT 1 FROM roles WHERE name=?').bind(b.role).first();
    if (!ok) return c.json({ error: 'Unknown role' }, 400);
    // Demoting the only superadmin locks everyone out of the panel permanently.
    if (target.role === 'superadmin' && b.role !== 'superadmin' && await superadminCount(c.env) <= 1) {
      return c.json({ error: 'Cannot demote the last superadmin' }, 409);
    }
    sets.push('role=?'); bind.push(b.role);
  }
  if (b?.password) {
    if (String(b.password).length < 10) return c.json({ error: 'Weak password' }, 400);
    sets.push('password_hash=?', 'must_change_password=1');
    bind.push(await hashPassword(String(b.password)));
  }
  if (!sets.length) return c.json({ error: 'No changes' }, 400);
  bind.push(id);
  const r = await c.env.DB.prepare(`UPDATE admins SET ${sets.join(',')} WHERE id=?`).bind(...bind).run();
  if (!r.meta.changes) return c.json({ error: 'Not found' }, 404);
  // A password reset or a role change must not leave the target's existing
  // tokens usable for the rest of their 12 hour lifetime.
  if (b?.password || b?.role) await revokeAdminSessions(c.env, id, id === a.adminId ? a.sessionId : undefined);
  await logAudit(c.env, a.adminId, 'update_admin', String(id), { role: b?.role, passwordChanged: !!b?.password }, ip(c));
  return c.json({ ok: true });
});

adminRoutes.delete('/admins/:id', requirePermission('admin.write'), async c => {
  const a = getAuth(c);
  const id = Number(c.req.param('id'));
  if (id === a.adminId) return c.json({ error: 'You cannot delete your current account' }, 400);
  const target = await c.env.DB.prepare('SELECT id,role FROM admins WHERE id=?').bind(id).first<any>();
  if (!target) return c.json({ error: 'Not found' }, 404);
  if (target.role === 'superadmin' && await superadminCount(c.env) <= 1) {
    return c.json({ error: 'Cannot delete the last superadmin' }, 409);
  }
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM sessions WHERE admin_id=?').bind(id),
    c.env.DB.prepare('DELETE FROM admins WHERE id=?').bind(id)
  ]);
  await logAudit(c.env, a.adminId, 'delete_admin', String(id), {}, ip(c));
  return c.json({ ok: true });
});

adminRoutes.get('/roles', requirePermission('admin.read'), async c =>
  c.json({ roles: (await c.env.DB.prepare('SELECT * FROM roles ORDER BY id').all()).results }));

adminRoutes.put('/roles/:name', requirePermission('admin.write'), async c => {
  const a = getAuth(c);
  const name = c.req.param('name');
  const b: any = await c.req.json().catch(() => null);
  // superadmin must keep its wildcard, otherwise the panel can be bricked with
  // a single request and no account can ever restore it.
  if (name === 'superadmin') return c.json({ error: 'The superadmin role cannot be modified' }, 403);
  if (!['operator', 'viewer'].includes(name) || !Array.isArray(b?.permissions)) return c.json({ error: 'Invalid role' }, 400);
  const permissions = [...new Set(b.permissions.map((x: any) => String(x)).filter(Boolean))].slice(0, 100)
    .filter(p => p !== '*'); // only superadmin may hold the wildcard
  await c.env.DB.prepare('UPDATE roles SET permissions=?,description=? WHERE name=?')
    .bind(JSON.stringify(permissions), String(b.description || '').slice(0, 200), name).run();
  await logAudit(c.env, a.adminId, 'update_role', name, { permissions }, ip(c));
  return c.json({ ok: true });
});
