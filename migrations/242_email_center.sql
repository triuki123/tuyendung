-- Migration 242: Trung Tâm Email — templates, outbox (snapshot HTML đã gửi), đính kèm.
CREATE TABLE IF NOT EXISTS email_templates (
  id             TEXT PRIMARY KEY,
  category       TEXT NOT NULL CHECK (category IN ('payment', 'hr', 'account', 'internal', 'other')),
  key            TEXT UNIQUE NOT NULL,             -- định danh gọi từ code (VD: 'payment_woka', 'hr_interview')
  name           TEXT NOT NULL,
  description    TEXT,
  subject_tpl    TEXT NOT NULL,                    -- dùng {{var}}
  body_html_tpl  TEXT NOT NULL,
  schema         JSONB NOT NULL DEFAULT '[]'::jsonb,-- [{key,label,type:'text'|'number'|'date'|'textarea'|'money',required,default,help}]
  engine         TEXT NOT NULL DEFAULT 'ses' CHECK (engine IN ('ses', 'smtp')),
  is_active      BOOLEAN NOT NULL DEFAULT true,
  is_system      BOOLEAN NOT NULL DEFAULT false,   -- seed hệ thống (không cho xóa)
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_templates_category ON email_templates(category) WHERE is_active;

CREATE TABLE IF NOT EXISTS email_outbox (
  id             TEXT PRIMARY KEY,
  template_id    TEXT REFERENCES email_templates(id) ON DELETE SET NULL,
  category       TEXT,
  engine         TEXT NOT NULL,
  from_addr      TEXT,
  to_addr        TEXT NOT NULL,
  cc             TEXT,
  bcc            TEXT,
  subject        TEXT NOT NULL,
  body_html      TEXT NOT NULL,                    -- SNAPSHOT — sửa template sau không đụng
  variables      JSONB NOT NULL DEFAULT '{}'::jsonb,
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  error          TEXT,
  sent_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  sent_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_outbox_created ON email_outbox(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_outbox_sent_by ON email_outbox(sent_by);
CREATE INDEX IF NOT EXISTS idx_email_outbox_category ON email_outbox(category);

CREATE TABLE IF NOT EXISTS email_attachments (
  id             TEXT PRIMARY KEY,
  outbox_id      TEXT NOT NULL REFERENCES email_outbox(id) ON DELETE CASCADE,
  filename       TEXT NOT NULL,
  mime           TEXT NOT NULL DEFAULT 'application/octet-stream',
  size           INTEGER NOT NULL DEFAULT 0,
  content        BYTEA NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_email_attachments_outbox ON email_attachments(outbox_id);

-- Seed 4 template hệ thống. Không xóa khi chạy lại.
INSERT INTO email_templates (id, category, key, name, description, subject_tpl, body_html_tpl, schema, engine, is_system)
VALUES (
  'et_woka_payment',
  'payment',
  'payment_woka',
  'WOKA — Đề Nghị Thanh Toán',
  'Đề nghị thanh toán phí thuê hàng tháng (WOKA Việt Nam)',
  'Đề nghị thanh toán {{ky_thue}} - HĐ {{so_hd}}',
  '<!DOCTYPE html><html lang="vi"><body style="margin:0;padding:0;background:#eef0f3;font-family:Arial,Helvetica,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 12px;"><table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 14px rgba(20,40,60,.08);"><tr><td style="background:#14263a;padding:26px 34px;color:#fff;"><div style="font-size:19px;font-weight:bold;">CÔNG TY CỔ PHẦN WOKA VIỆT NAM</div><div style="color:#9fb3c8;font-size:11px;margin-top:4px;">MST: 0317389240</div><div style="border-top:2px solid #b78a3f;width:44px;margin:14px 0;"></div><div style="font-size:22px;font-weight:bold;letter-spacing:1px;">ĐỀ NGHỊ THANH TOÁN</div><div style="color:#9fb3c8;font-size:12px;margin-top:6px;">Số: {{so_vb}} • TP. Hồ Chí Minh, ngày {{ngay_lap}}</div></td></tr><tr><td style="padding:26px 34px;color:#2d3b48;font-size:14px;line-height:1.6;"><p>Kính gửi: <strong style="color:#14263a;">{{khach_hang}}</strong>,</p><p>Căn cứ Hợp đồng thuê số <strong>{{so_hd}}</strong>, Công ty Cổ phần WOKA Việt Nam chân thành cảm ơn Quý Công ty đã tin tưởng sử dụng dịch vụ.</p><p>Chúng tôi kính đề nghị Quý Công ty thanh toán chi phí thuê kỳ <strong>{{ky_thue}}</strong> với chi tiết như sau:</p></td></tr><tr><td style="padding:0 34px;"><table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><tr><td style="background:#14263a;color:#fff;font-size:11px;font-weight:bold;padding:10px;">NỘI DUNG</td><td style="background:#14263a;color:#fff;font-size:11px;font-weight:bold;padding:10px;text-align:center;">SL</td><td style="background:#14263a;color:#fff;font-size:11px;font-weight:bold;padding:10px;text-align:right;">ĐƠN GIÁ</td><td style="background:#14263a;color:#fff;font-size:11px;font-weight:bold;padding:10px;text-align:right;">THÀNH TIỀN</td></tr><tr><td style="border-bottom:1px solid #e6e9ee;padding:11px 10px;font-size:13px;">Tiền thuê <strong>{{ky_thue}}</strong></td><td style="border-bottom:1px solid #e6e9ee;padding:11px 10px;font-size:13px;text-align:center;">01</td><td style="border-bottom:1px solid #e6e9ee;padding:11px 10px;font-size:13px;text-align:right;">{{tien_thue}}</td><td style="border-bottom:1px solid #e6e9ee;padding:11px 10px;font-size:13px;text-align:right;font-weight:bold;">{{tien_thue}}</td></tr><tr><td style="border-bottom:1px solid #e6e9ee;background:#f7f8fa;padding:11px 10px;font-size:13px;">Phí quản lý</td><td style="border-bottom:1px solid #e6e9ee;background:#f7f8fa;padding:11px 10px;font-size:13px;text-align:center;">01</td><td style="border-bottom:1px solid #e6e9ee;background:#f7f8fa;padding:11px 10px;font-size:13px;text-align:right;">{{phi_ql}}</td><td style="border-bottom:1px solid #e6e9ee;background:#f7f8fa;padding:11px 10px;font-size:13px;text-align:right;font-weight:bold;">{{phi_ql}}</td></tr><tr><td style="border-bottom:1px solid #e6e9ee;padding:11px 10px;font-size:13px;">Tiền gửi xe</td><td style="border-bottom:1px solid #e6e9ee;padding:11px 10px;font-size:13px;text-align:center;">{{sl_xe}}</td><td style="border-bottom:1px solid #e6e9ee;padding:11px 10px;font-size:13px;text-align:right;">{{don_gia_xe}}</td><td style="border-bottom:1px solid #e6e9ee;padding:11px 10px;font-size:13px;text-align:right;font-weight:bold;">{{tien_xe}}</td></tr><tr><td style="border-bottom:1px solid #e6e9ee;background:#f7f8fa;padding:11px 10px;font-size:13px;">Tiền điện <span style="color:#7a8794;font-size:11px;">({{chi_so_dien}})</span></td><td style="border-bottom:1px solid #e6e9ee;background:#f7f8fa;padding:11px 10px;font-size:13px;text-align:center;">{{kwh}}</td><td style="border-bottom:1px solid #e6e9ee;background:#f7f8fa;padding:11px 10px;font-size:13px;text-align:right;">{{don_gia_dien}}</td><td style="border-bottom:1px solid #e6e9ee;background:#f7f8fa;padding:11px 10px;font-size:13px;text-align:right;font-weight:bold;">{{tien_dien}}</td></tr><tr><td style="border-bottom:1px solid #e6e9ee;padding:11px 10px;font-size:13px;">Tiền nước</td><td style="border-bottom:1px solid #e6e9ee;padding:11px 10px;font-size:13px;text-align:center;">{{sl_nuoc}}</td><td style="border-bottom:1px solid #e6e9ee;padding:11px 10px;font-size:13px;text-align:right;">{{don_gia_nuoc}}</td><td style="border-bottom:1px solid #e6e9ee;padding:11px 10px;font-size:13px;text-align:right;font-weight:bold;">{{tien_nuoc}}</td></tr><tr><td colspan="3" style="padding:10px;text-align:right;font-size:13px;">Thành tiền</td><td style="padding:10px;text-align:right;font-size:13px;font-weight:bold;">{{thanh_tien}}</td></tr><tr><td colspan="3" style="padding:6px 10px;text-align:right;font-size:13px;">Thuế GTGT 10%</td><td style="padding:6px 10px;text-align:right;font-size:13px;font-weight:bold;">{{vat}}</td></tr><tr><td colspan="3" style="background:#14263a;padding:14px 10px;text-align:right;color:#fff;font-size:14px;font-weight:bold;">TỔNG CỘNG</td><td style="background:#14263a;padding:14px 10px;text-align:right;color:#e9c986;font-size:17px;font-weight:bold;">{{tong_cong}}</td></tr></table></td></tr><tr><td style="padding:8px 34px 4px;font-size:12.5px;font-style:italic;color:#5a6874;">Bằng chữ: {{bang_chu}}.</td></tr><tr><td style="padding:18px 34px 4px;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#fbf3e6;border-left:4px solid #b78a3f;border-radius:4px;"><tr><td style="padding:12px 16px;color:#7a5a1e;font-size:13px;">⏱ Thời hạn thanh toán: <strong>chậm nhất ngày {{han_tt}}</strong></td></tr></table></td></tr><tr><td style="padding:14px 34px;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7f9;border:1px solid #e2e7ec;border-radius:6px;"><tr><td style="padding:16px 18px;font-size:13px;color:#2d3b48;"><p style="margin:0 0 10px;color:#14263a;font-size:12px;font-weight:bold;text-transform:uppercase;">Thông tin chuyển khoản</p><table width="100%"><tr><td style="padding:3px 0;width:130px;color:#6b7883;">Chủ tài khoản</td><td style="padding:3px 0;font-weight:bold;">CÔNG TY CỔ PHẦN WOKA VIỆT NAM</td></tr><tr><td style="padding:3px 0;color:#6b7883;">Số tài khoản</td><td style="padding:3px 0;font-weight:bold;">1036907401</td></tr><tr><td style="padding:3px 0;color:#6b7883;">Ngân hàng</td><td style="padding:3px 0;">Vietcombank (TMCP Ngoại Thương Việt Nam) - CN Cộng Hòa</td></tr><tr><td style="padding:3px 0;color:#6b7883;">Nội dung CK</td><td style="padding:3px 0;">{{noi_dung_ck}}</td></tr></table></td></tr></table></td></tr><tr><td style="padding:20px 34px 6px;color:#2d3b48;font-size:13.5px;">Trân trọng cảm ơn sự hợp tác của Quý Công ty.</td></tr><tr><td style="background:#14263a;padding:20px 34px;color:#fff;font-size:11px;line-height:1.7;"><div style="font-size:13px;font-weight:bold;margin-bottom:4px;">CÔNG TY CỔ PHẦN WOKA VIỆT NAM</div>MST: 0317389240<br>Địa chỉ: (cập nhật địa chỉ)<br>☎ (số điện thoại) • ✉ (email)</td></tr></table></td></tr></table></body></html>',
  '[{"key":"khach_hang","label":"Khách hàng","type":"text","required":true},{"key":"so_hd","label":"Số HĐ","type":"text","required":true,"default":"1203/2025/HDTN/161.1CH-WK"},{"key":"so_vb","label":"Số văn bản","type":"text","required":true},{"key":"ngay_lap","label":"Ngày lập","type":"date","required":true},{"key":"ky_thue","label":"Kỳ thuê","type":"text","required":true,"default":"Tháng 06/2026"},{"key":"tien_thue","label":"Tiền thuê","type":"money","required":true,"default":"23,000,000"},{"key":"phi_ql","label":"Phí quản lý","type":"money","default":"500,000"},{"key":"sl_xe","label":"SL xe","type":"text","default":"11"},{"key":"don_gia_xe","label":"Đơn giá xe","type":"money","default":"150,000"},{"key":"tien_xe","label":"Tiền xe","type":"money","default":"1,650,000"},{"key":"chi_so_dien","label":"Chỉ số điện (mới-cũ)","type":"text"},{"key":"kwh","label":"kWh","type":"text"},{"key":"don_gia_dien","label":"Đơn giá điện","type":"money","default":"4,000"},{"key":"tien_dien","label":"Tiền điện","type":"money"},{"key":"sl_nuoc","label":"SL nước","type":"text"},{"key":"don_gia_nuoc","label":"Đơn giá nước","type":"money","default":"25,000"},{"key":"tien_nuoc","label":"Tiền nước","type":"money"},{"key":"thanh_tien","label":"Thành tiền","type":"money","required":true},{"key":"vat","label":"VAT 10%","type":"money","required":true},{"key":"tong_cong","label":"Tổng cộng","type":"money","required":true},{"key":"bang_chu","label":"Bằng chữ","type":"textarea","required":true},{"key":"han_tt","label":"Hạn thanh toán","type":"date","required":true},{"key":"noi_dung_ck","label":"Nội dung CK","type":"text","required":true}]'::jsonb,
  'ses', true
) ON CONFLICT (key) DO NOTHING;

INSERT INTO email_templates (id, category, key, name, description, subject_tpl, body_html_tpl, schema, engine, is_system)
VALUES (
  'et_hr_onboarding',
  'hr',
  'hr_onboarding',
  'HR — Chào mừng nhân sự mới',
  'Email chào mừng nhân sự onboarding',
  'Chào mừng {{name}} gia nhập FADO GROUP',
  '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111;"><h2 style="color:#1e40af;">Chào mừng {{name}}!</h2><p>Chúc mừng bạn chính thức trở thành thành viên của <strong>{{cong_ty}}</strong> tại vị trí <strong>{{vi_tri}}</strong>.</p><p><strong>Ngày bắt đầu:</strong> {{ngay_bat_dau}}<br><strong>Quản lý trực tiếp:</strong> {{quan_ly}}<br><strong>Địa điểm làm việc:</strong> {{dia_diem}}</p><p>{{loi_nhan}}</p><p>Trân trọng,<br>Phòng Nhân Sự</p></div>',
  '[{"key":"name","label":"Tên nhân sự","type":"text","required":true},{"key":"cong_ty","label":"Công ty","type":"text","required":true},{"key":"vi_tri","label":"Vị trí","type":"text","required":true},{"key":"ngay_bat_dau","label":"Ngày bắt đầu","type":"date","required":true},{"key":"quan_ly","label":"Quản lý trực tiếp","type":"text"},{"key":"dia_diem","label":"Địa điểm","type":"text","default":"Văn phòng công ty"},{"key":"loi_nhan","label":"Lời nhắn thêm","type":"textarea"}]'::jsonb,
  'ses', true
) ON CONFLICT (key) DO NOTHING;

INSERT INTO email_templates (id, category, key, name, description, subject_tpl, body_html_tpl, schema, engine, is_system)
VALUES (
  'et_hr_interview',
  'hr',
  'hr_interview',
  'HR — Mời phỏng vấn',
  'Email mời ứng viên phỏng vấn',
  'Thư mời phỏng vấn - {{vi_tri}}',
  '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111;"><h2 style="color:#1e40af;">Kính gửi {{name}},</h2><p>Cảm ơn bạn đã ứng tuyển vào vị trí <strong>{{vi_tri}}</strong> tại {{cong_ty}}.</p><p>Chúng tôi xin trân trọng mời bạn tham dự buổi phỏng vấn:</p><table style="border-collapse:collapse;margin:12px 0;"><tr><td style="padding:4px 12px 4px 0;color:#666;">Thời gian:</td><td style="padding:4px 0;font-weight:bold;">{{thoi_gian}}</td></tr><tr><td style="padding:4px 12px 4px 0;color:#666;">Địa điểm:</td><td style="padding:4px 0;">{{dia_diem}}</td></tr><tr><td style="padding:4px 12px 4px 0;color:#666;">Người phỏng vấn:</td><td style="padding:4px 0;">{{nguoi_pv}}</td></tr></table><p>Vui lòng phản hồi email này để xác nhận. Nếu có bất kỳ thay đổi nào, hãy liên hệ với chúng tôi trước 24h.</p><p>Trân trọng,<br>Phòng Nhân Sự</p></div>',
  '[{"key":"name","label":"Tên ứng viên","type":"text","required":true},{"key":"vi_tri","label":"Vị trí","type":"text","required":true},{"key":"cong_ty","label":"Công ty","type":"text","required":true,"default":"FADO GROUP"},{"key":"thoi_gian","label":"Thời gian","type":"text","required":true,"help":"VD: 09:00 - 10:00, Thứ Ba 10/06/2026"},{"key":"dia_diem","label":"Địa điểm","type":"textarea","required":true},{"key":"nguoi_pv","label":"Người phỏng vấn","type":"text"}]'::jsonb,
  'ses', true
) ON CONFLICT (key) DO NOTHING;

INSERT INTO email_templates (id, category, key, name, description, subject_tpl, body_html_tpl, schema, engine, is_system)
VALUES (
  'et_account_credentials',
  'account',
  'account_credentials',
  'Tài Khoản — Cấp tài khoản nội bộ',
  'Email gửi thông tin tài khoản nội bộ cho nhân sự',
  'Thông tin tài khoản {{he_thong}} của bạn',
  '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111;"><h2 style="color:#1e40af;">Xin chào {{name}},</h2><p>Tài khoản <strong>{{he_thong}}</strong> của bạn đã được cấp:</p><table style="background:#f5f7f9;border-radius:6px;padding:12px;margin:12px 0;width:100%;"><tr><td style="padding:6px 12px;color:#666;">Đăng nhập:</td><td style="padding:6px 0;font-family:monospace;font-weight:bold;">{{tai_khoan}}</td></tr><tr><td style="padding:6px 12px;color:#666;">Mật khẩu:</td><td style="padding:6px 0;font-family:monospace;font-weight:bold;">{{mat_khau}}</td></tr><tr><td style="padding:6px 12px;color:#666;">URL:</td><td style="padding:6px 0;"><a href="{{url}}">{{url}}</a></td></tr></table><p style="color:#b91c1c;font-size:13px;">⚠️ Vui lòng đổi mật khẩu ngay lần đăng nhập đầu tiên.</p><p>Trân trọng,<br>Bộ phận IT</p></div>',
  '[{"key":"name","label":"Tên nhân sự","type":"text","required":true},{"key":"he_thong","label":"Hệ thống","type":"text","required":true,"default":"FADO AssetFlow"},{"key":"tai_khoan","label":"Tài khoản","type":"text","required":true},{"key":"mat_khau","label":"Mật khẩu","type":"text","required":true},{"key":"url","label":"URL","type":"text","required":true,"default":"https://assetflow.fadoai.com"}]'::jsonb,
  'ses', true
) ON CONFLICT (key) DO NOTHING;

INSERT INTO email_templates (id, category, key, name, description, subject_tpl, body_html_tpl, schema, engine, is_system)
VALUES (
  'et_internal_birthday',
  'internal',
  'internal_birthday',
  'Nội Bộ — Chúc mừng sinh nhật',
  'Email chúc mừng sinh nhật nhân sự',
  'Chúc mừng sinh nhật {{name}}!',
  '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;text-align:center;color:#111;"><div style="font-size:60px;margin-bottom:12px;">🎉</div><h1 style="color:#db2777;">Chúc mừng sinh nhật {{name}}!</h1><p style="font-size:16px;line-height:1.6;">{{loi_chuc}}</p><p style="margin-top:20px;color:#666;">Toàn thể FADO GROUP</p></div>',
  '[{"key":"name","label":"Tên","type":"text","required":true},{"key":"loi_chuc","label":"Lời chúc","type":"textarea","required":true,"default":"Thay mặt toàn thể FADO GROUP, xin gửi tới bạn lời chúc sinh nhật ấm áp và trọn vẹn nhất. Chúc bạn một năm mới nhiều sức khỏe, hạnh phúc và thành công!"}]'::jsonb,
  'ses', true
) ON CONFLICT (key) DO NOTHING;
