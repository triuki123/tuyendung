-- Migration 128: Bảng log tổng kết chấm công cuối tháng
CREATE TABLE IF NOT EXISTS attendance_summary_log (
  id         SERIAL PRIMARY KEY,
  user_id    TEXT NOT NULL,
  period_key TEXT NOT NULL,  -- vd: 'summary:2026-05'
  sent_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, period_key)
);
