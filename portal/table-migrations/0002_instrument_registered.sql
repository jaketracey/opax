ALTER TABLE table_instruments ADD COLUMN registered TEXT;
CREATE INDEX IF NOT EXISTS table_instruments_registered ON table_instruments (registered, rowid);
