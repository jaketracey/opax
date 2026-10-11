-- Extend the terminal-state CHECK without changing any existing row or queue index.
-- names_rejected remembers that a historic summary has used its initial name failure:
-- the next completed model response is its one corrective escalation, even across ticks.
CREATE TABLE queue_historic (
  rid TEXT NOT NULL,
  task TEXT NOT NULL CHECK (task IN ('speech_summary', 'speech_topics', 'release_summary')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'claimed', 'done', 'quarantined', 'skipped-short', 'rejected-names')),
  priority INTEGER NOT NULL DEFAULT 0,
  source_created INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0,
  transient INTEGER NOT NULL DEFAULT 0,
  force INTEGER NOT NULL DEFAULT 0,
  model TEXT,
  result TEXT,
  outcome TEXT,
  last_error TEXT,
  neurons REAL NOT NULL DEFAULT 0,
  claim_token TEXT,
  claimed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  done_at INTEGER,
  names_rejected INTEGER NOT NULL DEFAULT 0 CHECK (names_rejected IN (0, 1)),
  PRIMARY KEY (rid, task)
) WITHOUT ROWID;

INSERT INTO queue_historic (rid, task, status, priority, source_created, attempts, transient, force,
  model, result, outcome, last_error, neurons, claim_token, claimed_at, created_at, updated_at, done_at)
SELECT rid, task, status, priority, source_created, attempts, transient, force,
  model, result, outcome, last_error, neurons, claim_token, claimed_at, created_at, updated_at, done_at FROM queue;

DROP TABLE queue;
ALTER TABLE queue_historic RENAME TO queue;
CREATE INDEX queue_pick ON queue (status, priority DESC, source_created DESC, created_at);
CREATE INDEX queue_outcome ON queue (status, outcome);
CREATE INDEX queue_claim ON queue (claim_token);
