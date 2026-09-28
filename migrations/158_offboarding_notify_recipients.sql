-- Migration 158: danh sách người nhận thông báo khi tạo quy trình offboarding
CREATE TABLE IF NOT EXISTS offboarding_notify_recipients (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id)
);
