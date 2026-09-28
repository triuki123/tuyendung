-- Migration 277: gửi NHIỀU ảnh (album) cho tin Telegram nội bộ.
-- Giữ nguyên image_url (ảnh đầu tiên) để dữ liệu/lịch sử cũ và code cũ vẫn chạy.
ALTER TABLE internal_tg_broadcasts
  ADD COLUMN IF NOT EXISTS image_urls JSONB;
