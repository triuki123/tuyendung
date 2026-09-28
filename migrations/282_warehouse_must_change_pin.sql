-- Migration 282: buộc công nhân đổi PIN ở lần đăng nhập đầu (PIN quản lý cấp là PIN tạm)
ALTER TABLE warehouse_workers
  ADD COLUMN IF NOT EXISTS must_change_pin BOOLEAN NOT NULL DEFAULT TRUE;
