-- Migration 270: template email "nhiều tài khoản" — 1 người nhận, N tài khoản tự đánh số 1.2.3…
-- Dùng field kiểu 'rows' (accounts) + vòng lặp {{#accounts}}…{{/accounts}} với {{@index}} tự đánh số.
INSERT INTO email_templates (id, category, key, name, description, subject_tpl, body_html_tpl, schema, engine, is_system)
VALUES (
  'et_account_multi',
  'account',
  'account_multi',
  'Tài Khoản — Cấp nhiều tài khoản (tự đánh số)',
  'Gửi cho 1 nhân sự nhiều tài khoản (AssetFlow, Email, ERP…); thêm/bớt tài khoản tùy ý, email tự đánh số 1.2.3.',
  'Thông tin tài khoản đăng nhập của bạn',
  '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111;"><h2 style="color:#1e40af;text-align:center;margin:0 0 16px;">THÔNG TIN TÀI KHOẢN ĐĂNG NHẬP</h2><p>Kính gửi <strong>{{name}}</strong>,</p><p>Phòng Nhân sự gửi thông tin các tài khoản để bạn truy cập các hệ thống nội bộ. Vui lòng bảo mật thông tin và đổi mật khẩu ngay lần đăng nhập đầu tiên.</p>{{#accounts}}<div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:14px 0;"><h3 style="color:#1e40af;margin:0 0 10px;">{{@index}}. {{he_thong}}</h3><table style="width:100%;background:#f5f7f9;border-radius:6px;border-collapse:collapse;"><tr><td style="padding:8px 12px;color:#666;width:110px;">Đường dẫn</td><td style="padding:8px 12px;font-family:monospace;"><a href="{{url}}" style="color:#1e40af;">{{url}}</a></td></tr><tr><td style="padding:8px 12px;color:#666;">Tài khoản</td><td style="padding:8px 12px;font-family:monospace;font-weight:bold;">{{tai_khoan}}</td></tr><tr><td style="padding:8px 12px;color:#666;">Mật khẩu</td><td style="padding:8px 12px;font-family:monospace;font-weight:bold;">{{mat_khau}}</td></tr></table></div>{{/accounts}}<p style="color:#b91c1c;font-size:13px;margin-top:16px;">⚠️ Vui lòng đổi mật khẩu ngay lần đăng nhập đầu tiên và không chia sẻ thông tin này cho người khác.</p><p style="margin-top:16px;">Trân trọng,<br>Phòng Nhân sự</p></div>',
  '[{"key":"name","label":"Tên nhân sự","type":"text","required":true},{"key":"accounts","label":"Danh sách tài khoản","type":"rows","required":true,"columns":[{"key":"he_thong","label":"Hệ thống","type":"text"},{"key":"tai_khoan","label":"Tài khoản","type":"text"},{"key":"mat_khau","label":"Mật khẩu","type":"text"},{"key":"url","label":"URL","type":"text"}],"defaultRows":[{"he_thong":"","tai_khoan":"","mat_khau":"","url":""}]}]'::jsonb,
  'ses', false
) ON CONFLICT (key) DO NOTHING;
