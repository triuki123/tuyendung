-- Migration 218: Mẫu email tuyển dụng (quản lý qua UI, gửi qua SMTP hộp thư Tuyển dụng).
-- Biến trong subject/body dạng {{ten_bien}} — render từ ngữ cảnh ứng viên/lịch phỏng vấn khi gửi.
CREATE TABLE IF NOT EXISTS hr_email_templates (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  category   TEXT NOT NULL DEFAULT 'other',   -- interview_invite | rejection | offer | other
  subject    TEXT NOT NULL,
  body_html  TEXT NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_templates_active ON hr_email_templates(is_active, category);

-- Seed vài mẫu chuẩn (idempotent theo id cố định).
INSERT INTO hr_email_templates (id, name, category, subject, body_html) VALUES
(
  'tpl_interview_invite',
  'Thư mời phỏng vấn',
  'interview_invite',
  'Thư mời phỏng vấn vị trí {{vi_tri}} - {{cong_ty}}',
  $html$<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#222;font-size:14px;line-height:1.6">
<p>Kính gửi <b>{{ung_vien}}</b>,</p>
<p>Cảm ơn bạn đã quan tâm đến vị trí <b>{{vi_tri}}</b> tại {{cong_ty}}. Chúng tôi trân trọng mời bạn tham dự buổi phỏng vấn:</p>
<table cellpadding="6" style="border-collapse:collapse;margin:12px 0">
<tr><td style="color:#666">🕒 Thời gian</td><td><b>{{thoi_gian}}</b></td></tr>
<tr><td style="color:#666">📍 Hình thức</td><td>{{hinh_thuc}}</td></tr>
<tr><td style="color:#666">🏢 Địa điểm / Link</td><td>{{dia_diem}}</td></tr>
</table>
<p>Vui lòng phản hồi email này để xác nhận. Rất mong được gặp bạn!</p>
<p>Trân trọng,<br/><b>{{nguoi_gui}}</b><br/>Bộ phận Tuyển dụng - {{cong_ty}}</p>
</div>$html$
),
(
  'tpl_rejection',
  'Thư cảm ơn / từ chối',
  'rejection',
  'Kết quả ứng tuyển vị trí {{vi_tri}} - {{cong_ty}}',
  $html$<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#222;font-size:14px;line-height:1.6">
<p>Kính gửi <b>{{ung_vien}}</b>,</p>
<p>Cảm ơn bạn đã dành thời gian ứng tuyển vị trí <b>{{vi_tri}}</b> tại {{cong_ty}}.</p>
<p>Sau khi cân nhắc kỹ lưỡng, rất tiếc ở thời điểm hiện tại chúng tôi chưa thể tiếp tục cùng bạn cho vị trí này. Chúng tôi sẽ lưu hồ sơ và liên hệ khi có cơ hội phù hợp hơn.</p>
<p>Chúc bạn nhiều sức khỏe và thành công.</p>
<p>Trân trọng,<br/><b>{{nguoi_gui}}</b><br/>Bộ phận Tuyển dụng - {{cong_ty}}</p>
</div>$html$
),
(
  'tpl_offer',
  'Thư mời nhận việc',
  'offer',
  'Thư mời nhận việc vị trí {{vi_tri}} - {{cong_ty}}',
  $html$<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#222;font-size:14px;line-height:1.6">
<p>Kính gửi <b>{{ung_vien}}</b>,</p>
<p>Chúc mừng! Chúng tôi vui mừng gửi tới bạn lời mời nhận việc vị trí <b>{{vi_tri}}</b> tại {{cong_ty}}.</p>
<p>Vui lòng phản hồi email này để chúng tôi trao đổi chi tiết về thời gian nhận việc và các bước tiếp theo.</p>
<p>Rất mong được chào đón bạn gia nhập đội ngũ!</p>
<p>Trân trọng,<br/><b>{{nguoi_gui}}</b><br/>Bộ phận Tuyển dụng - {{cong_ty}}</p>
</div>$html$
)
ON CONFLICT (id) DO NOTHING;
