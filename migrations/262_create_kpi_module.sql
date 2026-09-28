-- Migration 262: Module KPI & Đánh Giá
-- Cách ly theo company_id (kể cả admin không xem chéo công ty). Luồng 3 tầng:
-- tự nhận xét (self) → quản lý đánh giá (manager) → cấp cao chốt điểm cuối (senior).
-- employee/manager/senior/reviewer id lưu TEXT (không FK cứng tới users) — users.id trên
-- prod thực chất là UUID dù schema khai TEXT (xem CODEX.md), tránh lỗi 42804 khi migrate.

-- Cấu hình chu kỳ đánh giá theo từng công ty (linh hoạt tuần/tháng/quý/năm).
CREATE TABLE IF NOT EXISTS public.kpi_company_settings (
  company_id             UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  period_type            TEXT NOT NULL DEFAULT 'quarter',   -- week | month | quarter | year
  ranking_enabled_default BOOLEAN NOT NULL DEFAULT true,     -- nhân viên mới mặc định có vào bảng xếp hạng không
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Bật/tắt + trọng số các nguồn dữ liệu ngoài (Chấm công, Task...) quy đổi vào điểm KPI.
-- Mặc định TẮT hết — không đổi hành vi hệ thống hiện có khi deploy.
CREATE TABLE IF NOT EXISTS public.kpi_integration_sources (
  id          TEXT PRIMARY KEY,
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  source      TEXT NOT NULL,                       -- attendance | task
  enabled     BOOLEAN NOT NULL DEFAULT false,
  weight      NUMERIC(5,2) NOT NULL DEFAULT 0,      -- % đóng góp vào điểm tổng nếu bật
  config      JSONB NOT NULL DEFAULT '{}'::jsonb,   -- công thức quy đổi cụ thể, mở rộng không cần thêm cột
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, source)
);

