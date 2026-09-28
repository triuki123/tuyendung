-- Migration 127: Bảng log nhắc task/ticket quá hạn
CREATE TABLE IF NOT EXISTS task_reminder_log (
  id           SERIAL PRIMARY KEY,
  related_id   TEXT  NOT NULL,
  related_type TEXT  NOT NULL,  -- 'task' | 'ticket'
  sent_date    DATE  NOT NULL DEFAULT CURRENT_DATE,
  UNIQUE (related_id, related_type, sent_date)
);

CREATE TABLE IF NOT EXISTS archived_room_bookings (
  id                TEXT,
  room_name         TEXT,
  booking_date      TEXT,
  start_time        TEXT,
  end_time          TEXT,
  purpose           TEXT,
  requested_by      TEXT,
  requested_by_name TEXT,
  status            TEXT,
  approved_by       TEXT,
  approved_at       TEXT,
  confirmed_at      TIMESTAMPTZ,
  confirmed_by      TEXT,
  created_at        TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ,
  archived_at       TIMESTAMPTZ DEFAULT NOW()
);
