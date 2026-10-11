-- Upgrade the tables already created by 0001. The source loader replaces the
-- procurement projection after migration; null kinds fail closed until then.
ALTER TABLE table_contracts ADD COLUMN supplier_id TEXT;
ALTER TABLE table_contracts ADD COLUMN recipient_kind TEXT;
ALTER TABLE table_suppliers ADD COLUMN recipient_kind TEXT;
CREATE INDEX table_contracts_supplier_id ON table_contracts (supplier_id COLLATE NOCASE, rowid);
CREATE INDEX table_contracts_recipient_kind ON table_contracts (recipient_kind COLLATE NOCASE, rowid);
CREATE INDEX table_suppliers_recipient_kind ON table_suppliers (recipient_kind COLLATE NOCASE, rowid);
