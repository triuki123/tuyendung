-- Migration 133: Thêm cột "userId" và "performedBy" vào audit_logs
-- Service activityHistoryService.ts query al."userId" và al."performedBy"
-- Schema cũ dùng admin_id (performedBy) và target_user_id (userId)

ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS "userId"      TEXT,
  ADD COLUMN IF NOT EXISTS "performedBy" TEXT;

-- Đồng bộ dữ liệu từ cột cũ sang cột mới
UPDATE audit_logs
SET
  "userId"      = COALESCE("userId",      admin_id),
  "performedBy" = COALESCE("performedBy", admin_id)
WHERE "userId" IS NULL OR "performedBy" IS NULL;

CREATE INDEX IF NOT EXISTS idx_audit_logs_userId      ON audit_logs ("userId");
CREATE INDEX IF NOT EXISTS idx_audit_logs_performedBy ON audit_logs ("performedBy");
