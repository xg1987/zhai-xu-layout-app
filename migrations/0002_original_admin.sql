ALTER TABLE users ADD COLUMN review_note TEXT NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS vision_settings(provider TEXT PRIMARY KEY, encrypted_key TEXT NOT NULL, revision TEXT NOT NULL, checked_at TEXT, check_state TEXT NOT NULL DEFAULT 'untested');
CREATE TABLE IF NOT EXISTS vision_usage(id TEXT PRIMARY KEY, request_id TEXT NOT NULL, attempt INTEGER NOT NULL, user_id TEXT NOT NULL, account TEXT NOT NULL,user_name TEXT NOT NULL,provider TEXT NOT NULL,model TEXT NOT NULL,operation TEXT NOT NULL,started_at TEXT NOT NULL,finished_at TEXT,status TEXT NOT NULL DEFAULT 'running',usage_json TEXT,price_json TEXT NOT NULL,fx_json TEXT,native_nano INTEGER,cny_nano INTEGER,cost_state TEXT NOT NULL DEFAULT 'usage_missing');
CREATE INDEX IF NOT EXISTS vision_usage_time ON vision_usage(started_at DESC);
CREATE TABLE IF NOT EXISTS vision_fx(requested_date TEXT PRIMARY KEY,rate_json TEXT NOT NULL,fetched_at TEXT NOT NULL);
