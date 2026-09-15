-- traffic/reconcile rewrites every user's counter, so it now requires
-- traffic.write. Grant it to operator; viewer stays read-only.
UPDATE roles
SET permissions = '["dashboard.read","users.read","users.write","configs.read","configs.write","subscriptions.read","subscriptions.write","traffic.read","traffic.write","analytics.read","logs.read","settings.read"]'
WHERE name = 'operator';

-- Guarantee the superadmin role always holds the wildcard.
UPDATE roles SET permissions = '["*"]' WHERE name = 'superadmin';

-- Clean up rows orphaned by deletes made before the explicit cascade existed.
DELETE FROM configs          WHERE user_id NOT IN (SELECT id FROM users);
DELETE FROM subscriptions    WHERE user_id NOT IN (SELECT id FROM users);
DELETE FROM user_tags        WHERE user_id NOT IN (SELECT id FROM users);
DELETE FROM daily_usage      WHERE user_id NOT IN (SELECT id FROM users);
DELETE FROM traffic_logs     WHERE user_id NOT IN (SELECT id FROM users);
DELETE FROM connection_state WHERE user_id NOT IN (SELECT id FROM users);

CREATE INDEX IF NOT EXISTS idx_sessions_admin ON sessions(admin_id);
CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users(last_seen_at);
