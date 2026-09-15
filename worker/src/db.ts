import { Env } from './types';

export async function logAudit(env: Env, adminId: number | null, action: string, target: string | null, details: unknown, ip: string | null) {
  await env.DB.prepare('INSERT INTO audit_logs(admin_id,action,target,details,ip,created_at) VALUES(?,?,?,?,?,?)')
    .bind(adminId, action, target, JSON.stringify(details ?? {}), ip, Date.now()).run();
}

export async function logSecurity(env: Env, adminId: number | null, event: string, severity: string, details: unknown, ip: string | null) {
  await env.DB.prepare('INSERT INTO security_logs(admin_id,event,severity,details,ip,created_at) VALUES(?,?,?,?,?,?)')
    .bind(adminId, event, severity, JSON.stringify(details ?? {}), ip, Date.now()).run();
}

export async function rolePermissions(env: Env, role: string) {
  const row = await env.DB.prepare('SELECT permissions FROM roles WHERE name=?').bind(role).first<{ permissions: string }>();
  if (!row) return role === 'superadmin' ? ['*'] : [];
  try { return JSON.parse(row.permissions) as string[]; } catch { return []; }
}

/**
 * Kill every live session belonging to an admin.
 *
 * Changing a password only revoked the session that made the request, so a
 * stolen token from any other browser stayed valid for the rest of its 12 hour
 * lifetime - which is exactly the situation a password change is meant to end.
 * The same applies when a superadmin resets someone else's password.
 */
export async function revokeAdminSessions(env: Env, adminId: number, exceptSessionId?: string) {
  const rows = await env.DB.prepare('SELECT id FROM sessions WHERE admin_id=? AND revoked=0').bind(adminId).all<{ id: string }>();
  const ids = rows.results.map(r => r.id).filter(id => id !== exceptSessionId);
  await Promise.all(ids.map(id => env.SESSIONS.delete(`session:${id}`).catch(() => {})));
  if (ids.length) {
    const ph = ids.map(() => '?').join(',');
    await env.DB.prepare(`UPDATE sessions SET revoked=1 WHERE id IN(${ph})`).bind(...ids).run().catch(() => {});
  }
  return ids.length;
}

/** Number of days of history to keep. Falls back to 90 when unset/invalid. */
export async function retentionDays(env: Env) {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key='retention_days'").first<{ value: string }>();
  const n = Number(row?.value);
  return Number.isFinite(n) && n >= 1 && n <= 3650 ? Math.floor(n) : 90;
}

/**
 * Housekeeping run by the cron trigger.
 *
 * Nothing used to delete anything: audit/login/security/traffic history grew
 * without bound (the `retention_days` setting existed but was never read), and
 * `connection_state` rows were only removed by the connection's own cleanup -
 * so every isolate that died mid-connection leaked a row forever.
 */
export async function runHousekeeping(env: Env) {
  const days = await retentionDays(env);
  const cutoff = Date.now() - days * 86_400_000;
  const staleConnections = Date.now() - 10 * 60_000;
  const result = await env.DB.batch([
    env.DB.prepare('DELETE FROM connection_state WHERE last_seen_at<?').bind(staleConnections),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at<?').bind(Date.now()),
    env.DB.prepare('DELETE FROM audit_logs WHERE created_at<?').bind(cutoff),
    env.DB.prepare('DELETE FROM login_logs WHERE created_at<?').bind(cutoff),
    env.DB.prepare('DELETE FROM security_logs WHERE created_at<?').bind(cutoff),
    env.DB.prepare('DELETE FROM traffic_logs WHERE logged_at<?').bind(cutoff),
    env.DB.prepare("DELETE FROM daily_usage WHERE day < date(?/1000,'unixepoch')").bind(cutoff),
    // Accounts whose expiry has passed are marked expired so the panel and the
    // proxy agree without waiting for someone to notice.
    env.DB.prepare("UPDATE users SET status='expired',updated_at=? WHERE status='active' AND expire_at IS NOT NULL AND expire_at<=?")
      .bind(Date.now(), Date.now())
  ]);
  return {
    retentionDays: days,
    connections: result[0].meta.changes,
    sessions: result[1].meta.changes,
    audit: result[2].meta.changes,
    logins: result[3].meta.changes,
    security: result[4].meta.changes,
    traffic: result[5].meta.changes,
    expired: result[7].meta.changes
  };
}
