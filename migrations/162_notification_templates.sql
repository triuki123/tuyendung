-- Migration 162: mẫu nội dung thông báo chỉnh được qua UI.
-- Mỗi template_key (vd 'contract_renewal:before') ghi đè DEFAULT trong code.
-- Seed RỖNG → service trả DEFAULT (chuỗi hardcode cũ) → hành vi không đổi.
CREATE TABLE IF NOT EXISTS notification_templates (
  template_key TEXT PRIMARY KEY,
  title        TEXT,
  message      TEXT,
  icon         TEXT,
  updated_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
