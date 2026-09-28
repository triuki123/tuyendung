-- Migration 068: Thêm cột total_hours vào attendance_sheets
-- Cột này bị thiếu từ migration 061; cần cho tính năng Duyệt Bảng Công

ALTER TABLE public.attendance_sheets
  ADD COLUMN IF NOT EXISTS total_hours NUMERIC(6,2) DEFAULT 0;

-- Comment mô tả
COMMENT ON COLUMN public.attendance_sheets.total_hours IS 'Tổng giờ làm thực tế trong tháng (giờ, 1 chữ số thập phân)';

SELECT 'Migration 068: total_hours added to attendance_sheets' AS migration_status;
