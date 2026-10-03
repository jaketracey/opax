-- W6: retain every voice charge and open slot when its account is deleted.
PRAGMA defer_foreign_keys = ON;
CREATE TABLE voice_sessions_next (
 id TEXT PRIMARY KEY,
 member_id TEXT REFERENCES members(id) ON DELETE SET NULL,
 state TEXT NOT NULL CHECK(state IN ('reserved','connecting','active','closed','cancelled','expired')),
 reserved_seconds INTEGER NOT NULL CHECK(reserved_seconds BETWEEN 1 AND 600),
 charged_seconds INTEGER NOT NULL CHECK(charged_seconds BETWEEN 0 AND reserved_seconds),
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 started_at INTEGER,
 closed_at INTEGER,
 conversation_id TEXT UNIQUE
);
INSERT INTO voice_sessions_next (id,member_id,state,reserved_seconds,charged_seconds,created_at,expires_at,started_at,closed_at,conversation_id)
 SELECT id,member_id,state,reserved_seconds,charged_seconds,created_at,expires_at,started_at,closed_at,conversation_id FROM voice_sessions;
DROP TABLE voice_sessions;
ALTER TABLE voice_sessions_next RENAME TO voice_sessions;
CREATE UNIQUE INDEX voice_one_active_member ON voice_sessions(member_id)
 WHERE member_id IS NOT NULL AND state IN ('reserved','connecting','active');
CREATE INDEX voice_member_history ON voice_sessions(member_id,created_at);
CREATE INDEX voice_month_budget ON voice_sessions(created_at,charged_seconds);
CREATE INDEX voice_expiry ON voice_sessions(state,expires_at);

-- W5: surviving replies need a discussion stub; surviving messages need a
-- conversation with an absent peer. Neither needs a synthetic member account.
CREATE TABLE community_threads_next (
 id TEXT PRIMARY KEY, member_id TEXT REFERENCES members(id) ON DELETE SET NULL,
 title TEXT NOT NULL, body TEXT NOT NULL, source_path TEXT, created_at INTEGER NOT NULL,
 hidden INTEGER NOT NULL DEFAULT 0
);
INSERT INTO community_threads_next (id,member_id,title,body,source_path,created_at,hidden)
 SELECT id,member_id,title,body,source_path,created_at,hidden FROM community_threads;
DROP TABLE community_threads;
ALTER TABLE community_threads_next RENAME TO community_threads;
CREATE INDEX threads_recent ON community_threads(hidden,created_at DESC,id DESC);
CREATE INDEX threads_member ON community_threads(member_id,hidden,created_at DESC);
CREATE TABLE direct_conversations_next (
 id TEXT PRIMARY KEY,
 member_a TEXT REFERENCES members(id) ON DELETE SET NULL,
 member_b TEXT REFERENCES members(id) ON DELETE SET NULL,
 created_at INTEGER NOT NULL, UNIQUE(member_a,member_b), CHECK(member_a<member_b)
);
INSERT INTO direct_conversations_next (id,member_a,member_b,created_at)
 SELECT id,member_a,member_b,created_at FROM direct_conversations;
DROP TABLE direct_conversations;
ALTER TABLE direct_conversations_next RENAME TO direct_conversations;
CREATE INDEX conversations_a ON direct_conversations(member_a);
CREATE INDEX conversations_b ON direct_conversations(member_b);

-- Separate purpose: a deletion proof cannot be consumed by either sign-in route.
CREATE TABLE community_deletion_challenges (
 challenge_id TEXT PRIMARY KEY,
 member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
 code_mac TEXT NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 used_at INTEGER,
 superseded_at INTEGER,
 redemption_token TEXT
);
CREATE INDEX deletion_member ON community_deletion_challenges(member_id);
PRAGMA defer_foreign_keys = OFF;
PRAGMA foreign_key_check;
