-- Migration 146: Thêm thông tin định danh Telegram cho users (Telegram Login Widget)
-- telegram_id = Telegram User ID (định danh duy nhất, KHÁC telegram_chat_id legacy mặc dù
-- với chat riêng tư 2 giá trị này trùng nhau). Dùng telegram_id làm khóa đăng nhập.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS telegram_id          TEXT,
  ADD COLUMN IF NOT EXISTS telegram_username    TEXT,
  ADD COLUMN IF NOT EXISTS telegram_first_name  TEXT,
  ADD COLUMN IF NOT EXISTS telegram_last_name   TEXT,
  ADD COLUMN IF NOT EXISTS telegram_photo_url   TEXT,
  ADD COLUMN IF NOT EXISTS telegram_linked_at   TIMESTAMPTZ;

-- telegram_id phải DUY NHẤT toàn hệ thống (bỏ qua NULL — user chưa liên kết)
CREATE UNIQUE INDEX IF NOT EXISTS users_telegram_id_unique
  ON users (telegram_id)
  WHERE telegram_id IS NOT NULL;

COMMENT ON COLUMN users.telegram_id         IS 'Telegram User ID — khóa định danh đăng nhập Telegram (duy nhất)';
COMMENT ON COLUMN users.telegram_username   IS 'Telegram @username (có thể đổi — KHÔNG dùng làm khóa)';
COMMENT ON COLUMN users.telegram_first_name IS 'Tên hiển thị Telegram';
COMMENT ON COLUMN users.telegram_last_name  IS 'Họ hiển thị Telegram';
COMMENT ON COLUMN users.telegram_photo_url  IS 'Ảnh đại diện Telegram';
COMMENT ON COLUMN users.telegram_linked_at  IS 'Thời điểm liên kết Telegram';
