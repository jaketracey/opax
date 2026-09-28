-- opax-enrich: the work queue, the ledger of what was read, and the daily neuron spend.

-- One row per (resource, task). D1 is the ledger of what was READ: the knowledge box
-- records nothing for a "no topic" verdict, so an empty topics result lives only here.
CREATE TABLE queue (
  rid         TEXT    NOT NULL,
  task        TEXT    NOT NULL CHECK (task IN ('speech_summary', 'speech_topics', 'release_summary')),
  status      TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'claimed', 'done', 'quarantined')),
  priority    INTEGER NOT NULL DEFAULT 0,      -- 100 = newly discovered, 0 = backfill
  source_created INTEGER,                      -- the resource's `created` in the knowledge box (unix ms); NULL for seeded backfill
  attempts    INTEGER NOT NULL DEFAULT 0,      -- model outputs rejected by the validator
  transient   INTEGER NOT NULL DEFAULT 0,      -- infrastructure failures (model API / knowledge box), not the row's fault
  force       INTEGER NOT NULL DEFAULT 0,      -- 1 = overwrite an existing brief / topic labels
  model       TEXT,                            -- model that produced the accepted result (or was last tried)
  result      TEXT,                            -- summary text, or a JSON array of topic slugs ([] = read, no topic)
  outcome     TEXT,                            -- written | dry | unwritten | empty | skipped-existing | no-text | missing
  last_error  TEXT,
  neurons     REAL    NOT NULL DEFAULT 0,
  claim_token TEXT,
  claimed_at  INTEGER,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  done_at     INTEGER,
  PRIMARY KEY (rid, task)
) WITHOUT ROWID;

CREATE INDEX queue_pick    ON queue (status, priority DESC, source_created DESC, created_at);
CREATE INDEX queue_outcome ON queue (status, outcome);
CREATE INDEX queue_claim   ON queue (claim_token);

-- Discovery cursors (cursor:speech, cursor:press_release), backoff deadlines, last tick.
CREATE TABLE state (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Neurons per UTC day per model.
CREATE TABLE spend (
  day        TEXT    NOT NULL,
  model      TEXT    NOT NULL,
  neurons    REAL    NOT NULL DEFAULT 0,
  calls      INTEGER NOT NULL DEFAULT 0,
  in_tokens  INTEGER NOT NULL DEFAULT 0,
  out_tokens INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, model)
) WITHOUT ROWID;

-- Every model output the validator rejected, with why (pruned to the most recent 1000).
CREATE TABLE rejections (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  ts      INTEGER NOT NULL,
  rid     TEXT    NOT NULL,
  task    TEXT    NOT NULL,      -- summary | topics
  model   TEXT    NOT NULL,
  attempt INTEGER NOT NULL,      -- 1..3
  reasons TEXT    NOT NULL,
  sample  TEXT                   -- start of what the model returned
);

-- Recent errors for /status (pruned each tick).
CREATE TABLE errors (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  ts      INTEGER NOT NULL,
  rid     TEXT,
  task    TEXT,
  kind    TEXT NOT NULL,
  message TEXT NOT NULL
);
