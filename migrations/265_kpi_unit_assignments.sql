-- Migration 265: Đánh giá KPI theo ĐƠN VỊ (phòng ban/bộ phận) — phiếu riêng, song song với
-- phiếu cá nhân. Tự nhận xét = trưởng đơn vị; chuỗi duyệt LINH HOẠT N cấp (không cố định
-- 3 tầng như phiếu cá nhân) do Admin tự dựng khi tạo phiếu.

CREATE TABLE IF NOT EXISTS public.kpi_unit_assignments (
  id               TEXT PRIMARY KEY,
  cycle_id         TEXT NOT NULL REFERENCES public.kpi_cycles(id) ON DELETE CASCADE,
  company_id       UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  unit_type        TEXT NOT NULL,                     -- department | sub_department
  unit_id          UUID NOT NULL,
  template_id      TEXT REFERENCES public.kpi_templates(id) ON DELETE SET NULL,
  self_reviewer_id TEXT NOT NULL,                      -- trưởng đơn vị (tự nhận xét)
  status           TEXT NOT NULL DEFAULT 'draft',      -- draft | in_approval | concluded
  self_score       NUMERIC(5,2),
  final_score      NUMERIC(5,2),                       -- = điểm tầng duyệt CUỐI CÙNG
  current_tier     INT NOT NULL DEFAULT 0,              -- 0 = chờ tự nhận xét; 1..N = tầng đang chờ duyệt
  submitted_self_at TIMESTAMPTZ,
  concluded_at     TIMESTAMPTZ,
  created_by       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cycle_id, unit_type, unit_id)
);

-- Chuỗi người duyệt theo thứ tự — số lượng tầng tự do theo từng phiếu đơn vị.
CREATE TABLE IF NOT EXISTS public.kpi_unit_approvers (
  id                 TEXT PRIMARY KEY,
  unit_assignment_id TEXT NOT NULL REFERENCES public.kpi_unit_assignments(id) ON DELETE CASCADE,
  tier_order         INT NOT NULL,
  approver_id        TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'pending',  -- pending | reviewed
  score              NUMERIC(5,2),
  note               TEXT,
  reviewed_at        TIMESTAMPTZ,
  UNIQUE (unit_assignment_id, tier_order)
);

CREATE TABLE IF NOT EXISTS public.kpi_unit_assignment_items (
  id                 TEXT PRIMARY KEY,
  unit_assignment_id TEXT NOT NULL REFERENCES public.kpi_unit_assignments(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,
  description        TEXT,
  weight             NUMERIC(5,2) NOT NULL DEFAULT 0,
  target_type        TEXT NOT NULL DEFAULT 'number',
  target_value       TEXT,
  unit               TEXT,
  self_actual        TEXT,
  self_note          TEXT,
  self_score         NUMERIC(5,2),
  review_actual      TEXT,                             -- ghi nhận của tầng duyệt ĐANG/VỪA xử lý
  review_note        TEXT,
  review_score       NUMERIC(5,2),
  sort_order         INT NOT NULL DEFAULT 0
);

-- Audit trail — mỗi lượt (tự nhận xét + từng tầng duyệt) là 1 dòng, không mất lịch sử.
CREATE TABLE IF NOT EXISTS public.kpi_unit_reviews (
  id                 TEXT PRIMARY KEY,
  unit_assignment_id TEXT NOT NULL REFERENCES public.kpi_unit_assignments(id) ON DELETE CASCADE,
  tier_order         INT NOT NULL,                     -- 0 = tự nhận xét (trưởng đơn vị)
  reviewer_id        TEXT NOT NULL,
  score              NUMERIC(5,2),
  note               TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kpi_unit_assignments_company  ON public.kpi_unit_assignments(company_id);
CREATE INDEX IF NOT EXISTS idx_kpi_unit_assignments_cycle    ON public.kpi_unit_assignments(cycle_id);
CREATE INDEX IF NOT EXISTS idx_kpi_unit_assignments_unit     ON public.kpi_unit_assignments(unit_type, unit_id);
CREATE INDEX IF NOT EXISTS idx_kpi_unit_assignments_self     ON public.kpi_unit_assignments(self_reviewer_id);
CREATE INDEX IF NOT EXISTS idx_kpi_unit_approvers_assignment ON public.kpi_unit_approvers(unit_assignment_id);
CREATE INDEX IF NOT EXISTS idx_kpi_unit_approvers_approver   ON public.kpi_unit_approvers(approver_id);
CREATE INDEX IF NOT EXISTS idx_kpi_unit_items_assignment     ON public.kpi_unit_assignment_items(unit_assignment_id);
CREATE INDEX IF NOT EXISTS idx_kpi_unit_reviews_assignment   ON public.kpi_unit_reviews(unit_assignment_id);
