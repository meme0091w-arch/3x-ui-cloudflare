-- Production query indexes for dashboard, proxy validation, subscriptions and traffic.
CREATE INDEX IF NOT EXISTS idx_traffic_logged_at ON traffic_logs(logged_at);
CREATE INDEX IF NOT EXISTS idx_traffic_config_time ON traffic_logs(config_id, logged_at);
CREATE INDEX IF NOT EXISTS idx_connection_last_seen ON connection_state(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_connection_user ON connection_state(user_id);
CREATE INDEX IF NOT EXISTS idx_configs_user_active ON configs(user_id, active);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_token_state ON subscriptions(token, disabled, expire_at);
CREATE INDEX IF NOT EXISTS idx_users_expire_status ON users(status, expire_at);
