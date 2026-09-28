-- Migration 185: Bot Solace trên Telegram — token liên kết tài khoản + giỏ hàng theo chat.

-- Token liên kết 1 lần (deep-link /start <token>): gắn telegram_id ↔ tài khoản FADO.
CREATE TABLE IF NOT EXISTS public.solace_tg_link_tokens (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trạng thái đặt món theo từng chat Telegram (giỏ + bước đang thao tác).
CREATE TABLE IF NOT EXISTS public.solace_tg_carts (
  telegram_id TEXT PRIMARY KEY,
  data        JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
