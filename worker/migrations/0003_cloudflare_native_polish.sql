-- Cloudflare-native hostname and branding policy.
INSERT INTO settings(key,value) VALUES('created_by','PIXEL & PING Team')
ON CONFLICT(key) DO UPDATE SET value=excluded.value;
-- The active request hostname is authoritative for generated links.
DELETE FROM settings WHERE key='domain';
