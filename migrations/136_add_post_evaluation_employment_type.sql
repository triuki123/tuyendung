-- Migration 136: Thêm cột Hình Thức Sau Đánh Giá vào bảng evaluations.
-- Khi đánh giá, HR chọn nhân viên sẽ được chuyển sang hình thức nào sau khi ĐẠT.
-- VD: Thực Tập Sinh → Học Việc / Thử Việc / Chính Thức
--     Học Việc → Thử Việc / Chính Thức
ALTER TABLE evaluations
  ADD COLUMN IF NOT EXISTS post_evaluation_employment_type_id   TEXT,
  ADD COLUMN IF NOT EXISTS post_evaluation_employment_type_name TEXT;
