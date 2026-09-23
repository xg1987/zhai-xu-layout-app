CREATE TABLE plans(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),image TEXT NOT NULL,width INTEGER NOT NULL,height INTEGER NOT NULL,status TEXT NOT NULL,recognition_json TEXT,result_json TEXT,error TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE INDEX plans_owner ON plans(user_id,created_at DESC);
