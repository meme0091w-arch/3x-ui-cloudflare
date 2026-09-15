import { connect } from 'cloudflare:sockets';
import { sha224Hex } from '../auth';
import { Env } from '../types';

const te = new TextEncoder();
const td = new TextDecoder();

const BAD_HOSTS = new Set([
  'localhost', 'localhost.localdomain', 'ip6-localhost', 'ip6-loopback',
  'metadata', 'metadata.google.internal', 'metadata.goog',
  'instance-data', 'instance-data.ec2.internal'
]);

const FLUSH_INTERVAL_MS = 30_000;

export async function handleProxyUpgrade(request: Request, env: Env, path: string, ctx?: ExecutionContext) {
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
    return new Response('Expected WebSocket', { status: 426 });
  }

  const cfg = await env.DB.prepare(
    'SELECT c.id config_id,c.user_id,c.protocol,c.path,c.host,u.uuid,u.status,u.traffic_limit_bytes,u.traffic_used_bytes,u.expire_at ' +
    'FROM configs c JOIN users u ON u.id=c.user_id WHERE c.path=? AND c.active=1'
  ).bind(path).first<any>();

  if (!cfg
    || cfg.status !== 'active'
    || (cfg.expire_at && cfg.expire_at <= Date.now())
    || (cfg.traffic_limit_bytes > 0 && cfg.traffic_used_bytes >= cfg.traffic_limit_bytes)) {
    return new Response('Not found', { status: 404 });
  }

  const pair = new WebSocketPair();
  const client = pair[0];
  const server = pair[1];
  server.accept();

  const connectionId = crypto.randomUUID();
  const ip = request.headers.get('cf-connecting-ip');
  const ua = request.headers.get('user-agent') || '';

  let socket: any = null;
  let writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  // pending* is drained by flush(); total* is the running total for this connection
  // and is what the traffic limit is checked against.
  let pendingUp = 0, pendingDown = 0, totalUp = 0, totalDown = 0;
  let closed = false, flushing = false;
  // Serialises every inbound frame. Without this, two concurrent async message
  // handlers can both see socket === null (re-parsing the header as payload) and
  // can both grab the writable stream writer, which throws.
  let chain: Promise<void> = Promise.resolve();

  const overLimit = () =>
    cfg.traffic_limit_bytes > 0 &&
    cfg.traffic_used_bytes + totalUp + totalDown >= cfg.traffic_limit_bytes;

  const flush = async () => {
    if (flushing) return;
    flushing = true;
    try {
      const u = pendingUp, d = pendingDown;
      pendingUp = 0; pendingDown = 0;
      const now = Date.now();
      if (u || d) {
        const day = new Date(now).toISOString().slice(0, 10);
        await env.DB.batch([
          env.DB.prepare('INSERT INTO traffic_logs(user_id,config_id,upload_bytes,download_bytes,connection_count,logged_at) VALUES(?,?,?,?,1,?)')
            .bind(cfg.user_id, cfg.config_id, u, d, now),
          env.DB.prepare('UPDATE users SET traffic_used_bytes=traffic_used_bytes+?,last_seen_at=?,updated_at=? WHERE id=?')
            .bind(u + d, now, now, cfg.user_id),
          env.DB.prepare('INSERT INTO daily_usage(user_id,day,upload_bytes,download_bytes) VALUES(?,?,?,?) ON CONFLICT(user_id,day) DO UPDATE SET upload_bytes=upload_bytes+excluded.upload_bytes,download_bytes=download_bytes+excluded.download_bytes')
            .bind(cfg.user_id, day, u, d),
          env.DB.prepare('UPDATE connection_state SET last_seen_at=? WHERE id=?').bind(now, connectionId)
        ]);
      } else {
        await env.DB.prepare('UPDATE connection_state SET last_seen_at=? WHERE id=?').bind(now, connectionId).run();
      }
    } catch { /* accounting is best effort; never kill the tunnel over it */ }
    finally { flushing = false; }
  };

  /**
   * Suspending a user, deleting them, disabling the config or blowing through
   * the quota only used to be checked once, at connection setup. An open tunnel
   * therefore survived until the client hung up - a suspended account could keep
   * relaying for hours. Re-check the durable state on every flush tick.
   */
  const revalidate = async () => {
    try {
      const row = await env.DB.prepare(
        'SELECT c.active,u.status,u.expire_at,u.traffic_limit_bytes,u.traffic_used_bytes ' +
        'FROM configs c JOIN users u ON u.id=c.user_id WHERE c.id=?'
      ).bind(cfg.config_id).first<any>();
      if (!row || !row.active || row.status !== 'active' || (row.expire_at && row.expire_at <= Date.now())) {
        try { server.close(1008, 'Access revoked'); } catch { /* ignore */ }
        await cleanup();
        return;
      }
      // Refresh the baseline so several concurrent tunnels cannot each spend the
      // full quota independently.
      cfg.traffic_limit_bytes = row.traffic_limit_bytes;
      cfg.traffic_used_bytes = Math.max(0, Number(row.traffic_used_bytes) - (totalUp + totalDown));
      if (overLimit()) {
        try { server.close(1008, 'Traffic limit reached'); } catch { /* ignore */ }
        await cleanup();
      }
    } catch { /* transient D1 errors must not kill a healthy tunnel */ }
  };

  const timer = setInterval(() => { void flush().then(revalidate); }, FLUSH_INTERVAL_MS);

  const cleanup = async () => {
    if (closed) return;
    closed = true;
    clearInterval(timer);
    try { writer?.releaseLock(); } catch { /* ignore */ }
    try { socket?.close(); } catch { /* ignore */ }
    await flush().catch(() => {});
    await env.DB.prepare('DELETE FROM connection_state WHERE id=?').bind(connectionId).run().catch(() => {});
  };

  const onFrame = async (e: MessageEvent) => {
    if (closed) return;
    const data = e.data instanceof ArrayBuffer
      ? new Uint8Array(e.data)
      : typeof e.data === 'string'
        ? te.encode(e.data)
        : new Uint8Array(e.data as ArrayBufferLike);

    if (!socket) {
      const parsed = cfg.protocol === 'vless-ws'
        ? parseVless(data, cfg.uuid)
        : parseTrojan(data, cfg.uuid);
      if (!parsed) { server.close(1002, 'Invalid proxy header'); await cleanup(); return; }
      if (isBlockedDestination(parsed.host)) { server.close(1008, 'Destination blocked'); await cleanup(); return; }

      socket = connect({ hostname: parsed.host, port: parsed.port });
      writer = socket.writable.getWriter();
      void pump(socket, server, n => { pendingDown += n; totalDown += n; });

      if (parsed.responseHeader) server.send(parsed.responseHeader);
      if (parsed.remaining.length) {
        await writer!.write(parsed.remaining);
        pendingUp += parsed.remaining.length;
        totalUp += parsed.remaining.length;
      }
      return;
    }

    await writer!.write(data);
    pendingUp += data.length;
    totalUp += data.length;

    if (overLimit()) {
      server.close(1008, 'Traffic limit reached');
      await cleanup();
    }
  };

  // Listeners are registered synchronously, before any await. Registering them
  // after an await (as the D1 insert used to force) silently drops frames that
  // arrive in the meantime.
  server.addEventListener('message', (e: MessageEvent) => {
    chain = chain
      .then(() => onFrame(e))
      .catch(async () => {
        try { server.close(1011, 'Relay error'); } catch { /* ignore */ }
        await cleanup();
      });
  });
  server.addEventListener('close', () => void cleanup());
  server.addEventListener('error', () => void cleanup());

  const registration = env.DB.prepare(
    'INSERT INTO connection_state(id,user_id,config_id,connected_at,last_seen_at,ip,user_agent) VALUES(?,?,?,?,?,?,?)'
  ).bind(connectionId, cfg.user_id, cfg.config_id, Date.now(), Date.now(), ip, ua).run().catch(() => {});
  if (ctx) ctx.waitUntil(registration);

  return new Response(null, { status: 101, webSocket: client });
}

