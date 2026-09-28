-- Migration 163: biến thể nội dung Telegram cho mẫu thông báo.
-- NULL = dùng fallback (*tiêu đề* + nội dung in-app) → hành vi không đổi.
ALTER TABLE notification_templates
  ADD COLUMN IF NOT EXISTS telegram TEXT;
