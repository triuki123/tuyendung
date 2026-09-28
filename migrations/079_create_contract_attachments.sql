-- Migration 079: contract_attachments — file đính kèm hợp đồng (BYTEA trong DB)
-- Lưu nội dung file trong PostgreSQL (giống ticket_attachments) → bền qua restart
-- container, nằm trong backup DB. deleted_at: soft-delete.
CREATE TABLE IF NOT EXISTS public.contract_attachments (
  id          TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  file_name   VARCHAR(255) NOT NULL,
  mime_type   VARCHAR(150),
  size_bytes  INTEGER,
  content     BYTEA NOT NULL,
  uploaded_by TEXT,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deleted_at  TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_contract_attachments_contract_id ON public.contract_attachments(contract_id);
