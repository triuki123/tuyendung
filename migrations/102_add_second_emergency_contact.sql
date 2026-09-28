-- Migration 102: Người thân liên hệ thứ 2 (Người Thân Liên Hệ 2)
-- - Thêm 4 field vào biểu mẫu Onboarding (section 'emergency2'), không bắt buộc.
-- - Thêm 4 cột vào users để lưu vào Hồ Sơ Nhân Sự khi duyệt (đồng bộ người thân 1).

-- 1) Field biểu mẫu Onboarding — section 'emergency2'
INSERT INTO onboarding_form_fields
  (id, form_id, field_key, label, field_type, section, required, enabled, sort_order, help_text, options, is_system)
VALUES
  ('obf_ec2_name',         'form_onboarding_default', 'emergency_contact_2_name',         'Họ Tên Người Thân', 'text',     'emergency2', false, true, 10, NULL, NULL, true),
  ('obf_ec2_relationship', 'form_onboarding_default', 'emergency_contact_2_relationship', 'Mối Quan Hệ',       'text',     'emergency2', false, true, 20, NULL, NULL, true),
  ('obf_ec2_phone',        'form_onboarding_default', 'emergency_contact_2_phone',        'Số Điện Thoại',     'tel',      'emergency2', false, true, 30, NULL, NULL, true),
  ('obf_ec2_address',      'form_onboarding_default', 'emergency_contact_2_address',      'Địa Chỉ',           'textarea', 'emergency2', false, true, 40, NULL, NULL, true)
ON CONFLICT (form_id, field_key) DO NOTHING;

-- 2) Cột Hồ Sơ Nhân Sự (users)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS emergency_contact_2_name          TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_2_relationship  TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_2_phone         TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_2_address       TEXT;

SELECT 'Migration 102: second emergency contact added' AS migration_status;
