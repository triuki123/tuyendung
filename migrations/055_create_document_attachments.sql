-- Migration 055: Tạo bảng document_attachments cho file đính kèm văn bản

CREATE TABLE IF NOT EXISTS public.document_attachments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  file_name    TEXT NOT NULL,
  stored_name  TEXT NOT NULL,
  mime_type    TEXT,
  file_size    BIGINT DEFAULT 0,
  content      BYTEA,
  uploaded_by  UUID,
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_document_attachments_document_id ON public.document_attachments(document_id);

SELECT 'Migration 055: document_attachments table created' AS migration_status;
