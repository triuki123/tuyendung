-- Migration 084: Thêm employee_code vào users
-- Dùng để auto-map khi máy chấm công push dữ liệu qua ADMS:
-- SELECT id FROM users WHERE employee_code = $1 AND status = 'active'
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS employee_code TEXT;

CREATE INDEX IF NOT EXISTS idx_users_employee_code ON public.users(employee_code);
