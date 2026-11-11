-- unwrittenRows() runs every minute from the cron. Without an index matching
-- its filter and order, SQLite walked every 'done' row via queue_pick
-- (about 770,000 rows a run, 1.1 billion rows read a day) to return nothing.
-- This partial index holds only rows that can match, already in pick order.
CREATE INDEX IF NOT EXISTS queue_unwritten
  ON queue (status, outcome, priority DESC, done_at)
  WHERE terminal_reason IS NULL AND result IS NOT NULL;
