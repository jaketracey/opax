-- Optional grants projection metadata; existing dataset fields remain unchanged.
ALTER TABLE table_grants ADD COLUMN "electorate" TEXT;
ALTER TABLE table_grants ADD COLUMN "recipientId" TEXT;
ALTER TABLE table_grants ADD COLUMN "recipientKind" TEXT;
ALTER TABLE table_grants ADD COLUMN "recipientABNType" TEXT;
ALTER TABLE table_grants ADD COLUMN "recipientAvailable" INTEGER;
ALTER TABLE table_grants ADD COLUMN "recipientCount" INTEGER;
CREATE INDEX IF NOT EXISTS table_grants_electorate ON table_grants ("electorate" COLLATE NOCASE, rowid);
CREATE INDEX IF NOT EXISTS table_grants_recipientId ON table_grants ("recipientId" COLLATE NOCASE, rowid);
CREATE INDEX IF NOT EXISTS table_grants_recipientKind ON table_grants ("recipientKind" COLLATE NOCASE, rowid);
CREATE INDEX IF NOT EXISTS table_grants_recipientABNType ON table_grants ("recipientABNType" COLLATE NOCASE, rowid);
CREATE INDEX IF NOT EXISTS table_grants_recipientAvailable ON table_grants ("recipientAvailable", rowid);
CREATE INDEX IF NOT EXISTS table_grants_recipientCount ON table_grants ("recipientCount", rowid);
