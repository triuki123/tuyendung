-- Migration 090: Bảng thẻ đánh giá thử việc/học việc
CREATE TABLE IF NOT EXISTS public.evaluations (
  id                   TEXT PRIMARY KEY,
  employee_id          TEXT NOT NULL,                     -- Nhân viên được đánh giá
  employment_type_id   TEXT REFERENCES public.employment_types(id) ON DELETE SET NULL,
  employment_type_name TEXT,                              -- Snapshot tên hình thức lúc tạo
  hire_date            DATE,                              -- Ngày bắt đầu làm việc
  probation_end_date   DATE,                              -- Ngày kết thúc thử việc
  status               TEXT NOT NULL DEFAULT 'draft',    -- draft | pending_signing | evaluated | passed | failed
  result               TEXT,                              -- pass | fail (sau khi kết luận)
  result_note          TEXT,                              -- Ghi chú kết quả
  evaluated_by         TEXT,                              -- Người thực hiện đánh giá
  concluded_by         TEXT,                              -- C&B kết luận
  concluded_at         TIMESTAMPTZ,
  resulting_contract_id TEXT,                            -- HĐ chính thức được tạo sau khi PASS
  auto_generated       BOOLEAN NOT NULL DEFAULT false,    -- true = scheduler tự tạo
  created_by           TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evaluations_employee_id      ON public.evaluations(employee_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_status           ON public.evaluations(status);
CREATE INDEX IF NOT EXISTS idx_evaluations_probation_end    ON public.evaluations(probation_end_date);
CREATE INDEX IF NOT EXISTS idx_evaluations_employment_type  ON public.evaluations(employment_type_id);
