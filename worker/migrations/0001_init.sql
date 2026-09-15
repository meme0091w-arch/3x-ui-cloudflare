-- 3X-UI (Cloudflare-native) initial schema
-- 
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  must_change_password INTEGER NOT NULL DEFAULT 1,
  role TEXT NOT NULL DEFAULT 'superadmin', -- RBAC: superadmin | operator | viewer
  created_at INTEGER NOT NULL,
  last_login_at INTEGER,
  last_login_ip TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,          -- session id, mirrored in KV for fast lookup
  admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  csrf_token TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  ip TEXT,
  user_agent TEXT,
  revoked INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT UNIQUE NOT NULL,        -- used as VLESS id / Trojan password seed
  email TEXT,
  status TEXT NOT NULL DEFAULT 'active', -- active | suspended | expired
  traffic_limit_bytes INTEGER NOT NULL DEFAULT 0, -- 0 = unlimited
  traffic_used_bytes INTEGER NOT NULL DEFAULT 0,
  expire_at INTEGER,                 -- unix ms, null = never
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_seen_at INTEGER,
  note TEXT
);

CREATE TABLE IF NOT EXISTS configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  protocol TEXT NOT NULL,       -- vless-ws | trojan-ws
  remark TEXT,
  path TEXT NOT NULL,           -- websocket path
  host TEXT NOT NULL,
  tls INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,   -- opaque token used in the subscription URL
  format TEXT NOT NULL DEFAULT 'plain', -- plain | base64 | clash
  created_at INTEGER NOT NULL,
  last_accessed_at INTEGER,
  access_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS traffic_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  config_id INTEGER REFERENCES configs(id) ON DELETE SET NULL,
  upload_bytes INTEGER NOT NULL DEFAULT 0,
  download_bytes INTEGER NOT NULL DEFAULT 0,
  connection_count INTEGER NOT NULL DEFAULT 0,
  logged_at INTEGER NOT NULL      -- bucketed timestamp (e.g. per-hour)
);
CREATE INDEX IF NOT EXISTS idx_traffic_logs_user_time ON traffic_logs(user_id, logged_at);

CREATE TABLE IF NOT EXISTS daily_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,              -- YYYY-MM-DD (UTC)
  upload_bytes INTEGER NOT NULL DEFAULT 0,
  download_bytes INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, day)
);

CREATE TABLE IF NOT EXISTS analytics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  metric TEXT NOT NULL,           -- e.g. 'active_users', 'total_bandwidth'
  bucket TEXT NOT NULL,           -- e.g. '2026-09-11-14' hourly bucket
  value REAL NOT NULL DEFAULT 0,
  UNIQUE(metric, bucket)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER REFERENCES admins(id) ON DELETE SET NULL,
  action TEXT NOT NULL,           -- login | create_user | delete_user | ...
  target TEXT,
  details TEXT,                   -- JSON blob
  ip TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS system_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Seed default admin: username=admin password=admin. The first authenticated session must change it.
INSERT OR IGNORE INTO admins (id, username, password_hash, must_change_password, role, created_at)
VALUES (1, 'admin', 'pbkdf2$100000$ABEiM0RVZneImaq7zN3u/w==$gqIZR++KGAMsaWGGm/2mACweFaRVIiRsl7JYLqttthE=', 1, 'superadmin', strftime('%s','now') * 1000);

INSERT OR IGNORE INTO settings (key, value) VALUES ('panel_name', '3X-UI');
INSERT OR IGNORE INTO settings (key, value) VALUES ('created_by', 'PIXEL & PING Team');
