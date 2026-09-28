-- Migration 177: Gắn Hình thức làm việc ↔ Loại hợp đồng (many-to-many)
CREATE TABLE IF NOT EXISTS public.employment_type_contract_types (
  employment_type_id TEXT NOT NULL REFERENCES public.employment_types(id) ON DELETE CASCADE,
  contract_type_id   TEXT NOT NULL REFERENCES public.contract_types(id)   ON DELETE CASCADE,
  sort_order         INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (employment_type_id, contract_type_id)
);

CREATE INDEX IF NOT EXISTS idx_etct_employment_type
  ON public.employment_type_contract_types(employment_type_id);
