-- Migration 231: tùy chọn nhận thông báo theo LOẠI SỰ KIỆN × KÊNH (per user).
-- Chỉ lưu các bản ghi TẮT (enabled=false) làm "override"; KHÔNG có bản ghi = mặc định BẬT.
-- ⇒ bảng rỗng = hành vi y như cũ (behavior-preserving khi deploy).
-- Kênh áp dụng: 'telegram' | 'webpush'. In-app LUÔN bật (không lưu ở đây).
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id    UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_key  TEXT    NOT NULL,
  channel    TEXT    NOT NULL,
  enabled    BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, event_key, channel)
);

CREATE INDEX IF NOT EXISTS idx_notif_prefs_user ON notification_preferences (user_id);
