-- Migration 219: Log email tuyển dụng đã gửi (qua SMTP hộp thư Tuyển dụng).
-- Cấu hình SMTP lưu ở system_settings (key 'email.smtp') — sửa qua UI, không cần migration.
CREATE TABLE IF NOT EXISTS hr_recruitment_emails (
  id             TEXT PRIMARY KEY,
  cv_id          TEXT,
  application_id TEXT,
  requisition_id TEXT,
  to_email       TEXT NOT NULL,
  subject        TEXT NOT NULL,
  body_html      TEXT NOT NULL,
  template_id    TEXT,
  status         TEXT NOT NULL DEFAULT 'sent',   -- sent | failed
  error          TEXT,
  sent_by        TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_recruitment_emails_cv  ON hr_recruitment_emails(cv_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recruitment_emails_app ON hr_recruitment_emails(application_id, created_at DESC);
