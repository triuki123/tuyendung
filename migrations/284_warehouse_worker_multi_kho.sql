-- Migration 284: cho phép 1 CCCD làm nhiều kho — mỗi kho 1 hồ sơ riêng.
-- Đổi UNIQUE(cccd) toàn cục → UNIQUE(warehouse_id, cccd).
ALTER TABLE warehouse_workers DROP CONSTRAINT IF EXISTS warehouse_workers_cccd_key;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'warehouse_workers_wh_cccd_key') THEN
    ALTER TABLE warehouse_workers
      ADD CONSTRAINT warehouse_workers_wh_cccd_key UNIQUE (warehouse_id, cccd);
  END IF;
END $$;
