-- Migration 056: Tạo bảng announcements cho module Thông Báo - Truyền Thông
-- HR đăng bản tin, tự động gửi Telegram khi publish

CREATE TABLE IF NOT EXISTS public.announcements (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title          TEXT NOT NULL,
  content        TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'draft',
  telegram_sent  BOOLEAN DEFAULT false,
  published_at   TIMESTAMP WITH TIME ZONE,
  published_by   UUID,
  created_by     UUID,
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_announcements_status       ON public.announcements(status);
CREATE INDEX IF NOT EXISTS idx_announcements_published_at ON public.announcements(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcements_created_at   ON public.announcements(created_at DESC);

SELECT 'Migration 056: announcements table created' AS migration_status;
