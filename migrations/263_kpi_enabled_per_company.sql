-- Migration 263: Cờ bật/tắt module KPI theo từng công ty (opt-in, mặc định TẮT).
-- Có công ty dùng KPI & Đánh Giá, có công ty không cần — Super Admin/Admin công ty
-- đó tự bật khi sẵn sàng cấu hình bộ chỉ tiêu/quy tắc riêng.
ALTER TABLE public.kpi_company_settings
  ADD COLUMN IF NOT EXISTS kpi_enabled BOOLEAN NOT NULL DEFAULT false;