async function pump(s: any, ws: WebSocket, onBytes: (n: number) => void) {
  const r = s.readable.getReader();
  try {
    for (;;) {
      const x = await r.read();
      if (x.done) break;
      if (x.value) { ws.send(x.value); onBytes(x.value.length); }
    }
  } catch { /* remote closed */ }
  finally {
    try { r.releaseLock(); } catch { /* ignore */ }
    try { ws.close(); } catch { /* ignore */ }
  }
}

function parseVless(data: Uint8Array, uuid: string) {
  // VLESS request: version(1) | uuid(16) | addonLen(1) | addons | cmd(1) | port(2) | atyp(1) | addr
  // The protocol version is 0. The previous code demanded 1, which rejected
  // every real client.
  if (data.length < 24) return null;
  const version = data[0];
  if (version > 1) return null;
  if (bytesUuid(data.slice(1, 17)).toLowerCase() !== uuid.toLowerCase()) return null;

  let o = 17;
  if (o >= data.length) return null;
  const addon = data[o]; o += 1;
  if (o + addon + 4 > data.length) return null;
  o += addon;

  const cmd = data[o++];
  if (cmd !== 1) return null; // TCP only
  const port = (data[o] << 8) | data[o + 1]; o += 2;
  const atyp = data[o++];
  const r = parseAddr(data, o, atyp);
  if (!r) return null;

  return { host: r.host, port, remaining: data.slice(r.offset), responseHeader: new Uint8Array([version, 0]) };
}

