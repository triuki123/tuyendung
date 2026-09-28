-- Migration 250: Xác thực hai yếu tố (2FA) qua OTP khi đăng nhập.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS twofa_enabled BOOLEAN NOT NULL DEFAULT false;
