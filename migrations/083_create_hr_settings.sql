-- Migration 083: hr_settings — key/value cấu hình module Nhân Sự
-- Dùng cho: 'reminder_department_ids' = JSON mảng department_id nhận nhắc gia hạn.
CREATE TABLE IF NOT EXISTS public.hr_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL DEFAULT '[]'::JSONB,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
