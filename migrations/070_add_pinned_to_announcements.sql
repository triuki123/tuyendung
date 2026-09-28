-- Migration 070: thêm cột pinned cho bảng announcements
ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_announcements_pinned ON public.announcements(pinned);
