-- Migration 137: Cấu hình loại giấy tờ cho biểu mẫu Onboarding.
-- Cho phép admin (tab "Cấu Hình Biểu Mẫu") bật/tắt từng loại giấy tờ:
--   onboarding_visible  : có hiện slot đính kèm trên form public không
--   onboarding_required : ứng viên BẮT BUỘC phải đính kèm loại này
--   onboarding_multiple : cho phép đính kèm NHIỀU tệp cho loại này
ALTER TABLE hr_document_types
  ADD COLUMN IF NOT EXISTS onboarding_visible  BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS onboarding_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_multiple BOOLEAN NOT NULL DEFAULT false;

-- HĐ: C&B tự tạo & lưu trữ, ứng viên không nộp ở form onboarding → ẩn.
UPDATE hr_document_types SET onboarding_visible = false WHERE id = 'hdoc_contract';

-- Mặc định bắt buộc: CV + CMND/CCCD (admin chỉnh lại được trong Cấu Hình Biểu Mẫu).
UPDATE hr_document_types SET onboarding_required = true WHERE id IN ('hdoc_cv', 'hdoc_id_card');

-- Bằng cấp / Giấy tờ khác: cho phép nhiều tệp.
UPDATE hr_document_types SET onboarding_multiple = true WHERE id IN ('hdoc_degree', 'hdoc_other');
