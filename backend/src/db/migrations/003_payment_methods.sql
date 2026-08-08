-- Payment methods: KHQR (automated gateway) and USDT/crypto (manual, via Support).
--
-- 1. Record WHICH method each payment used. Until now KHQR payments were only
--    identifiable by a "khqr:" prefix hiding inside transaction_hash, so the
--    dashboard could not tell an ABA/Wing bank transfer from a USDT transfer.
-- 2. Let admins enable/disable crypto (USDT) payments independently of KHQR,
--    mirroring the existing khqr_enabled switch.

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS method TEXT NOT NULL DEFAULT 'usdt';

-- Added separately so re-running against a DB that already has the column is safe.
-- conname alone is not unique across tables, so scope it to `payments`.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payments_method_check'
      AND conrelid = 'payments'::regclass
  ) THEN
    ALTER TABLE payments
      ADD CONSTRAINT payments_method_check
      CHECK (method IN ('khqr', 'usdt', 'manual'));
  END IF;
END
$$;

-- Backfill: historical KHQR payments were tagged via the transaction_hash prefix.
UPDATE payments SET method = 'khqr' WHERE transaction_hash LIKE 'khqr:%';

CREATE INDEX IF NOT EXISTS idx_payments_method ON payments(method);

ALTER TABLE bot_settings
  ADD COLUMN IF NOT EXISTS usdt_enabled BOOLEAN NOT NULL DEFAULT TRUE;
