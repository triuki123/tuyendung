-- Migration 184: Log chống trùng nhắc nhở Solace (công nợ, tồn kho thấp).
-- scope ví dụ: "debt:<userId>:2026-06-24" hoặc "lowstock:2026-06-24" (1 lần / phạm vi / ngày).
CREATE TABLE IF NOT EXISTS public.solace_reminder_log (
  scope      TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
