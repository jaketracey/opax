-- Only new replies enter the outbox; this does not email historical activity.
ALTER TABLE members ADD COLUMN reply_email_notifications INTEGER NOT NULL DEFAULT 1
 CHECK(reply_email_notifications IN (0,1));

CREATE TABLE community_email_outbox (
 reply_id TEXT PRIMARY KEY REFERENCES community_replies(id),
 member_id TEXT NOT NULL REFERENCES members(id),
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sending','sent','skipped','failed','uncertain')),
 attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt_at INTEGER NOT NULL, created_at INTEGER NOT NULL,
 lease_until INTEGER, claim_token TEXT, provider_id TEXT, last_error_code TEXT
);
CREATE INDEX community_email_due ON community_email_outbox(state,next_attempt_at);
CREATE TABLE community_email_unsubscribes (
 token_hash TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES members(id), created_at INTEGER NOT NULL
);
CREATE INDEX community_email_unsubscribe_member ON community_email_unsubscribes(member_id);
