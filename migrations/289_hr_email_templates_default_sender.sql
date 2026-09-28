-- Migration 289: cho phép gán SENDER MẶC ĐỊNH cho template tuyển dụng cũ.
--
-- Trung Tâm Email hiển thị gộp 2 nguồn template: email_templates (mới) và
-- hr_email_templates (cũ, hiện dưới nhãn "HT"). Template cũ không có cột
-- default_sender_id nên bấm Lưu là báo "Không tìm thấy template".
ALTER TABLE hr_email_templates
  ADD COLUMN IF NOT EXISTS default_sender_id TEXT;
