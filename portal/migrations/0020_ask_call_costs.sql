-- Ask model calls made outside the research turns, one row per call, by label.
-- 'opening_line' is the framing line shown while research reads (ASK_OPENING_LINE).
-- A run's own cost stays in agentic_shadow.cost_usd and does not include these rows.
-- Privacy allowlist: no question, line or answer text.
CREATE TABLE IF NOT EXISTS ask_call_costs (
  question_hash TEXT NOT NULL CHECK(length(question_hash) = 64 AND question_hash NOT GLOB '*[^0-9a-f]*'),
  label TEXT NOT NULL CHECK(label IN ('opening_line')),
  latency_ms INTEGER NOT NULL CHECK(latency_ms >= 0),
  cost_usd REAL CHECK(cost_usd IS NULL OR cost_usd >= 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS ask_call_costs_label ON ask_call_costs(label, created_at);
