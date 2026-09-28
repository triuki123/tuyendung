-- Migration 223: bảng phân công tổ chức trung tâm (org_assignments).
-- Mô hình "một người – nhiều phân công": kiêm nhiệm nội bộ + đa công ty.
-- department_id NULL = phân công CẤP CÔNG TY (tường minh, không phải "thiếu dữ liệu").
-- Thiết kế đầy đủ: docs/technical/org-structure-overhaul-plan.md
CREATE TABLE IF NOT EXISTS org_assignments (
  id                TEXT PRIMARY KEY,
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  department_id     UUID REFERENCES departments(id) ON DELETE SET NULL,
  sub_department_id UUID REFERENCES sub_departments(id) ON DELETE SET NULL,
  job_title_id      UUID REFERENCES job_titles(id) ON DELETE SET NULL,
  org_role          TEXT NOT NULL DEFAULT 'member'
                    CHECK (org_role IN ('head','deputy','assistant','member')),
  manager_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  is_primary        BOOLEAN NOT NULL DEFAULT false,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  effective_from    DATE,
  effective_to      DATE,
  note              TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Mỗi người đúng 1 phân công CHÍNH đang hiệu lực trên mỗi công ty
CREATE UNIQUE INDEX IF NOT EXISTS uq_org_assign_primary
  ON org_assignments(user_id, company_id) WHERE is_primary AND is_active;

CREATE INDEX IF NOT EXISTS idx_org_assign_user
  ON org_assignments(user_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_org_assign_unit
  ON org_assignments(company_id, department_id, sub_department_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_org_assign_manager
  ON org_assignments(manager_id) WHERE is_active;
