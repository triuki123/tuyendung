-- Migration 107: Thêm role 'manager' vào constraint users_role_check.
-- UI đã có option 'manager' nhưng DB constraint chỉ có 3 giá trị (thiếu manager)
-- -> lưu user với role manager bị lỗi "violates check constraint".

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('super_admin', 'admin', 'manager', 'user'));

SELECT 'Migration 107: manager role added to users_role_check' AS migration_status;
