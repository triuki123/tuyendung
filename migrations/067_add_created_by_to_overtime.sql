-- 067_add_created_by_to_overtime.sql
-- Thêm cột created_by vào attendance_overtime
-- NULL = nhân viên tự tạo, có giá trị = quản lý thêm hộ (manager userId)

ALTER TABLE attendance_overtime
  ADD COLUMN IF NOT EXISTS created_by TEXT;

COMMENT ON COLUMN attendance_overtime.created_by IS
  'NULL = nhân viên tự khai báo. Có giá trị = managerId đã thêm hộ nhân viên.';
