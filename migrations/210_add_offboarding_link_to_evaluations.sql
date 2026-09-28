-- Migration 210: Liên kết đánh giá thử việc với quy trình Offboarding
--
-- Khi nhân sự không đạt + chấm dứt, hệ thống tạo quy trình Offboarding thay vì
-- hồ sơ thôi việc (contract). Thêm cột để lưu liên kết 2 chiều:
--   evaluations.resulting_offboarding_id  → từ đánh giá sang quy trình offboarding
--   offboarding_processes.source_evaluation_id → từ offboarding truy ngược đánh giá

ALTER TABLE evaluations
  ADD COLUMN IF NOT EXISTS resulting_offboarding_id TEXT;

ALTER TABLE offboarding_processes
  ADD COLUMN IF NOT EXISTS source_evaluation_id TEXT;
