PRAGMA foreign_keys = ON;
CREATE TABLE members (
 id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
 display_name TEXT NOT NULL DEFAULT '', bio TEXT NOT NULL DEFAULT '',
 role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('member','moderator')),
 disabled INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL,
 stripe_customer TEXT UNIQUE
);
CREATE TABLE login_links (token_hash TEXT PRIMARY KEY, email TEXT NOT NULL, expires_at INTEGER NOT NULL, used_at INTEGER, created_at INTEGER NOT NULL);
CREATE INDEX login_expiry ON login_links(expires_at);
CREATE TABLE member_sessions (token_hash TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES members(id), expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX session_member ON member_sessions(member_id);
CREATE TABLE community_limits (key TEXT PRIMARY KEY, hits INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE supporter_subscriptions (
 id TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES members(id), customer TEXT NOT NULL,
 status TEXT NOT NULL, price_id TEXT NOT NULL, period_end INTEGER NOT NULL DEFAULT 0,
 cancel_at_period_end INTEGER NOT NULL DEFAULT 0, checked_at INTEGER NOT NULL, event_created INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX supporter_member ON supporter_subscriptions(member_id,status);
CREATE TABLE supporter_checkouts (member_id TEXT PRIMARY KEY REFERENCES members(id), nonce TEXT NOT NULL, session_id TEXT, url TEXT, expires_at INTEGER NOT NULL);
CREATE TABLE mcp_keys (id TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES members(id), token_hash TEXT NOT NULL UNIQUE, name TEXT NOT NULL, prefix TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, last_used_at INTEGER, revoked_at INTEGER);
CREATE INDEX mcp_member ON mcp_keys(member_id);
CREATE TABLE community_threads (id TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES members(id), title TEXT NOT NULL, body TEXT NOT NULL, source_path TEXT, created_at INTEGER NOT NULL, hidden INTEGER NOT NULL DEFAULT 0);
CREATE TABLE community_replies (id TEXT PRIMARY KEY, thread_id TEXT NOT NULL REFERENCES community_threads(id), member_id TEXT NOT NULL REFERENCES members(id), body TEXT NOT NULL, created_at INTEGER NOT NULL, hidden INTEGER NOT NULL DEFAULT 0);
CREATE INDEX replies_thread ON community_replies(thread_id,created_at);
CREATE TABLE community_reports (member_id TEXT NOT NULL REFERENCES members(id), target_id TEXT NOT NULL, reason TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(member_id,target_id));
CREATE TABLE reading_lists (id TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES members(id), title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', public INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
CREATE TABLE reading_list_items (id TEXT PRIMARY KEY, list_id TEXT NOT NULL REFERENCES reading_lists(id) ON DELETE CASCADE, title TEXT NOT NULL, path TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, UNIQUE(list_id,path));
