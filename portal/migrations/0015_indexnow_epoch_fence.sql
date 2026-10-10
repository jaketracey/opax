-- Idempotent: replay never resets an established fence or pending priorities.
CREATE TABLE IF NOT EXISTS indexnow_epoch_fence (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  epoch TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0
);
-- Version 0 represents pre-fence deployments, whose missing configured version
-- is rejected. The reviewed deployment supplies a strictly positive version.
INSERT OR IGNORE INTO indexnow_epoch_fence (id, epoch, version)
SELECT 1, epoch, 0 FROM indexnow_jobs WHERE superseded = 0 ORDER BY rowid DESC LIMIT 1;
INSERT OR IGNORE INTO indexnow_epoch_fence (id, epoch, version) VALUES (1, '', 0);

CREATE TABLE IF NOT EXISTS indexnow_priority (
  epoch TEXT PRIMARY KEY,
  ranks TEXT NOT NULL DEFAULT '[]'
);
