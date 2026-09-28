-- Migration 164: hộp thư đi cho Telegram (đảm bảo gửi + retry + theo dõi trạng thái).
-- Engine ghi tin vào đây; worker drain định kỳ, gửi hỏng thì thử lại theo back-off.
CREATE TABLE IF NOT EXISTS notification_outbox (
  id              TEXT PRIMARY KEY,
  user_id         TEXT,
  channel         TEXT NOT NULL DEFAULT 'telegram',
  chat_id         TEXT NOT NULL,
  text            TEXT NOT NULL,
  button_label    TEXT,
  button_url      TEXT,
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending | sent | failed
  attempts        INT  NOT NULL DEFAULT 0,
  max_attempts    INT  NOT NULL DEFAULT 5,
  last_error      TEXT,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at         TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_notif_outbox_due
  ON notification_outbox (next_attempt_at) WHERE status = 'pending';
