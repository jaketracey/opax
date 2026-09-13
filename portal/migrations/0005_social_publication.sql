-- Separate from community content: immutable daily copy and publication receipts.
CREATE TABLE IF NOT EXISTS social_editions (
 date TEXT PRIMARY KEY,
 subject TEXT NOT NULL,
 post_json TEXT NOT NULL,
 created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS social_deliveries (
 edition_date TEXT NOT NULL REFERENCES social_editions(date),
 channel TEXT NOT NULL CHECK(channel IN ('x','facebook','instagram')),
 status TEXT NOT NULL CHECK(status IN ('sending','preparing','posted','failed','review_required')),
 post_id TEXT,
 container_id TEXT,
 detail TEXT,
 updated_at TEXT NOT NULL,
 PRIMARY KEY(edition_date,channel)
);
