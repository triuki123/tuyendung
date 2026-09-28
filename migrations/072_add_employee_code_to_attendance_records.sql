-- Migration 072: Thêm employee_code vào attendance_records
-- Để khi admin sửa lại mapping (employee_code → user_id), có thể re-attribute
-- đúng các bản ghi của đúng nhân viên trên máy, tránh sửa nhầm bản ghi của người khác.

ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS employee_code TEXT;

-- Index để lookup nhanh khi re-attribute
CREATE INDEX IF NOT EXISTS idx_attendance_records_machine_employee
  ON public.attendance_records(machine_id, employee_code);

SELECT 'Migration 072: employee_code added to attendance_records' AS migration_status;
