-- Migration 197: thêm Hình Thức Làm Việc vào hợp đồng (link HĐ ↔ employment_types)
-- Để truy vết: hợp đồng này ứng với hình thức làm việc nào (vd HĐ chính thức = Toàn thời gian).
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS employment_type_id TEXT REFERENCES public.employment_types(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contracts_employment_type ON public.contracts(employment_type_id);
