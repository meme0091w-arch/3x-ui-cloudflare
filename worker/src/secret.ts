import { Env } from './types';

let cachedSecret: string | null = null;

export async function getJwtSecret(env: Env): Promise<string> {
  if (env.JWT_SECRET) return env.JWT_SECRET;
  if (cachedSecret) return cachedSecret;

  const existing = await env.DB.prepare("SELECT value FROM system_state WHERE key='jwt_secret'").first<{ value: string }>();
  if (existing?.value) {
    cachedSecret = existing.value;
    return existing.value;
  }

  const generated = crypto.randomUUID().replace(/-/g, '') + generateEntropy();
  await env.DB.prepare("INSERT OR IGNORE INTO system_state(key,value,updated_at) VALUES('jwt_secret',?,?)")
    .bind(generated, Date.now()).run();
  const stored = await env.DB.prepare("SELECT value FROM system_state WHERE key='jwt_secret'").first<{ value: string }>();
  const secret = stored?.value || generated;
  cachedSecret = secret;
  return secret;
}

function generateEntropy(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
