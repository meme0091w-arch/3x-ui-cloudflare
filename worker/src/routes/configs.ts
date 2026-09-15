import { Hono } from 'hono';
import { Env } from '../types';
import { getAuth, requirePermission } from '../middleware';
import { logAudit } from '../db';

export const configRoutes = new Hono<{ Bindings: Env }>();

function vless(uuid: string, host: string, path: string, remark: string) {
  const q = new URLSearchParams({ encryption: 'none', security: 'tls', type: 'ws', host, path, sni: host });
  return `vless://${uuid}@${host}:443?${q}#${encodeURIComponent(remark)}`;
}
function trojan(password: string, host: string, path: string, remark: string) {
  const q = new URLSearchParams({ security: 'tls', type: 'ws', host, path, sni: host });
  return `trojan://${password}@${host}:443?${q}#${encodeURIComponent(remark)}`;
}
function uri(cfg: any, user: any) {
  return cfg.protocol === 'vless-ws'
    ? vless(user.uuid, cfg.host, cfg.path, cfg.remark || '3X-UI')
    : trojan(user.uuid, cfg.host, cfg.path, cfg.remark || '3X-UI');
}

// Clash and sing-box require unique node names. The old code derived the proxy
// name and the proxy-group entry from two different expressions, so an empty
// remark produced a group pointing at a node that did not exist.
function nodeNames(rows: any[]) {
  const seen = new Map<string, number>();
  return rows.map((x: any) => {
    const base = String(x.remark || x.protocol || '3X-UI').trim() || '3X-UI';
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base} #${n}`;
  });
}
const yaml = (s: string) => `'${s.replace(/'/g, "''")}'`;

configRoutes.get('/', requirePermission('configs.read'), async c => {
  const rows = await c.env.DB.prepare(
    'SELECT c.*,u.email,u.uuid,u.status user_status FROM configs c JOIN users u ON u.id=c.user_id ORDER BY c.created_at DESC'
  ).all();
  return c.json({ configs: rows.results });
});

configRoutes.get('/user/:userId', requirePermission('configs.read'), async c => {
  const rows = await c.env.DB.prepare('SELECT * FROM configs WHERE user_id=? ORDER BY created_at DESC')
    .bind(Number(c.req.param('userId'))).all();
  return c.json({ configs: rows.results });
});

