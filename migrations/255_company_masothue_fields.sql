-- Migration 255: bổ sung các trường tra cứu masothue.com cho công ty
-- (địa chỉ thuế, tình trạng, tên quốc tế/viết tắt, ngày hoạt động, cơ quan thuế
--  quản lý, loại hình DN, ngành nghề chính & danh sách ngành nghề kinh doanh).
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS tax_address         TEXT,
  ADD COLUMN IF NOT EXISTS status              TEXT,
  ADD COLUMN IF NOT EXISTS international_name   TEXT,
  ADD COLUMN IF NOT EXISTS short_name           TEXT,
  ADD COLUMN IF NOT EXISTS activation_date      TEXT,
  ADD COLUMN IF NOT EXISTS managing_tax_office  TEXT,
  ADD COLUMN IF NOT EXISTS business_type        TEXT,
  ADD COLUMN IF NOT EXISTS main_business_line   TEXT,
  ADD COLUMN IF NOT EXISTS business_lines       TEXT;
