-- Migration 096: Cột phục vụ lưu trữ hợp đồng vào kho Hồ Sơ
-- source_contract_id: truy vết tài liệu Hồ Sơ được sinh từ hợp đồng nào
ALTER TABLE public.hr_documents
  ADD COLUMN IF NOT EXISTS source_contract_id TEXT;

-- archived_to_docs_at: đánh dấu hợp đồng đã được lưu trữ (chống lưu trùng)
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS archived_to_docs_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_hr_documents_source_contract ON public.hr_documents(source_contract_id);
