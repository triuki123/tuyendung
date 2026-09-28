-- Migration 057: Tạo bảng announcement_attachments (ảnh + file PDF/Word)

CREATE TABLE IF NOT EXISTS public.announcement_attachments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id  UUID NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  file_name        TEXT NOT NULL,
  stored_name      TEXT NOT NULL,
  mime_type        TEXT,
  file_size        BIGINT DEFAULT 0,
  content          BYTEA,
  is_image         BOOLEAN DEFAULT false,
  uploaded_by      UUID,
  created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_announcement_attachments_announcement_id ON public.announcement_attachments(announcement_id);
CREATE INDEX IF NOT EXISTS idx_announcement_attachments_is_image        ON public.announcement_attachments(is_image);

SELECT 'Migration 057: announcement_attachments table created' AS migration_status;
