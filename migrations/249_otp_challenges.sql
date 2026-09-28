-- Migration 249: OTP challenge dùng chung (magic-link → lộ OTP → dùng OTP).
-- Tái sử dụng cho mọi luồng cần OTP (BMHS reset, ...). Phân biệt bằng cột purpose.
CREATE TABLE IF NOT EXISTS otp_challenges (
  id               TEXT PRIMARY KEY,
  purpose          TEXT NOT NULL,          -- 'bmhs_reset', ...
  subject_id       TEXT,                   -- đối tượng (vd hồ sơ cần reset)
  requested_by     TEXT,                   -- người yêu cầu
  email            TEXT NOT NULL,          -- nơi nhận magic-link
  link_token_hash  TEXT NOT NULL,          -- sha256(link token)
  link_expires_at  TIMESTAMPTZ NOT NULL,   -- hạn của LINK (từ lúc gửi)
  link_used_at     TIMESTAMPTZ,            -- (không bắt buộc dùng — cho phép refresh)
  otp_hash         TEXT,                   -- bcrypt(OTP) — set khi lộ mã
  otp_expires_at   TIMESTAMPTZ,            -- hạn của OTP (từ lúc lộ mã)
  otp_consumed_at  TIMESTAMPTZ,            -- đã dùng để hoàn tất hành động
  attempts         INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_otp_challenges_link ON otp_challenges(link_token_hash);
CREATE INDEX IF NOT EXISTS idx_otp_challenges_subject ON otp_challenges(purpose, subject_id);
