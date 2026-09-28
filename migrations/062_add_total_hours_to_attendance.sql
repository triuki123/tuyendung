-- Migration 062: Thêm cột total_hours vào attendance_sheets
-- Thay thế cách tính late/present bằng tổng giờ làm thực tế (theo Tanca-style)

ALTER TABLE public.attendance_sheets
  ADD COLUMN IF NOT EXISTS total_hours DECIMAL(6,2) DEFAULT 0;

SELECT 'Migration 062: total_hours added to attendance_sheets' AS migration_status;
