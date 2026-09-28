-- Migration 165: gộp (digest) cho hộp thư đi Telegram.
-- Tin cùng digest_group + cùng người nhận, drain trong một lượt → gộp 1 tin tóm tắt.
ALTER TABLE notification_outbox
  ADD COLUMN IF NOT EXISTS digest_group TEXT,
  ADD COLUMN IF NOT EXISTS digest_title TEXT,
  ADD COLUMN IF NOT EXISTS digest_line  TEXT,
  ADD COLUMN IF NOT EXISTS landing_url  TEXT;
