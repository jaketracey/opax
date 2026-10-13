-- Also records route-mode runs. Privacy allowlist: no question or answer text.
CREATE TABLE IF NOT EXISTS agentic_shadow (
  question_hash TEXT NOT NULL CHECK(length(question_hash) = 64 AND question_hash NOT GLOB '*[^0-9a-f]*'),
  shape TEXT CHECK(shape IN ('ranking', 'trend', 'comparison', 'money')),
  latency_ms INTEGER NOT NULL CHECK(latency_ms >= 0),
  cost_usd REAL CHECK(cost_usd IS NULL OR cost_usd >= 0)
);
CREATE INDEX IF NOT EXISTS agentic_shadow_question ON agentic_shadow(question_hash);
