-- Migration 161: cấu hình hệ thống dạng key/value (Nhắc nhở + Bảo mật)
-- Seed RỖNG → service trả DEFAULT (hằng số cũ) → hành vi không đổi.
CREATE TABLE IF NOT EXISTS system_settings (
  key         TEXT PRIMARY KEY,
  category    TEXT NOT NULL,
  value       JSONB NOT NULL,
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_system_settings_category ON system_settings(category);
