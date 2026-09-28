-- Migration 100: Kho Biểu Mẫu (kiểu Google Forms)
-- Mỗi biểu mẫu có link public riêng (token) — ai có link đều điền được, không cần tài khoản.
-- form_type 'onboarding': submission đi vào luồng Nguồn Nhân Lực (chuẩn hóa → duyệt tạo user).
-- form_type 'general': biểu mẫu thu thập thông tin thường, xem kết quả trong kho.

CREATE TABLE IF NOT EXISTS form_templates (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT,
  form_type   TEXT NOT NULL DEFAULT 'general' CHECK (form_type IN ('onboarding', 'general')),
  token       TEXT NOT NULL UNIQUE,          -- link public: /forms/{token}
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'closed')),
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

-- Field thuộc về một biểu mẫu cụ thể
ALTER TABLE onboarding_form_fields
  ADD COLUMN IF NOT EXISTS form_id TEXT;

-- Submission thuộc về một biểu mẫu cụ thể
ALTER TABLE onboarding_submissions
  ADD COLUMN IF NOT EXISTS form_id TEXT;

-- Biểu mẫu Onboarding mặc định (token cố định, có thể tạo thêm biểu mẫu khác)
INSERT INTO form_templates (id, title, description, form_type, token, status)
VALUES (
  'form_onboarding_default',
  'Biểu Mẫu Thông Tin Nhận Việc',
  'Dành cho nhân sự mới điền thông tin khi nhận việc tại FADO Group',
  'onboarding',
  'nhanvien-moi-fado-7f3a9c2e51b8d4a6e0f2c81b',
  'active'
)
ON CONFLICT (id) DO NOTHING;

-- Gán 36 field seed + submission cũ (nếu có) vào biểu mẫu mặc định
UPDATE onboarding_form_fields  SET form_id = 'form_onboarding_default' WHERE form_id IS NULL;
UPDATE onboarding_submissions  SET form_id = 'form_onboarding_default' WHERE form_id IS NULL;

-- field_key chỉ cần unique TRONG một biểu mẫu (nhiều form có thể cùng key 'full_name')
ALTER TABLE onboarding_form_fields DROP CONSTRAINT IF EXISTS onboarding_form_fields_field_key_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_form_fields_form_key ON onboarding_form_fields(form_id, field_key);

CREATE INDEX IF NOT EXISTS idx_onboarding_form_fields_form ON onboarding_form_fields(form_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_submissions_form ON onboarding_submissions(form_id);

SELECT 'Migration 100: form_templates created' AS migration_status;
