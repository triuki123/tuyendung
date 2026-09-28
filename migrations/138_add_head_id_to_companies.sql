-- Migration 138: Người đứng đầu công ty (giống departments/sub_departments đã có head_id).
-- TEXT (lưu users.id dạng chuỗi) để tránh lỗi '' → uuid và đồng bộ cách xử lý ở app.
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS head_id TEXT;
