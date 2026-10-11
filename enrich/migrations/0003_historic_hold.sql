-- Metadata only: no table rewrite, CHECK change, row update or index rebuild.
-- Held rows use the existing status=done and terminal_reason=historic-held.
-- Explicit releases remain eligible even if discovery/reconciliation runs again.
-- The old worker can enqueue, claim and finish normally after this migration.
ALTER TABLE queue ADD COLUMN historic_released INTEGER NOT NULL DEFAULT 0;
