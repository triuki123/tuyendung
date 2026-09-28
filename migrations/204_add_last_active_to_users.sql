-- Migration 204: thêm cột last_active để theo dõi lần sử dụng cuối (khác last_login)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_active TIMESTAMPTZ;
