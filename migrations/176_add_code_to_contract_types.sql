-- Migration 176: Thêm mã ngắn + template sinh mã cho loại hợp đồng
ALTER TABLE public.contract_types
  ADD COLUMN IF NOT EXISTS code          TEXT,
  ADD COLUMN IF NOT EXISTS code_template TEXT;

-- Seed mã mặc định (chỉ set khi đang NULL — không đè cấu hình đã chỉnh tay)
UPDATE public.contract_types SET code = 'TTHT'  WHERE id = 'ctype_cooperation' AND code IS NULL;
UPDATE public.contract_types SET code = 'NDA'   WHERE id = 'ctype_nda'         AND code IS NULL;
UPDATE public.contract_types SET code = 'HDLD'  WHERE id IN ('ctype_indefinite', 'ctype_fixed_term') AND code IS NULL;
UPDATE public.contract_types SET code = 'TV'    WHERE id = 'ctype_probation'   AND code IS NULL;
UPDATE public.contract_types SET code = 'TVIEC' WHERE id = 'ctype_termination' AND code IS NULL;

-- Template mặc định chung — khớp ví dụ: 2206.01/2026/TTHT-PS
UPDATE public.contract_types
   SET code_template = '{DD}{MM}.{SEQ}/{YYYY}/{TYPE}-{COMPANY}'
 WHERE code_template IS NULL;
