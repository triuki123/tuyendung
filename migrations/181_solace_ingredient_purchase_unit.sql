-- Migration 181: Đơn vị mua + hệ số quy đổi cho nguyên liệu SOLACE
-- Cho phép mua theo đơn vị lớn (kg, lít, thùng) nhưng công thức tính theo đơn vị gốc (g, ml, cái).
-- purchase_factor = số đơn vị GỐC trong 1 đơn vị MUA (vd 1 kg = 1000 g → factor = 1000).
ALTER TABLE public.solace_ingredients
  ADD COLUMN IF NOT EXISTS purchase_unit   TEXT,
  ADD COLUMN IF NOT EXISTS purchase_factor NUMERIC(14,4) NOT NULL DEFAULT 1;
