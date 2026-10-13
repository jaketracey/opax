-- Upgrade the existing procurement projection with the fixed supplier scope.
-- The source loader fills the new column when the projection is rebuilt.
ALTER TABLE table_contracts ADD COLUMN supplier_id TEXT;
CREATE INDEX table_contracts_supplier_id ON table_contracts (supplier_id COLLATE NOCASE, rowid);
