-- Migration 273: thời gian hết hạn biểu mẫu. Quá hạn → link public từ chối nhận phản hồi.
-- NULL = không giới hạn thời gian (giữ nguyên hành vi cũ).
ALTER TABLE form_templates
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
