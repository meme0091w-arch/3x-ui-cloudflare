import { Hono } from 'hono';
import { Env } from '../types';
import { requireAuth, requirePermission } from '../middleware';
import { runHousekeeping } from '../db';

export const systemRoutes = new Hono<{ Bindings: Env }>();

// Manual trigger for the same job the cron runs, for anyone who cannot use
// cron triggers on their plan.
systemRoutes.post('/housekeeping', requireAuth, requirePermission('settings.write'), async c =>
  c.json({ ok: true, ...(await runHousekeeping(c.env)) }));

systemRoutes.get('/context', async c => {
  // x-forwarded-host is client controlled and was previously trusted here,
  // which let anyone spoof the hostname shown on the About/Settings pages and
  // in generated links. Behind Cloudflare the request URL is authoritative.
  const url = new URL(c.req.url);
  const host = url.hostname;
  return c.json({
    hostname: host,
    origin: url.origin,
    protocol: url.protocol,
    secure: url.protocol === 'https:',
    deployment: host.endsWith('.workers.dev') ? 'workers.dev' : 'custom-domain'
  });
});
