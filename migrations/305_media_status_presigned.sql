-- Migration 305: cột status cho pattern presigned upload (pending → confirmed)
-- + index phục vụ cleanup job dọn record pending bỏ ngang.
-- Dữ liệu cũ (proxy upload / di trú) mặc định 'confirmed'.

ALTER TABLE public.media
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'confirmed';

DO $$ BEGIN
  ALTER TABLE public.media
    ADD CONSTRAINT chk_media_status CHECK (status IN ('pending', 'confirmed'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_media_status_created_at ON public.media(status, created_at);
