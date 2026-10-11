-- Historic holds stay unclaimable throughout Anthropic's asynchronous queue.
ALTER TABLE queue ADD COLUMN batch_run TEXT;
CREATE TABLE batch_items (
  rid TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  tasks TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('reserved', 'applying', 'done', 'released')),
  payload_hash TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
) WITHOUT ROWID;
CREATE INDEX batch_items_run ON batch_items(run_id, state);
