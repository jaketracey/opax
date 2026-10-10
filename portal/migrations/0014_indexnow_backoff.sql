-- Crawl notification state only; no community/member data.
-- RUNNER ONLY: apply once with `wrangler d1 migrations apply`. Its d1_migrations
-- journal skips already-applied files. Do not execute or replay this SQL directly:
-- SQLite/D1 has no conditional ADD COLUMN, and these ALTERs are not idempotent.
ALTER TABLE indexnow_jobs ADD COLUMN next_attempt_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE indexnow_jobs ADD COLUMN failure_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE indexnow_jobs ADD COLUMN superseded INTEGER NOT NULL DEFAULT 0;
ALTER TABLE indexnow_jobs ADD COLUMN plan_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE indexnow_jobs ADD COLUMN extras TEXT NOT NULL DEFAULT '[]';
ALTER TABLE indexnow_jobs ADD COLUMN carried_entries TEXT NOT NULL DEFAULT '[]';
ALTER TABLE indexnow_jobs ADD COLUMN total INTEGER NOT NULL DEFAULT 0;
UPDATE indexnow_jobs SET total = MAX(cursor, json_array_length(urls));

-- A shared lease serialises planning, supersession and quota reservations across epochs.
CREATE TABLE indexnow_control (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  owner TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0,
  initialized INTEGER NOT NULL DEFAULT 0
);
INSERT INTO indexnow_control (id) VALUES (1);

-- Only accepted fingerprints advance this baseline. Extra receipts identify a
-- one-off secret by its digest, preventing repeats while it remains configured.
CREATE TABLE indexnow_sent (
  path TEXT PRIMARY KEY,
  fingerprint TEXT,
  extra_token TEXT
);
CREATE TABLE indexnow_daily (
  day TEXT PRIMARY KEY,
  urls_sent INTEGER NOT NULL DEFAULT 0,
  urls_accepted INTEGER NOT NULL DEFAULT 0
);
