-- Additive community features. Existing profiles and discussions are preserved.
ALTER TABLE members ADD COLUMN message_policy TEXT NOT NULL DEFAULT 'everyone'
 CHECK(message_policy IN ('everyone','following','nobody'));

CREATE TABLE member_follows (
 follower_id TEXT NOT NULL REFERENCES members(id),
 followed_id TEXT NOT NULL REFERENCES members(id), created_at INTEGER NOT NULL,
 PRIMARY KEY(follower_id,followed_id), CHECK(follower_id<>followed_id)
);
CREATE INDEX follows_member ON member_follows(followed_id,follower_id);
CREATE TABLE member_blocks (
 member_id TEXT NOT NULL REFERENCES members(id), blocked_id TEXT NOT NULL REFERENCES members(id),
 created_at INTEGER NOT NULL, PRIMARY KEY(member_id,blocked_id), CHECK(member_id<>blocked_id)
);
CREATE INDEX blocks_recipient ON member_blocks(blocked_id,member_id);
CREATE TABLE thread_likes (
 thread_id TEXT NOT NULL REFERENCES community_threads(id), member_id TEXT NOT NULL REFERENCES members(id),
 created_at INTEGER NOT NULL, PRIMARY KEY(thread_id,member_id)
);
CREATE TABLE thread_bookmarks (
 member_id TEXT NOT NULL REFERENCES members(id), thread_id TEXT NOT NULL REFERENCES community_threads(id),
 created_at INTEGER NOT NULL, PRIMARY KEY(member_id,thread_id)
);
CREATE INDEX threads_recent ON community_threads(hidden,created_at DESC,id DESC);
CREATE INDEX threads_member ON community_threads(member_id,hidden,created_at DESC);

CREATE TABLE direct_conversations (
 id TEXT PRIMARY KEY, member_a TEXT NOT NULL REFERENCES members(id), member_b TEXT NOT NULL REFERENCES members(id),
 created_at INTEGER NOT NULL, UNIQUE(member_a,member_b), CHECK(member_a<member_b)
);
CREATE INDEX conversations_a ON direct_conversations(member_a);
CREATE INDEX conversations_b ON direct_conversations(member_b);
CREATE TABLE direct_messages (
 seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
 conversation_id TEXT NOT NULL REFERENCES direct_conversations(id),
 sender_id TEXT NOT NULL REFERENCES members(id), body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 3000),
 created_at INTEGER NOT NULL, hidden INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX messages_conversation ON direct_messages(conversation_id,seq DESC);
CREATE TABLE direct_reads (
 conversation_id TEXT NOT NULL REFERENCES direct_conversations(id), member_id TEXT NOT NULL REFERENCES members(id),
 through_seq INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(conversation_id,member_id)
);
CREATE TABLE community_notifications (
 id INTEGER PRIMARY KEY AUTOINCREMENT, member_id TEXT NOT NULL REFERENCES members(id),
 actor_id TEXT NOT NULL REFERENCES members(id), kind TEXT NOT NULL CHECK(kind IN ('follow','like','reply')),
 target_id TEXT NOT NULL, thread_id TEXT REFERENCES community_threads(id),
 created_at INTEGER NOT NULL, read_at INTEGER,
 UNIQUE(member_id,actor_id,kind,target_id), CHECK(member_id<>actor_id)
);
CREATE INDEX notifications_member ON community_notifications(member_id,id DESC);
CREATE INDEX notifications_unread ON community_notifications(member_id,read_at);
