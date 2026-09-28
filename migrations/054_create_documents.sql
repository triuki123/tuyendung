-- Migration 054: Tạo bảng documents cho module Văn Bản - Quyết Định
-- Tất cả nhân sự đều xem được; chỉ admin/super_admin quản lý

CREATE TABLE IF NOT EXISTS public.documents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,
  doc_number   TEXT,
  doc_type     TEXT NOT NULL DEFAULT 'document',
  issued_by    TEXT,
  issued_date  DATE,
  description  TEXT,
  status       TEXT NOT NULL DEFAULT 'active',
  created_by   UUID,
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_status      ON public.documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_doc_type    ON public.documents(doc_type);
CREATE INDEX IF NOT EXISTS idx_documents_issued_date ON public.documents(issued_date DESC);
CREATE INDEX IF NOT EXISTS idx_documents_created_at  ON public.documents(created_at DESC);

SELECT 'Migration 054: documents table created' AS migration_status;
