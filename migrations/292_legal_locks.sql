-- Migration 292: khóa BMHS cho bản ghi Pháp Chế (văn bản / hợp đồng nhạy cảm)
--
-- Khác BMHS gốc (khóa theo NHÂN VIÊN, cột trên users): pháp chế khóa theo TỪNG BẢN GHI
-- nên cần bảng riêng. Tái dùng nguyên tầng vé HMAC 60s của src/lib/bmhs/token.ts
-- (subject = 'legal:<entity_type>:<entity_id>') và luồng reset OTP qua otp_challenges.
--
-- Khóa chặn: xem/tải file + sửa/xóa bản ghi (tiêu đề vẫn hiện trong danh sách — chủ ý,
-- để không ai quên gia hạn). Đặt/gỡ khóa: canManageBmhs (super_admin + quyền BMHS).

CREATE TABLE IF NOT EXISTS legal_locks (
  id             TEXT PRIMARY KEY,
  entity_type    TEXT NOT NULL CHECK (entity_type IN ('document', 'contract')),
  entity_id      TEXT NOT NULL,
  enabled        BOOLEAN NOT NULL DEFAULT TRUE,
  password_hash  TEXT NOT NULL,          -- bcrypt cost 10 (đồng bộ bmhsService)
  set_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  set_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (entity_type, entity_id)
);
