-- Migration 086: yêu cầu đổi hồ sơ nhân sự (nhân viên gửi → C&B duyệt)
CREATE TABLE IF NOT EXISTS public.hr_document_replace_requests (
  id              TEXT PRIMARY KEY,
  original_doc_id TEXT NOT NULL REFERENCES public.hr_documents(id) ON DELETE CASCADE,
  new_file_name   TEXT NOT NULL,
  new_title       TEXT,
  new_mime_type   TEXT,
  new_size_bytes  BIGINT,
  new_content     BYTEA NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected | cancelled
  requested_by    TEXT NOT NULL,
  reviewed_by     TEXT,
  review_note     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hdrr_original_doc ON public.hr_document_replace_requests(original_doc_id);
CREATE INDEX IF NOT EXISTS idx_hdrr_status       ON public.hr_document_replace_requests(status);
CREATE INDEX IF NOT EXISTS idx_hdrr_requested_by ON public.hr_document_replace_requests(requested_by);
