-- Migration 104: ngày nghỉ việc (turnover analytics)
-- Set tự động khi deactivate user (status -> inactive). Phục vụ tính turnover, nghỉ sớm.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS left_date DATE;

SELECT 'Migration 104: users.left_date added' AS migration_status;
