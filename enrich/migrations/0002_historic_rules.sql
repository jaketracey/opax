-- Metadata-only additions: existing queue rows, CHECK, indexes and claims stay intact.
-- Old workers can continue using the original schema while this migration goes first.
-- Terminal historic outcomes use status=done; the reason keeps them out of retries.
ALTER TABLE queue ADD COLUMN terminal_reason TEXT;
ALTER TABLE queue ADD COLUMN names_rejected INTEGER NOT NULL DEFAULT 0;
ALTER TABLE queue ADD COLUMN historic INTEGER NOT NULL DEFAULT 0;
