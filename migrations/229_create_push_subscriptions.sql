-- Migration 229: đăng ký Web Push (thông báo đẩy về desktop/điện thoại).
-- Mỗi trình duyệt/thiết bị mà user cho phép nhận push = 1 hàng (endpoint duy nhất).
-- Bảng rỗng ⇒ engine không gửi push nào ⇒ không đổi hành vi khi deploy.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          TEXT PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
  ON push_subscriptions (user_id);
