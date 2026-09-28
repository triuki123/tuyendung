-- Migration 172: hồ sơ nghỉ việc đính kèm trong offboarding → lưu vào kho Hồ Sơ khi hoàn tất
-- - Loại hồ sơ mới 'hdoc_termination'
-- - hr_documents.source_offboarding_id: truy vết tài liệu sinh ra từ quy trình offboarding nào

INSERT INTO public.hr_document_types (id, name, description, sort_order, is_active)
VALUES ('hdoc_termination', 'Hồ sơ nghỉ việc', 'Quyết định thôi việc / biên bản thanh lý / đơn xin nghỉ — lưu tự động khi hoàn tất offboarding', 7, true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.hr_documents
  ADD COLUMN IF NOT EXISTS source_offboarding_id TEXT;

CREATE INDEX IF NOT EXISTS idx_hr_documents_source_offboarding ON public.hr_documents(source_offboarding_id);
