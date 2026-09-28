-- Migration 174: tính năng Chúc Mừng Sinh Nhật
-- - birthday_wishes: lời chúc gửi tới người sinh nhật (1 lời/người gửi/ngày)
-- - birthday_reminder_log: chống gửi trùng digest đầu tháng & nhắc BOD theo ngày
-- - seed tag "BOD & Leader"

CREATE TABLE IF NOT EXISTS public.birthday_wishes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id TEXT NOT NULL,
  to_user_id   TEXT NOT NULL,
  message      TEXT NOT NULL,
  wish_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (from_user_id, to_user_id, wish_date)
);
CREATE INDEX IF NOT EXISTS idx_birthday_wishes_to ON public.birthday_wishes(to_user_id, wish_date);

CREATE TABLE IF NOT EXISTS public.birthday_reminder_log (
  log_key    TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.tags (name, description, color, is_active)
SELECT 'BOD & Leader', 'Ban lãnh đạo & quản lý — nhắc sinh nhật riêng', '#f59e0b', true
WHERE NOT EXISTS (SELECT 1 FROM public.tags WHERE lower(name) = lower('BOD & Leader'));
