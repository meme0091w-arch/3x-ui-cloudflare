import { Hono } from 'hono';
import { Env } from './types';
import { requireAuth, requirePermission } from './middleware';
import { authRoutes } from './routes/auth';
import { dashboardRoutes } from './routes/dashboard';
import { userRoutes } from './routes/users';
import { configRoutes } from './routes/configs';
import { subscriptionRoutes } from './routes/subscriptions';
import { trafficRoutes } from './routes/traffic';
import { logRoutes } from './routes/logs';
import { settingsRoutes } from './routes/settings';
import { backupRoutes } from './routes/backup';
import { adminRoutes } from './routes/admin';
import { systemRoutes } from './routes/system';
import { handleProxyUpgrade } from './routes/proxy';
import { runHousekeeping } from './db';

const app = new Hono<{ Bindings: Env }>();

// Subscription links are fetched by proxy clients that cannot present a bearer
// token. This prefix must stay outside every auth middleware.
const PUBLIC_PREFIX = '/api/configs/sub/';

app.use('*', async (c, next) => {
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Permissions-Policy', 'camera=(),microphone=(),geolocation=()');
  c.header('Cross-Origin-Opener-Policy', 'same-origin');
  c.header('Cross-Origin-Resource-Policy', 'same-origin');
  c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  c.header('X-DNS-Prefetch-Control', 'off');
  c.header('X-Permitted-Cross-Domain-Policies', 'none');
  c.header('Content-Security-Policy', "default-src 'self'; connect-src 'self' https: wss:; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self' data:");
  await next();
});

app.route('/api/auth', authRoutes);
app.route('/api/system', systemRoutes);

const guard = (mw: any) => async (c: any, next: any) =>
  c.req.path.startsWith(PUBLIC_PREFIX) ? next() : mw(c, next);

for (const path of ['/api/dashboard', '/api/users', '/api/configs', '/api/subscriptions', '/api/traffic', '/api/logs', '/api/settings', '/api/backup', '/api/admin']) {
  app.use(path, requireAuth);
  app.use(`${path}/*`, guard(requireAuth));
}

// `/api/x/*` does not match the bare `/api/x`, so collection roots are guarded
// inside their own route modules as well.
app.use('/api/dashboard/*', requirePermission('dashboard.read'));
app.route('/api/dashboard', dashboardRoutes);
app.route('/api/users', userRoutes);
app.route('/api/configs', configRoutes);
app.route('/api/subscriptions', subscriptionRoutes);
app.route('/api/traffic', trafficRoutes);
app.route('/api/logs', logRoutes);
app.route('/api/settings', settingsRoutes);
app.route('/api/backup', backupRoutes);
app.route('/api/admin', adminRoutes);

app.get('/health', async c => {
  let d1 = 'ok', kv = 'ok';
  try { await c.env.DB.prepare('SELECT 1').first(); } catch { d1 = 'error'; }
  try { await c.env.CACHE.put('health:probe', '1', { expirationTtl: 60 }); } catch { kv = 'error'; }
  return c.json({ status: d1 === 'ok' && kv === 'ok' ? 'ok' : 'degraded', worker: 'ok', d1, kv, timestamp: Date.now() });
});

export default {
  // Nothing pruned anything before this existed: log tables grew without bound,
  // `retention_days` was a setting nobody read, and connection_state leaked a
  // row for every isolate that died mid-tunnel.
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runHousekeeping(env).then(
      r => console.log('housekeeping', JSON.stringify(r)),
      e => console.error('housekeeping failed', e)
    ));
  },

  async fetch(req: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(req.url);
    if (req.headers.get('Upgrade')?.toLowerCase() === 'websocket' && url.pathname !== '/ws-admin') {
      return handleProxyUpgrade(req, env, url.pathname, ctx);
    }
    if (url.pathname.startsWith('/api/') || url.pathname === '/health') return app.fetch(req, env, ctx);
    if (env.ASSETS) return env.ASSETS.fetch(req);
    return new Response('3X-UI assets are not built', { status: 503 });
  }
};
