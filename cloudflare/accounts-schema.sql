-- Additive migration for the deployed 0001_auth.sql schema. Run once through a
-- migration ledger. For databases that already contain some columns, use the
-- PRAGMA-aware ensureSchema() helper instead of replaying these ALTER statements.
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin','user'));
ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'enabled' CHECK(status IN ('enabled','disabled'));
ALTER TABLE users ADD COLUMN updated_at TEXT;
ALTER TABLE users ADD COLUMN last_login_at TEXT;
ALTER TABLE users ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'approved' CHECK(approval_status IN ('pending','approved','rejected'));
ALTER TABLE users ADD COLUMN review_note TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN reviewed_at TEXT;
ALTER TABLE users ADD COLUMN reviewed_by INTEGER;
ALTER TABLE users ADD COLUMN invitation_id INTEGER;
ALTER TABLE users ADD COLUMN mutation_id TEXT;

CREATE TABLE IF NOT EXISTS invitations (
 id INTEGER PRIMARY KEY AUTOINCREMENT, code_hash TEXT UNIQUE NOT NULL,
 hint TEXT NOT NULL, name TEXT NOT NULL, created_by INTEGER NOT NULL,
 created_at TEXT NOT NULL, expires_at TEXT NOT NULL,
 max_uses INTEGER NOT NULL CHECK(max_uses BETWEEN 1 AND 1000),
 use_count INTEGER NOT NULL DEFAULT 0 CHECK(use_count >= 0),
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1))
);
CREATE TABLE IF NOT EXISTS admin_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL,
 actor_id INTEGER, actor_name TEXT NOT NULL, actor_login TEXT NOT NULL,
 action TEXT NOT NULL, target_id INTEGER, target TEXT NOT NULL, result TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS admin_events_time ON admin_events(created_at);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expiration ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS auth_rate_limits (
 key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_rate_expiration ON auth_rate_limits(expires_at);
-- Registration uses INSERT ... SELECT with eligibility predicates. SQLite's
-- statement/transaction isolation and this trigger consume an invitation in the
-- same atomic write as account creation, including under concurrent requests.
CREATE TRIGGER IF NOT EXISTS invitations_consume_signup
AFTER INSERT ON users WHEN NEW.invitation_id IS NOT NULL
BEGIN
 UPDATE invitations SET use_count=use_count+1 WHERE id=NEW.invitation_id;
END;
