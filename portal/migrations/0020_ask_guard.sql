-- Every paid model call (Ask, research loop, follow-ups, summaries, stories, overviews) against one
-- daily total, ASK_DAILY_USD. Integer micro-US$, charged before the call and settled after (src/ask-guard.ts).
CREATE TABLE IF NOT EXISTS ask_daily_spend (
  utc_day TEXT PRIMARY KEY CHECK(length(utc_day) = 10),
  charged_microusd INTEGER NOT NULL DEFAULT 0 CHECK(charged_microusd >= 0)
);
-- Each address's questions and other paid requests per UTC day. The key is an HMAC of the day and the
-- address under a Worker secret; the address itself is never stored.
CREATE TABLE IF NOT EXISTS ask_address_daily (
  utc_day TEXT NOT NULL CHECK(length(utc_day) = 10),
  address_hash TEXT NOT NULL CHECK(length(address_hash) = 64),
  questions INTEGER NOT NULL DEFAULT 0 CHECK(questions >= 0),
  extras INTEGER NOT NULL DEFAULT 0 CHECK(extras >= 0),
  PRIMARY KEY (utc_day, address_hash)
);
-- Questions asked on each signed pass issued after a Turnstile check.
CREATE TABLE IF NOT EXISTS ask_pass_uses (
  pass_id TEXT PRIMARY KEY CHECK(length(pass_id) = 32),
  utc_day TEXT NOT NULL CHECK(length(utc_day) = 10),
  uses INTEGER NOT NULL DEFAULT 0 CHECK(uses >= 0)
);
