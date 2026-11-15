-- The newsletter list (docs/NEWSLETTER.md). One row per address, holding only
-- what a reader typed into the sign-up card and the dates of their choices.
-- No member id, no analytics id, no IP address, no page the reader was on.
CREATE TABLE newsletter_subscribers (
 id TEXT PRIMARY KEY,
 email TEXT NOT NULL UNIQUE,
 -- Comma-separated edition keys: 'bills', 'mp'.
 editions TEXT NOT NULL,
 -- Optional, as typed: a four-digit postcode or an electorate name in slug form.
 electorate TEXT,
 -- SHA-256 of the confirmation link's token; cleared on unsubscribe.
 confirm_token_hash TEXT UNIQUE,
 confirm_expires_at INTEGER,
 -- Kept as issued: every edition's unsubscribe link is rebuilt from it, and
 -- the only thing it can do is unsubscribe this address.
 unsubscribe_token TEXT NOT NULL UNIQUE,
 created_at INTEGER NOT NULL,
 confirmed_at INTEGER,
 unsubscribed_at INTEGER
);
CREATE INDEX newsletter_subscribers_unsubscribed ON newsletter_subscribers(unsubscribed_at);
CREATE INDEX newsletter_subscribers_pending ON newsletter_subscribers(confirmed_at,created_at);

-- Daily totals, never joined to a subscriber: how many sign-ups were submitted
-- and confirmed, by the kind of page the card was on.
CREATE TABLE newsletter_counts (
 day TEXT NOT NULL,
 event TEXT NOT NULL CHECK(event IN ('submitted','confirmed','unsubscribed')),
 page_type TEXT NOT NULL,
 n INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(day,event,page_type)
);
