-- Account-specific voice access is managed by the site operator, never by a
-- profile field or client request. Provider and site-wide budgets still apply.
CREATE TABLE voice_access (
 member_id TEXT PRIMARY KEY REFERENCES members(id),
 unlimited INTEGER NOT NULL DEFAULT 0 CHECK(unlimited IN (0,1)),
 updated_at INTEGER NOT NULL
);
