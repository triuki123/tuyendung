-- Migration 274: template Nội Bộ "Nội dung tự do" — gửi nội dung thuần / poster (đính kèm ảnh),
-- không ép cấu trúc. Qua Telegram: dùng ô "Nội dung tin nhắn" + "Thêm ảnh" (poster gửi dạng ảnh).
-- Qua email: render {{noi_dung}} giữ nguyên xuống dòng.
INSERT INTO email_templates (id, category, key, name, description, subject_tpl, body_html_tpl, schema, engine, is_system)
VALUES (
  'et_internal_content',
  'internal',
  'internal_content',
  'Nội Bộ — Nội dung tự do (poster/thông báo)',
  'Gửi nội dung thuần hoặc poster (đính kèm ảnh) cho nội bộ — không cần điền trường cấu trúc.',
  'Thông báo nội bộ',
  '<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#111;line-height:1.6;white-space:pre-wrap;">{{noi_dung}}</div>',
  '[{"key":"noi_dung","label":"Nội dung","type":"textarea","required":false}]'::jsonb,
  'ses', false
) ON CONFLICT (key) DO NOTHING;
