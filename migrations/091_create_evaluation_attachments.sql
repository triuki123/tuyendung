-- Migration 091: File đính kèm cho đánh giá (biên bản đánh giá PDF...)
CREATE TABLE IF NOT EXISTS public.evaluation_attachments (
  id             TEXT PRIMARY KEY,
  evaluation_id  TEXT NOT NULL REFERENCES public.evaluations(id) ON DELETE CASCADE,
  file_name      TEXT NOT NULL,
  mime_type      TEXT,
  size_bytes     BIGINT,
  content        BYTEA NOT NULL,
  uploaded_by    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at     TIMESTAMPTZ                           -- Soft delete
);

CREATE INDEX IF NOT EXISTS idx_eval_attachments_evaluation ON public.evaluation_attachments(evaluation_id);
