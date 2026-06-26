-- frgmt CMS — auth tables.
-- Strictly additive. IF NOT EXISTS everywhere; never touches the existing `posts` table.

CREATE TABLE IF NOT EXISTS admin_users (
  id            TEXT PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,            -- "pbkdf2$<iters>$<saltB64>$<hashB64>"
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Sessions. The cookie holds a random token; we store only its SHA-256 hash,
-- so a DB read alone cannot reconstruct a usable session cookie.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,            -- SHA-256(token), hex
  user_id    TEXT NOT NULL,
  csrf       TEXT NOT NULL,               -- per-session CSRF secret
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES admin_users(id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_user    ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at);

-- Login throttling. One row per attempt, keyed by client IP.
CREATE TABLE IF NOT EXISTS login_attempts (
  ip TEXT NOT NULL,
  at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts (ip, at);
