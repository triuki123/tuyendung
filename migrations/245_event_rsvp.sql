-- Migration 245: RSVP nội bộ qua Telegram (sinh nhật, mời họp, sự kiện...).
CREATE TABLE IF NOT EXISTS event_rsvp (
  id            TEXT PRIMARY KEY,
  event_key     TEXT NOT NULL,                         -- VD 'birthday:2026-07' — nhóm các RSVP cùng đợt
  event_title   TEXT NOT NULL,                         -- Tiêu đề đợt (hiển thị trên trang tổng hợp)
  template_id   TEXT,                                  -- Optional: id template gốc
  person_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  person_name   TEXT NOT NULL,
  person_email  TEXT,
  chat_id       TEXT,                                  -- Telegram chat id (khi gửi qua TG)
  message_id    BIGINT,                                -- Telegram message id (để edit sau)
  response      TEXT NOT NULL DEFAULT 'pending' CHECK (response IN ('pending', 'yes', 'no')),
  responded_at  TIMESTAMPTZ,
  note          TEXT,
  sent_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_event_rsvp_key ON event_rsvp(event_key);
CREATE INDEX IF NOT EXISTS idx_event_rsvp_person ON event_rsvp(person_id);
CREATE INDEX IF NOT EXISTS idx_event_rsvp_response ON event_rsvp(event_key, response);
