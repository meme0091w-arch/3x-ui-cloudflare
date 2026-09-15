-- NOTE: D1 does not honour PRAGMA foreign_keys inside migrations. Cascades are
-- performed explicitly in the worker (see routes/users.ts cascadeDelete).
CREATE TABLE IF NOT EXISTS roles (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, description TEXT NOT NULL DEFAULT '', permissions TEXT NOT NULL DEFAULT '[]', created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS login_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, admin_id INTEGER REFERENCES admins(id) ON DELETE SET NULL, username TEXT, success INTEGER NOT NULL, ip TEXT, user_agent TEXT, reason TEXT, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS security_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, admin_id INTEGER REFERENCES admins(id) ON DELETE SET NULL, event TEXT NOT NULL, severity TEXT NOT NULL DEFAULT 'info', details TEXT NOT NULL DEFAULT '{}', ip TEXT, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS user_tags (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, tag TEXT NOT NULL, PRIMARY KEY(user_id, tag));
CREATE TABLE IF NOT EXISTS connection_state (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, config_id INTEGER REFERENCES configs(id) ON DELETE SET NULL, connected_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL, ip TEXT, user_agent TEXT);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_created ON login_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_created ON security_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_configs_path ON configs(path);
CREATE INDEX IF NOT EXISTS idx_daily_day ON daily_usage(day);
INSERT OR IGNORE INTO roles(name,description,permissions,created_at) VALUES
('superadmin','Full system access','["*"]',strftime('%s','now')*1000),
('operator','Manage users and proxy configuration','["dashboard.read","users.read","users.write","configs.read","configs.write","subscriptions.read","subscriptions.write","traffic.read","analytics.read","logs.read","settings.read"]',strftime('%s','now')*1000),
('viewer','Read-only panel access','["dashboard.read","users.read","configs.read","subscriptions.read","traffic.read","analytics.read","logs.read"]',strftime('%s','now')*1000);
UPDATE admins SET role='superadmin' WHERE role IS NULL OR role='';
ALTER TABLE subscriptions ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE subscriptions ADD COLUMN expire_at INTEGER;
ALTER TABLE configs ADD COLUMN settings_json TEXT NOT NULL DEFAULT '{}';
