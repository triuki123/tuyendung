-- Migration 272: bộ phận (sub_department) cho yêu cầu tuyển dụng — đầy đủ Công ty > Phòng ban > Bộ phận.
-- Chỉ Công ty bắt buộc (ràng ở app); phòng ban/bộ phận cho phép để trống.
ALTER TABLE requisitions
  ADD COLUMN IF NOT EXISTS sub_department_id TEXT;
