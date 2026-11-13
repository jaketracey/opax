-- Voice proxy liveness. The Worker relay writes last_seen_at when it claims a
-- session and then about every 15 seconds while its sockets are open. A
-- connecting or active row unseen for 45 seconds has no proxy left (a deploy or
-- an evicted isolate can drop the relay without any close event), so status and
-- start end it instead of holding the member's lock until expires_at.
-- Rows from before this migration keep NULL and only expire at expires_at.
-- Column add only: no table rebuild (see 0012 and migration-deletion-safety).
ALTER TABLE voice_sessions ADD COLUMN last_seen_at INTEGER;
