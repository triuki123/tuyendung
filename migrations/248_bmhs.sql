-- Migration 248: Bảo Mật Hồ Sơ (BMHS)
-- Khóa hồ sơ nhân sự: cần mật khẩu để xem/tải, do super_admin có quyền BMHS đặt.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS bmhs_enabled       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bmhs_password_hash TEXT,
  ADD COLUMN IF NOT EXISTS bmhs_set_by        TEXT,
  ADD COLUMN IF NOT EXISTS bmhs_set_at        TIMESTAMPTZ;

-- OTP reset mật khẩu BMHS (gửi về email super_admin qua SMTP). 1 dòng / lần yêu cầu.
CREATE TABLE IF NOT EXISTS bmhs_reset_otp (
  id             TEXT PRIMARY KEY,
  target_user_id TEXT NOT NULL,           -- hồ sơ đang được reset
  requested_by   TEXT NOT NULL,           -- super_admin yêu cầu
  otp_hash       TEXT NOT NULL,           -- bcrypt hash của OTP
  expires_at     TIMESTAMPTZ NOT NULL,
  used_at        TIMESTAMPTZ,
  attempts       INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bmhs_reset_otp_target ON bmhs_reset_otp(target_user_id);
