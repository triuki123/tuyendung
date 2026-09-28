-- Migration 171: log chống trùng cho nhắc check-in/check-out phòng họp
-- (mỗi booking × loại nhắc chỉ gửi 1 lần). Auto-release no-show tự chống trùng
-- bằng việc đổi status nên không cần log.
CREATE TABLE IF NOT EXISTS room_checkin_log (
  booking_id TEXT NOT NULL,
  kind       TEXT NOT NULL,   -- 'checkin_reminder' | 'checkout_reminder'
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (booking_id, kind)
);
