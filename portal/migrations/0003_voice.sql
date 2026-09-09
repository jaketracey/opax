-- Voice balances are reservations, not browser-reported timers. A lost Worker
-- conservatively retains the full reservation; only a confirmed upstream close
-- can return unused time. Keep these rows for the member's lifetime allowance.
CREATE TABLE voice_sessions (
 id TEXT PRIMARY KEY,
 member_id TEXT NOT NULL REFERENCES members(id),
 state TEXT NOT NULL CHECK(state IN ('reserved','connecting','active','closed','cancelled','expired')),
 reserved_seconds INTEGER NOT NULL CHECK(reserved_seconds BETWEEN 1 AND 600),
 charged_seconds INTEGER NOT NULL CHECK(charged_seconds BETWEEN 0 AND reserved_seconds),
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 started_at INTEGER,
 closed_at INTEGER,
 conversation_id TEXT UNIQUE
);
CREATE UNIQUE INDEX voice_one_active_member ON voice_sessions(member_id)
 WHERE state IN ('reserved','connecting','active');
CREATE INDEX voice_member_history ON voice_sessions(member_id,created_at);
CREATE INDEX voice_month_budget ON voice_sessions(created_at,charged_seconds);
CREATE INDEX voice_expiry ON voice_sessions(state,expires_at);
