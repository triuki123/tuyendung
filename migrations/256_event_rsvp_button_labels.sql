-- Migration 256: nhãn nút RSVP tuỳ biến (thay vì cố định "Có tham gia"/"Không tham gia")
ALTER TABLE event_rsvp
  ADD COLUMN IF NOT EXISTS yes_label TEXT,
  ADD COLUMN IF NOT EXISTS no_label  TEXT;
