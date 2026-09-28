-- Migration 195: Luồng chuyển tiếp hình thức làm việc sau thử việc
-- Tách BIỆT với cấu hình Onboarding (employment_type_contract_types).
-- Khi đánh giá thử việc ĐẠT → chuyển sang hình thức đích + tự sinh các HĐ nháp đã gán ở đây.

CREATE TABLE IF NOT EXISTS public.employment_transitions (
  id                        TEXT PRIMARY KEY,
  from_employment_type_id   TEXT NOT NULL REFERENCES public.employment_types(id) ON DELETE CASCADE,
  to_employment_type_id     TEXT NOT NULL REFERENCES public.employment_types(id) ON DELETE CASCADE,
  is_active                 BOOLEAN NOT NULL DEFAULT true,
  sort_order                INTEGER NOT NULL DEFAULT 0,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_emp_transitions_from
  ON public.employment_transitions(from_employment_type_id);

-- Loại HĐ tự sinh (nháp) cho từng luồng chuyển tiếp
CREATE TABLE IF NOT EXISTS public.employment_transition_contract_types (
  transition_id    TEXT NOT NULL REFERENCES public.employment_transitions(id) ON DELETE CASCADE,
  contract_type_id TEXT NOT NULL REFERENCES public.contract_types(id) ON DELETE CASCADE,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (transition_id, contract_type_id)
);
