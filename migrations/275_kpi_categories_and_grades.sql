-- Migration 275: Đưa cấu hình ẩn của KPI ra bảng thật (mỗi công ty tự định nghĩa riêng).
--  - kpi_categories: nhóm chỉ tiêu (trước đây hardcode cứng 4 giá trị trong code).
--  - kpi_grade_thresholds: ngưỡng điểm xếp loại A/B/C/D (trước đây hardcode 90/75/60).
-- Company chưa có dữ liệu ở 2 bảng này ⇒ app tự dùng DEFAULT cũ (không đổi hành vi khi deploy).

CREATE TABLE IF NOT EXISTS public.kpi_categories (
  id         TEXT PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  key        TEXT NOT NULL,              -- slug lưu trong kpi_template_items.category / kpi_assignment_items.category
  label      TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, key)
);

CREATE TABLE IF NOT EXISTS public.kpi_grade_thresholds (
  company_id  UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  grade_a_min NUMERIC(5,2) NOT NULL DEFAULT 90,
  grade_b_min NUMERIC(5,2) NOT NULL DEFAULT 75,
  grade_c_min NUMERIC(5,2) NOT NULL DEFAULT 60,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kpi_categories_company ON public.kpi_categories(company_id);
