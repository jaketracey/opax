-- Account-wide direct research-loop admission, including shadow and evals.
-- Integer micro-US$; reservations remain charged if a caller disappears.
CREATE TABLE IF NOT EXISTS research_daily_spend (
  utc_day TEXT PRIMARY KEY CHECK(length(utc_day) = 10),
  charged_microusd INTEGER NOT NULL DEFAULT 0 CHECK(charged_microusd >= 0)
);
