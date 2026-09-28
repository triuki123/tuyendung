-- Migration 097: Thêm cột attendance_parser cho attendance_machines
-- Cho phép cấu hình parser per-machine: 'legacy' (mặc định) hoặc 'v6.60' (firmware ZKTeco mới)
-- Legacy:  uid = attendance_counter,  id = employee_code
-- v6.60:   uid = employee_code,       id = sequence_number

ALTER TABLE public.attendance_machines
  ADD COLUMN IF NOT EXISTS attendance_parser TEXT NOT NULL DEFAULT 'legacy'
    CHECK (attendance_parser IN ('legacy', 'v6.60'));

COMMENT ON COLUMN public.attendance_machines.attendance_parser IS
  'Parser ZKTeco: legacy (mặc định, id=employee_code) hoặc v6.60 (uid=employee_code)';

SELECT 'Migration 097: attendance_parser added to attendance_machines' AS migration_status;
