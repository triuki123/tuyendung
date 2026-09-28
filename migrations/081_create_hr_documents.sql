-- Migration 081: hr_documents — hồ sơ nhân sự (BYTEA inline, 1 file/dòng)
-- Nhân viên có thể tự upload hồ sơ của chính mình; C&B quản lý hồ sơ mọi người.
CREATE TABLE IF NOT EXISTS public.hr_documents (
  id           TEXT PRIMARY KEY,
  employee_id  TEXT NOT NULL,
  doc_type_id  TEXT REFERENCES public.hr_document_types(id) ON DELETE SET NULL,
  title        TEXT,
  file_name    VARCHAR(255) NOT NULL,
  mime_type    VARCHAR(150),
  size_bytes   INTEGER,
  content      BYTEA NOT NULL,
  uploaded_by  TEXT,
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deleted_at   TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_hr_documents_employee_id ON public.hr_documents(employee_id);