configRoutes.post('/', requirePermission('configs.write'), async c => {
  const a = getAuth(c);
  const body: any = await c.req.json().catch(() => null);
  if (!['vless-ws', 'trojan-ws'].includes(body?.protocol)) return c.json({ error: 'Only VLESS WS and Trojan WS are supported' }, 400);
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE id=?').bind(Number(body.userId)).first<any>();
  if (!user) return c.json({ error: 'User not found' }, 404);
  const host = new URL(c.req.url).hostname;
  if (!host || host === 'localhost' || host === '127.0.0.1') return c.json({ error: 'A deployed hostname is required to create proxy configs' }, 400);
  const path = `/${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
  const now = Date.now();
  const remark = String(body.remark || '3X-UI').slice(0, 120);
  const r = await c.env.DB.prepare(
    'INSERT INTO configs(user_id,protocol,remark,path,host,tls,active,created_at,settings_json) VALUES(?,?,?,?,?,1,1,?,?)'
  ).bind(user.id, body.protocol, remark, path, host, now, JSON.stringify({ network: 'ws', security: 'tls' })).run();
  const id = Number(r.meta.last_row_id);
  const config = await c.env.DB.prepare('SELECT * FROM configs WHERE id=?').bind(id).first<any>();
  await logAudit(c.env, a.adminId, 'create_config', String(id), { userId: user.id, protocol: body.protocol }, c.req.header('cf-connecting-ip') || null);
  return c.json({ config, uri: uri(config, user) }, 201);
});

configRoutes.patch('/:id', requirePermission('configs.write'), async c => {
  const a = getAuth(c);
  const id = Number(c.req.param('id'));
  const body: any = await c.req.json().catch(() => null);
  const sets: string[] = [], bind: any[] = [];
  if (body?.remark !== undefined) { sets.push('remark=?'); bind.push(String(body.remark).slice(0, 120)); }
  if (body?.active !== undefined) { sets.push('active=?'); bind.push(body.active ? 1 : 0); }
  if (!sets.length) return c.json({ error: 'No changes' }, 400);
  bind.push(id);
  const r = await c.env.DB.prepare(`UPDATE configs SET ${sets.join(',')} WHERE id=?`).bind(...bind).run();
  if (!r.meta.changes) return c.json({ error: 'Not found' }, 404);
  await logAudit(c.env, a.adminId, 'update_config', String(id), body, c.req.header('cf-connecting-ip') || null);
  return c.json({ ok: true });
});

configRoutes.delete('/:id', requirePermission('configs.write'), async c => {
  const a = getAuth(c);
  const id = Number(c.req.param('id'));
  const r = await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM connection_state WHERE config_id=?').bind(id),
    c.env.DB.prepare('DELETE FROM configs WHERE id=?').bind(id)
  ]);
  if (!r[1].meta.changes) return c.json({ error: 'Not found' }, 404);
  await logAudit(c.env, a.adminId, 'delete_config', String(id), {}, c.req.header('cf-connecting-ip') || null);
  return c.json({ ok: true });
});

// Public: proxy clients fetch this without a bearer token.
configRoutes.get('/sub/:token', async c => {
  const sub = await c.env.DB.prepare('SELECT * FROM subscriptions WHERE token=?').bind(c.req.param('token')).first<any>();
  if (!sub || sub.disabled || (sub.expire_at && sub.expire_at <= Date.now())) return c.text('Not found', 404);
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE id=?').bind(sub.user_id).first<any>();
  if (!user || user.status !== 'active' || (user.expire_at && user.expire_at <= Date.now())) return c.text('Not found', 404);
  if (user.traffic_limit_bytes > 0 && user.traffic_used_bytes >= user.traffic_limit_bytes) return c.text('Not found', 404);

  const rows = await c.env.DB.prepare('SELECT * FROM configs WHERE user_id=? AND active=1 ORDER BY id').bind(user.id).all<any>();
  const list = rows.results as any[];
  const names = nodeNames(list);
  const uris = list.map(x => uri(x, user));

  await c.env.DB.prepare('UPDATE subscriptions SET last_accessed_at=?,access_count=access_count+1 WHERE id=?')
    .bind(Date.now(), sub.id).run().catch(() => {});

  // Many clients read these headers to show remaining quota / expiry.
  const headers: Record<string, string> = {
    'cache-control': 'no-store',
    'profile-update-interval': '12',
    'subscription-userinfo': `upload=0; download=${Number(user.traffic_used_bytes) || 0}; total=${Number(user.traffic_limit_bytes) || 0}; expire=${user.expire_at ? Math.floor(user.expire_at / 1000) : 0}`
  };

  const fmt = sub.format;
  if (fmt === 'base64' || fmt === 'v2rayn' || fmt === 'nekobox') {
    // btoa() throws on any code point above U+00FF; encode UTF-8 first.
    const raw = uris.join('\n');
    const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(raw)));
    return new Response(b64, { headers: { ...headers, 'content-type': 'text/plain;charset=UTF-8' } });
  }

  if (fmt === 'clash-meta') {
    const proxies = list.map((x: any, i: number) => x.protocol === 'vless-ws'
      ? `  - name: ${yaml(names[i])}\n    type: vless\n    server: ${x.host}\n    port: 443\n    uuid: ${user.uuid}\n    udp: true\n    tls: true\n    servername: ${x.host}\n    network: ws\n    ws-opts:\n      path: ${x.path}\n      headers:\n        Host: ${x.host}`
      : `  - name: ${yaml(names[i])}\n    type: trojan\n    server: ${x.host}\n    port: 443\n    password: ${user.uuid}\n    udp: true\n    sni: ${x.host}\n    network: ws\n    ws-opts:\n      path: ${x.path}\n      headers:\n        Host: ${x.host}`
    ).join('\n');
    const body = `proxies:\n${proxies}\nproxy-groups:\n  - name: 3X-UI\n    type: select\n    proxies:\n${names.map(n => `      - ${yaml(n)}`).join('\n')}\nrules:\n  - MATCH,3X-UI\n`;
    return new Response(body, { headers: { ...headers, 'content-type': 'text/yaml;charset=UTF-8' } });
  }

  if (fmt === 'sing-box') {
    const out = list.map((x: any, i: number) => x.protocol === 'vless-ws'
      ? { type: 'vless', tag: names[i], server: x.host, server_port: 443, uuid: user.uuid, tls: { enabled: true, server_name: x.host }, transport: { type: 'ws', path: x.path, headers: { Host: x.host } } }
      : { type: 'trojan', tag: names[i], server: x.host, server_port: 443, password: user.uuid, tls: { enabled: true, server_name: x.host }, transport: { type: 'ws', path: x.path, headers: { Host: x.host } } });
    return new Response(JSON.stringify({ outbounds: out }), { headers: { ...headers, 'content-type': 'application/json;charset=UTF-8' } });
  }

  return new Response(uris.join('\n'), { headers: { ...headers, 'content-type': 'text/plain;charset=UTF-8' } });
});
