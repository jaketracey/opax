-- Saved conversations: the chat's "Keep asking" threads, one row per
-- conversation, the thread stored whole as JSON. It is read and written as
-- a unit by its one owner and never queried inside, so a document column is
-- the right shape. updated_at is the reader's own clock (seconds): the
-- browser and the account reconcile on it, last write wins.
CREATE TABLE member_chats (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES members(id),
  title TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'all',
  turns INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX member_chats_member ON member_chats(member_id, updated_at DESC);
