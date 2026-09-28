-- Migration 167: bật/tắt mẫu thông báo + mẫu TÙY CHỈNH (gửi thủ công/broadcast).
--
--  - enabled      : tắt = engine bỏ qua, KHÔNG phát (in-app + Telegram). Mặc định true
--                   ⇒ deploy không đổi hành vi.
--  - is_custom    : true = mẫu do admin tự tạo (không có DEFAULT trong code), xoá được.
--  - category/label/placeholders : chỉ dùng cho mẫu custom (mẫu hệ thống lấy từ code).
ALTER TABLE notification_templates
  ADD COLUMN IF NOT EXISTS enabled      BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_custom    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS category     TEXT,
  ADD COLUMN IF NOT EXISTS label        TEXT,
  ADD COLUMN IF NOT EXISTS placeholders TEXT;  -- JSON array (chuỗi), chỉ cho custom
