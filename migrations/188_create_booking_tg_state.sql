-- Migration 188: Trạng thái hội thoại đặt phòng họp qua bot Telegram (FADO Notification)
-- Lưu bước đang đặt theo từng chat (phòng → ngày → giờ → mục đích → xác nhận).
-- Idempotent.
CREATE TABLE IF NOT EXISTS public.booking_tg_state (
  telegram_id TEXT PRIMARY KEY,
  data        JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
