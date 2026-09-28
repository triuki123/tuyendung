-- Migration 201: đếm số lần nhắc ký + mốc đã báo cáo cấp trên (escalation)
--  - reminder_count: tổng số lần đã nhắc ký (nhắc tay + scheduler tương lai)
--  - escalated_at: thời điểm đã tự báo cáo lên cấp trên (NULL = chưa) → chống báo lặp
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS reminder_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS escalated_at   TIMESTAMPTZ;
