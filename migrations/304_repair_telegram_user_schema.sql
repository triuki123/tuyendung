-- Repair databases whose legacy Telegram migrations were skipped.
-- Additive only: preserve existing chat IDs and notification opt-in choices.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT,
  ADD COLUMN IF NOT EXISTS telegram_enabled BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS telegram_id TEXT,
  ADD COLUMN IF NOT EXISTS telegram_username TEXT,
  ADD COLUMN IF NOT EXISTS telegram_first_name TEXT,
  ADD COLUMN IF NOT EXISTS telegram_last_name TEXT,
  ADD COLUMN IF NOT EXISTS telegram_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS telegram_linked_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS users_telegram_id_unique
  ON public.users (telegram_id) WHERE telegram_id IS NOT NULL;