function parseTrojan(data: Uint8Array, password: string) {
  // Trojan request: sha224hex(56) | CRLF | cmd(1) | atyp(1) | addr | port(2) | CRLF
  if (data.length < 62) return null;
  const expected = sha224Hex(password);
  if (td.decode(data.slice(0, 56)).toLowerCase() !== expected) return null;
  if (data[56] !== 13 || data[57] !== 10) return null;

  let o = 58;
  if (o + 2 > data.length) return null;
  const cmd = data[o++];
  if (cmd !== 1) return null; // TCP only
  const atyp = data[o++];
  const r = parseAddr(data, o, atyp);
  if (!r) return null;
  o = r.offset;

  if (o + 4 > data.length) return null;
  const port = (data[o] << 8) | data[o + 1]; o += 2;
  if (data[o] !== 13 || data[o + 1] !== 10) return null;
  o += 2;

  return { host: r.host, port, remaining: data.slice(o), responseHeader: null as Uint8Array | null };
}

function parseAddr(data: Uint8Array, o: number, type: number) {
  if (type === 1) {
    if (o + 4 > data.length) return null;
    return { host: `${data[o]}.${data[o + 1]}.${data[o + 2]}.${data[o + 3]}`, offset: o + 4 };
  }
  if (type === 2) {
    if (o >= data.length) return null;
    const n = data[o++];
    if (n === 0 || o + n > data.length) return null;
    return { host: td.decode(data.slice(o, o + n)), offset: o + n };
  }
  if (type === 3) {
    if (o + 16 > data.length) return null;
    const parts: string[] = [];
    for (let i = 0; i < 8; i++) { parts.push((((data[o] << 8) | data[o + 1]) >>> 0).toString(16)); o += 2; }
    return { host: parts.join(':'), offset: o };
  }
  return null;
}

function bytesUuid(b: Uint8Array) {
  const h = Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function isBlockedDestination(host: string) {
  const h = host.toLowerCase().replace(/^\[/, '').replace(/\]$/, '').replace(/\.$/, '');
  if (!h) return true;
  if (BAD_HOSTS.has(h) || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.localhost')) return true;

  // IPv4-mapped IPv6 (::ffff:169.254.169.254) is still an IPv4 destination.
  const mapped = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  const candidate = mapped ? mapped[1] : h;

  const v4 = candidate.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = v4.slice(1).map(Number);
    if (v4.slice(1).some(x => Number(x) > 255)) return true;
    return a === 0 || a === 10 || a === 127
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 100 && b >= 64 && b <= 127)  // CGNAT
      || (a === 192 && b === 0)              // 192.0.0.0/24 + 192.0.2.0/24
      || a >= 224;                           // multicast + reserved
  }

  if (h.includes(':')) {
    // parseAddr emits the fully expanded form (0:0:0:0:0:0:0:1), so compare on
    // normalised groups rather than on the "::1" shorthand.
    const groups = h.split(':');
    const norm = groups.map(g => g === '' ? '' : String(parseInt(g, 16) || 0));
    const compact = norm.join(':').replace(/(^|:)(0(:0)*)(:|$)/, '$1$4');
    if (h === '::' || compact === '::1' || norm.every((g, i) => g === (i === groups.length - 1 ? '1' : '0'))) return true;
    if (norm.every(g => g === '0')) return true;
    const first = parseInt(groups[0] || '0', 16);
    if ((first & 0xfe00) === 0xfc00) return true;  // fc00::/7 unique local
    if ((first & 0xffc0) === 0xfe80) return true;  // fe80::/10 link local
    if ((first & 0xff00) === 0xff00) return true;  // ff00::/8 multicast
  }
  return false;
}
