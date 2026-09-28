-- Migration 098: Hệ thống Onboarding nhân sự mới
-- Module "Biểu Mẫu" (cấu hình landing page) + "Nguồn Nhân Lực" (Onboarding, Kho CV, Kho JD)
-- Luồng: HR mời (email link) → nhân sự điền form public → Tuyển dụng chuẩn hóa
--        → Xác nhận → Gửi QTV → QTV duyệt (tạo user + hồ sơ draft thành chính thức)

-- ── 1. Cấu hình field cho landing page (module Biểu Mẫu) ──────────────────
CREATE TABLE IF NOT EXISTS onboarding_form_fields (
  id          TEXT PRIMARY KEY,
  field_key   TEXT NOT NULL UNIQUE,
  label       TEXT NOT NULL,
  field_type  TEXT NOT NULL DEFAULT 'text',     -- text|email|date|select|number|textarea|tel|org|file|group
  section     TEXT NOT NULL DEFAULT 'personal', -- personal|work|identity|bank|other|emergency|attachments
  required    BOOLEAN NOT NULL DEFAULT false,
  enabled     BOOLEAN NOT NULL DEFAULT true,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  help_text   TEXT,
  options     JSONB,                            -- cho select: ["A","B"] hoặc cấu hình phụ
  is_system   BOOLEAN NOT NULL DEFAULT false,   -- field hệ thống không cho xóa (vẫn cho tắt)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2. Lời mời + bài nộp onboarding ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS onboarding_submissions (
  id               TEXT PRIMARY KEY,
  token            TEXT NOT NULL UNIQUE,         -- link public: /onboarding/{token}
  candidate_name   TEXT NOT NULL,
  candidate_email  TEXT NOT NULL,                -- email cá nhân nhận link
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','submitted','confirmed','sent_to_admin','approved','rejected')),
  data             JSONB NOT NULL DEFAULT '{}',  -- toàn bộ dữ liệu form (key = field_key)
  invited_by       TEXT,
  invited_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  email_sent       BOOLEAN NOT NULL DEFAULT false,
  email_error      TEXT,
  submitted_at     TIMESTAMPTZ,
  confirmed_by     TEXT,
  confirmed_at     TIMESTAMPTZ,
  sent_to_admin_at TIMESTAMPTZ,
  approved_by      TEXT,
  approved_at      TIMESTAMPTZ,
  rejected_by      TEXT,
  rejected_at      TIMESTAMPTZ,
  reject_reason    TEXT,
  user_id          TEXT,                         -- id user được tạo sau khi duyệt
  expires_at       TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '14 days'),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_submissions_status ON onboarding_submissions(status);
CREATE INDEX IF NOT EXISTS idx_onboarding_submissions_token  ON onboarding_submissions(token);

-- ── 3. Hồ sơ nháp: hr_documents thêm cờ is_draft ──────────────────────────
-- Hồ sơ upload từ landing page: employee_id = id submission, is_draft = true.
-- Khi QTV duyệt tạo user: employee_id = user_id mới, is_draft = false (chính thức).
ALTER TABLE hr_documents
  ADD COLUMN IF NOT EXISTS is_draft BOOLEAN NOT NULL DEFAULT false;

-- ── 4. Kho CV (module Nguồn Nhân Lực) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS hr_cv_pool (
  id                TEXT PRIMARY KEY,
  candidate_name    TEXT NOT NULL,
  candidate_email   TEXT,
  candidate_phone   TEXT,
  position_applied  TEXT,
  source            TEXT,                        -- nguồn CV: website, giới thiệu, headhunt...
  status            TEXT NOT NULL DEFAULT 'new'
                    CHECK (status IN ('new','screening','interviewed','offered','hired','rejected','pool')),
  note              TEXT,
  file_name         TEXT,
  mime_type         TEXT,
  size_bytes        INTEGER,
  content           BYTEA,
  uploaded_by       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_hr_cv_pool_status ON hr_cv_pool(status) WHERE deleted_at IS NULL;

-- ── 5. Kho JD (module Nguồn Nhân Lực) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS hr_jd_pool (
  id               TEXT PRIMARY KEY,
  title            TEXT NOT NULL,
  department_name  TEXT,
  description      TEXT,
  status           TEXT NOT NULL DEFAULT 'active'
                   CHECK (status IN ('draft','active','archived')),
  file_name        TEXT,
  mime_type        TEXT,
  size_bytes       INTEGER,
  content          BYTEA,
  created_by       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ
);

-- ── 5b. TỰ VÁ DB cũ: bảng onboarding_form_fields có thể đã tồn tại TRƯỚC migration
--    này (vd từ bản dump / seed cũ) mà THIẾU unique constraint trên field_key.
--    Khi đó INSERT ... ON CONFLICT (field_key) bên dưới sẽ lỗi
--    "no unique or exclusion constraint matching" → chặn cả runner ở 098.
--    Khử bản ghi field_key trùng (giữ 1) rồi thêm constraint nếu chưa có. Idempotent.
DO $$
BEGIN
  -- khử trùng field_key (giữ dòng có ctid nhỏ nhất)
  DELETE FROM onboarding_form_fields a
    USING onboarding_form_fields b
    WHERE a.field_key = b.field_key AND a.ctid > b.ctid;
  -- thêm unique constraint nếu chưa có (bảng tạo mới đã có sẵn → bỏ qua)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'onboarding_form_fields'::regclass AND contype = 'u'
  ) THEN
    ALTER TABLE onboarding_form_fields
      ADD CONSTRAINT onboarding_form_fields_field_key_key UNIQUE (field_key);
  END IF;
END $$;

-- ── 6. Seed field mặc định cho landing page ───────────────────────────────
INSERT INTO onboarding_form_fields (id, field_key, label, field_type, section, required, enabled, sort_order, help_text, options, is_system) VALUES
  -- Thông tin cá nhân
  ('obf_full_name',        'full_name',        'Họ và Tên',                'text',     'personal', true,  true, 10,  NULL, NULL, true),
  ('obf_personal_email',   'personal_email',   'Email Cá Nhân',            'email',    'personal', true,  true, 20,  NULL, NULL, true),
  ('obf_date_of_birth',    'date_of_birth',    'Ngày Tháng Năm Sinh',      'date',     'personal', true,  true, 30,  NULL, NULL, true),
  ('obf_gender',           'gender',           'Giới Tính',                'select',   'personal', true,  true, 40,  NULL, '["Nam","Nữ","Khác"]', true),
  ('obf_phone',            'phone',            'Số Điện Thoại Di Động',    'tel',      'personal', true,  true, 50,  NULL, NULL, true),
  ('obf_nationality',      'nationality',      'Quốc Tịch',                'text',     'personal', false, true, 60,  NULL, NULL, true),
  ('obf_ethnicity',        'ethnicity',        'Dân Tộc',                  'text',     'personal', false, true, 70,  NULL, NULL, true),
  ('obf_religion',         'religion',         'Tôn Giáo',                 'text',     'personal', false, true, 80,  NULL, NULL, true),
  ('obf_marital_status',   'marital_status',   'Tình Trạng Hôn Nhân',      'select',   'personal', false, true, 90,  NULL, '["Độc thân","Đã kết hôn","Ly hôn","Khác"]', true),
  ('obf_children_count',   'children_count',   'Số Con (nếu có)',          'number',   'personal', false, true, 100, NULL, NULL, true),
  ('obf_education_level',  'education_level',  'Trình Độ Học Vấn',         'select',   'personal', false, true, 110, NULL, '["Trung học phổ thông","Trung cấp","Cao đẳng","Đại học","Thạc sĩ","Tiến sĩ","Khác"]', true),
  ('obf_major',            'major',            'Chuyên Ngành',             'text',     'personal', false, true, 120, NULL, NULL, true),
  ('obf_telegram_id',      'telegram_id',      'ID Telegram',              'text',     'personal', false, true, 130, 'Mở Telegram, tìm bot @userinfobot, bấm Start — bot sẽ trả về số ID của bạn (ví dụ: 5195958362)', NULL, true),
  -- Công việc
  ('obf_company',          'company_id',       'Công Ty',                  'org',      'work', true,  true, 10, NULL, NULL, true),
  ('obf_department',       'department_id',    'Phòng Ban',                'org',      'work', true,  true, 20, NULL, NULL, true),
  ('obf_sub_department',   'sub_department_id','Bộ Phận',                  'org',      'work', false, true, 30, NULL, NULL, true),
  ('obf_position',         'position_id',      'Chức Vụ',                  'org',      'work', true,  true, 40, NULL, NULL, true),
  ('obf_job_title',        'job_title',        'Chức Danh',                'text',     'work', false, true, 50, 'Tự tính: Chức Vụ + Bộ Phận (nếu không có Bộ Phận thì dùng Phòng Ban)', NULL, true),
  ('obf_hire_date',        'hire_date',        'Ngày Vào Làm',             'date',     'work', true,  true, 60, NULL, NULL, true),
  ('obf_working_email',    'working_email',    'Working Email',            'email',    'work', false, true, 70, 'Để trống nếu chưa được cấp — Quản trị viên sẽ cấp khi duyệt', NULL, true),
  -- Giấy tờ
  ('obf_national_id',      'national_id',      'Số Căn Cước Công Dân',     'text',     'identity', true,  true, 10, NULL, NULL, true),
  ('obf_nid_issue_date',   'national_id_issue_date',  'Ngày Cấp',          'date',     'identity', true,  true, 20, NULL, NULL, true),
  ('obf_nid_issue_place',  'national_id_issue_place', 'Nơi Cấp',           'text',     'identity', true,  true, 30, NULL, NULL, true),
  ('obf_home_address',     'home_address',     'Địa Chỉ Thường Trú',       'textarea', 'identity', true,  true, 40, NULL, NULL, true),
  ('obf_temp_address',     'temporary_address','Địa Chỉ Tạm Trú',          'textarea', 'identity', false, true, 50, NULL, NULL, true),
  -- Ngân hàng
  ('obf_bank_account_no',  'bank_account_no',  'Số Tài Khoản',             'text', 'bank', false, true, 10, NULL, NULL, true),
  ('obf_bank_name',        'bank_name',        'Ngân Hàng',                'text', 'bank', false, true, 20, NULL, NULL, true),
  ('obf_bank_account_name','bank_account_name','Chủ Tài Khoản',            'text', 'bank', false, true, 30, NULL, NULL, true),
  -- Khác
  ('obf_vehicle_type',     'vehicle_type',     'Phương Tiện Di Chuyển',    'select', 'other', false, true, 10, NULL, '["Không có","Xe máy","Ô tô","Xe đạp","Khác"]', true),
  ('obf_vehicle_plate',    'vehicle_plate',    'Biển Số Xe',               'text',   'other', false, true, 20, 'Chỉ hiện khi có phương tiện', NULL, true),
  ('obf_vehicle_model',    'vehicle_model',    'Hiệu Xe',                  'text',   'other', false, true, 30, 'Chỉ hiện khi có phương tiện', NULL, true),
  -- Người thân liên hệ
  ('obf_ec_name',          'emergency_contact_name',         'Tên Người Thân',   'text',     'emergency', true,  true, 10, NULL, NULL, true),
  ('obf_ec_relationship',  'emergency_contact_relationship', 'Mối Quan Hệ',      'text',     'emergency', true,  true, 20, NULL, NULL, true),
  ('obf_ec_phone',         'emergency_contact_phone',        'Số Điện Thoại',    'tel',      'emergency', true,  true, 30, NULL, NULL, true),
  ('obf_ec_address',       'emergency_contact_address',      'Địa Chỉ',          'textarea', 'emergency', false, true, 40, NULL, NULL, true),
  -- Đính kèm
  ('obf_attachments',      'attachments',      'Đính Kèm Hồ Sơ',           'file', 'attachments', false, true, 10, 'CCCD, bằng cấp, sơ yếu lý lịch... (tối đa 10MB/tệp). Hồ sơ sẽ ở trạng thái nháp cho đến khi được duyệt.', NULL, true)
ON CONFLICT (field_key) DO NOTHING;

SELECT 'Migration 098: onboarding system created' AS migration_status;
