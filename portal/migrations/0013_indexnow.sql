-- Independent crawl notification journal; no community/member data is involved.
CREATE TABLE IF NOT EXISTS indexnow_snapshots (
  epoch TEXT PRIMARY KEY,
  entries TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS indexnow_jobs (
  epoch TEXT PRIMARY KEY,
  urls TEXT NOT NULL,
  cursor INTEGER NOT NULL DEFAULT 0,
  complete INTEGER NOT NULL DEFAULT 0,
  owner TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0,
  finished_at INTEGER NOT NULL DEFAULT 0
);
