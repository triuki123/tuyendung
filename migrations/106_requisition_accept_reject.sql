-- Migration 106: workflow tiếp nhận/từ chối Yêu Cầu Tuyển Dụng
-- Thêm trạng thái 'pending' (chờ tiếp nhận) & 'rejected' (từ chối) + cột tiếp nhận/từ chối.

ALTER TABLE requisitions
  ADD COLUMN IF NOT EXISTS reject_reason TEXT,
  ADD COLUMN IF NOT EXISTS accepted_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS accepted_by   TEXT,
  ADD COLUMN IF NOT EXISTS rejected_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_by   TEXT;

-- Mở rộng CHECK status (idempotent: drop rồi add lại).
-- Bao gồm 'pending_approval' (xem migration 120) để không fail trên DB đã có sẵn
-- dữ liệu trạng thái này → tránh chặn cả chuỗi migration khi deploy.
ALTER TABLE requisitions DROP CONSTRAINT IF EXISTS requisitions_status_check;
ALTER TABLE requisitions ADD CONSTRAINT requisitions_status_check
  CHECK (status IN ('pending_approval','pending','open','on_hold','filled','cancelled','rejected'));

SELECT 'Migration 106: requisition accept/reject workflow' AS migration_status;
