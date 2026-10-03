-- Additive: existing web proofs and sessions retain their defaults and remain valid.
ALTER TABLE login_links ADD COLUMN client TEXT NOT NULL DEFAULT 'web' CHECK(client IN ('web','ios'));
ALTER TABLE login_links ADD COLUMN challenge_id TEXT;
ALTER TABLE login_links ADD COLUMN code_mac TEXT;
ALTER TABLE login_links ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE login_links ADD COLUMN superseded_at INTEGER;
CREATE UNIQUE INDEX login_challenge ON login_links(challenge_id) WHERE challenge_id IS NOT NULL;
CREATE INDEX login_email_client ON login_links(email,client) WHERE used_at IS NULL AND superseded_at IS NULL;
ALTER TABLE member_sessions ADD COLUMN client TEXT NOT NULL DEFAULT 'web' CHECK(client IN ('web','ios'));
