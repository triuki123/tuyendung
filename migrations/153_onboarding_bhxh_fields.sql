-- Migration 153: Thêm 2 trường BHXH vào biểu mẫu onboarding (section 'other')
INSERT INTO onboarding_form_fields
  (id, field_key, label, field_type, section, required, enabled, sort_order, help_text, options, is_system)
VALUES
  ('obf_has_social_ins',    'has_social_insurance',    'Đã tham gia BHXH ở công ty cũ?', 'checkbox', 'other', false, true, 40, 'Tích vào nếu bạn đã từng đóng bảo hiểm xã hội tại đơn vị trước', NULL, false),
  ('obf_social_ins_number', 'social_insurance_number', 'Mã Số Bảo Hiểm Xã Hội',          'text',     'other', false, true, 50, 'Chỉ hiện khi đã tham gia BHXH — bỏ trống nếu chưa có', NULL, false)
ON CONFLICT (id) DO NOTHING;
