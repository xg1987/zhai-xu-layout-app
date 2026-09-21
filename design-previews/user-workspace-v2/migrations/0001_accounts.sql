CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, login TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
 password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')),
 status TEXT NOT NULL DEFAULT 'enabled' CHECK(status IN ('enabled','disabled')),
 approval TEXT NOT NULL DEFAULT 'pending' CHECK(approval IN ('pending','approved','rejected')),
 invitation_id TEXT, created_at INTEGER NOT NULL, last_login_at INTEGER
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS invitations (
 id TEXT PRIMARY KEY, code_hash TEXT NOT NULL UNIQUE, hint TEXT NOT NULL, name TEXT NOT NULL,
 created_by TEXT NOT NULL REFERENCES users(id), created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL, max_uses INTEGER NOT NULL CHECK(max_uses>0),
 use_count INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1))
);
CREATE TABLE IF NOT EXISTS audit_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT, actor_id TEXT NOT NULL, action TEXT NOT NULL,
 target TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
