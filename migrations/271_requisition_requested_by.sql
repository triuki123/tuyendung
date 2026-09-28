-- Migration 271: người YÊU CẦU của yêu cầu tuyển dụng (khác owner_id = recruiter phụ trách,
-- khác created_by = người bấm tạo record). Người xử lý (HR) có thể tạo hộ → chọn người yêu cầu.
ALTER TABLE requisitions
  ADD COLUMN IF NOT EXISTS requested_by TEXT;

-- Dữ liệu cũ: coi người tạo record là người yêu cầu (khi chưa có thông tin khác).
UPDATE requisitions SET requested_by = created_by WHERE requested_by IS NULL AND created_by IS NOT NULL;
