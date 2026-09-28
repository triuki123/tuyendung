-- Migration 198: danh bạ subscriber bot Solace (cho Marketing broadcast)
-- Lưu MỌI người từng /start bot Solace — kể cả chưa liên kết tài khoản FADO.
--  - user_id: gắn khi đã liên kết (null nếu khách vãng lai chỉ /start)
--  - opted_out: true khi user /stop hoặc đã chặn bot (gửi trả 403) → không broadcast nữa
CREATE TABLE IF NOT EXISTS public.solace_subscribers (
  chat_id      TEXT PRIMARY KEY,
  user_id      TEXT,
  name         TEXT,
  username     TEXT,
  opted_out    BOOLEAN NOT NULL DEFAULT false,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_solace_subscribers_active
  ON public.solace_subscribers (opted_out) WHERE opted_out = false;

-- Backfill: mọi user FADO đã liên kết trước khi có bảng này đều là subscriber sẵn có.
INSERT INTO public.solace_subscribers (chat_id, user_id, name, started_at, last_seen_at)
SELECT telegram_chat_id, id::text, name, NOW(), NOW()
  FROM public.users
 WHERE telegram_chat_id IS NOT NULL
ON CONFLICT (chat_id) DO NOTHING;
