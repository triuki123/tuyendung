-- Migration 126: Bảng log nhắc phòng họp sắp diễn ra
CREATE TABLE IF NOT EXISTS room_booking_reminder_log (
  id         SERIAL PRIMARY KEY,
  booking_id TEXT      NOT NULL,
  sent_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (booking_id)
);