-- Bộ chỉ tiêu mẫu — gắn theo chức danh/phòng ban hoặc toàn công ty, tùy biến được khi giao kỳ.
CREATE TABLE IF NOT EXISTS public.kpi_templates (
  id          TEXT PRIMARY KEY,
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  scope_type  TEXT NOT NULL DEFAULT 'company',      -- company | department | job_title
  scope_id    UUID,                                  -- id department/job_title tương ứng, NULL nếu company-wide
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.kpi_template_items (
  id           TEXT PRIMARY KEY,
  template_id  TEXT NOT NULL REFERENCES public.kpi_templates(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT,
  weight       NUMERIC(5,2) NOT NULL DEFAULT 0,      -- % trong tổng điểm phiếu
  target_type  TEXT NOT NULL DEFAULT 'number',       -- number | percent | boolean | scale
  target_value TEXT,
  unit         TEXT,
  sort_order   INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Kỳ đánh giá cụ thể của 1 công ty (vd Quý 3/2026).
CREATE TABLE IF NOT EXISTS public.kpi_cycles (
  id          TEXT PRIMARY KEY,
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  period_type TEXT NOT NULL,
  name        TEXT NOT NULL,
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  status      TEXT NOT NULL DEFAULT 'draft',         -- draft | active | closed
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Phiếu KPI của 1 nhân viên trong 1 kỳ.
CREATE TABLE IF NOT EXISTS public.kpi_assignments (
  id                  TEXT PRIMARY KEY,
  cycle_id            TEXT NOT NULL REFERENCES public.kpi_cycles(id) ON DELETE CASCADE,
  company_id          UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id         TEXT NOT NULL,
  template_id         TEXT REFERENCES public.kpi_templates(id) ON DELETE SET NULL,
  manager_id          TEXT,                          -- snapshot người chấm tầng quản lý lúc giao kỳ
  senior_id           TEXT,                          -- snapshot người chốt tầng cấp cao
  status              TEXT NOT NULL DEFAULT 'draft',  -- draft|self_review|manager_review|senior_review|concluded
  self_score          NUMERIC(5,2),
  manager_score       NUMERIC(5,2),
  final_score         NUMERIC(5,2),                  -- điểm CHÍNH THỨC = cấp cao chốt sau cùng
  ranking_enabled     BOOLEAN NOT NULL DEFAULT true,  -- snapshot từ kpi_participant_settings, sửa riêng được
  submitted_self_at   TIMESTAMPTZ,
  submitted_manager_at TIMESTAMPTZ,
  concluded_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cycle_id, employee_id)
);

CREATE TABLE IF NOT EXISTS public.kpi_assignment_items (
  id             TEXT PRIMARY KEY,
  assignment_id  TEXT NOT NULL REFERENCES public.kpi_assignments(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  description    TEXT,
  weight         NUMERIC(5,2) NOT NULL DEFAULT 0,
  target_type    TEXT NOT NULL DEFAULT 'number',
  target_value   TEXT,
  unit           TEXT,
  self_actual    TEXT,
  self_note      TEXT,
  self_score     NUMERIC(5,2),
  manager_actual TEXT,
  manager_note   TEXT,
  manager_score  NUMERIC(5,2),
  final_score    NUMERIC(5,2),
  sort_order     INT NOT NULL DEFAULT 0
);

-- Audit trail — mỗi lượt chấm ở mỗi tầng là 1 dòng, không mất lịch sử dù cấp cao ghi đè điểm quản lý.
CREATE TABLE IF NOT EXISTS public.kpi_reviews (
  id             TEXT PRIMARY KEY,
  assignment_id  TEXT NOT NULL REFERENCES public.kpi_assignments(id) ON DELETE CASCADE,
  tier           TEXT NOT NULL,                       -- self | manager | senior
  reviewer_id    TEXT NOT NULL,
  score          NUMERIC(5,2),
  note           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cờ tham gia xếp hạng — chỉ nhân viên được bật mới xuất hiện trong bảng Best Performer
-- (dùng để loại BOD/Giám đốc khỏi bảng xếp hạng khi công ty cần).
CREATE TABLE IF NOT EXISTS public.kpi_participant_settings (
  id               TEXT PRIMARY KEY,
  company_id       UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id          TEXT NOT NULL,
  ranking_enabled  BOOLEAN NOT NULL DEFAULT true,
  excluded_reason  TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_kpi_templates_company        ON public.kpi_templates(company_id);
CREATE INDEX IF NOT EXISTS idx_kpi_templates_scope           ON public.kpi_templates(scope_type, scope_id);
CREATE INDEX IF NOT EXISTS idx_kpi_template_items_template   ON public.kpi_template_items(template_id);
CREATE INDEX IF NOT EXISTS idx_kpi_cycles_company            ON public.kpi_cycles(company_id);
CREATE INDEX IF NOT EXISTS idx_kpi_cycles_status              ON public.kpi_cycles(status);
CREATE INDEX IF NOT EXISTS idx_kpi_assignments_company       ON public.kpi_assignments(company_id);
CREATE INDEX IF NOT EXISTS idx_kpi_assignments_cycle         ON public.kpi_assignments(cycle_id);
CREATE INDEX IF NOT EXISTS idx_kpi_assignments_employee      ON public.kpi_assignments(employee_id);
CREATE INDEX IF NOT EXISTS idx_kpi_assignments_manager       ON public.kpi_assignments(manager_id);
CREATE INDEX IF NOT EXISTS idx_kpi_assignments_status        ON public.kpi_assignments(status);
CREATE INDEX IF NOT EXISTS idx_kpi_assignment_items_assignment ON public.kpi_assignment_items(assignment_id);
CREATE INDEX IF NOT EXISTS idx_kpi_reviews_assignment        ON public.kpi_reviews(assignment_id);
CREATE INDEX IF NOT EXISTS idx_kpi_participant_company       ON public.kpi_participant_settings(company_id);
