-- Migration 253: Hồ Sơ Năng Lực DOANH NGHIỆP — mỗi công ty NHIỀU biến thể (vd Tiếng Anh/Trung), dùng chung.
-- Tách khỏi user_ecard_variants (vốn gắn user_id). Nhân viên trỏ QR tới biến thể của công ty.
CREATE TABLE IF NOT EXISTS company_ecards (
  id             TEXT PRIMARY KEY,
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  slug           TEXT UNIQUE NOT NULL,
  title          TEXT,
  is_public      BOOLEAN NOT NULL DEFAULT true,
  -- Ghi đè hiển thị (null = lấy từ bảng companies)
  display_name   TEXT,
  logo_url       TEXT,
  -- Nội dung hồ sơ (giống user_ecard_variants)
  headline       TEXT,
  bio            TEXT,
  theme          TEXT NOT NULL DEFAULT 'indigo',
  template       TEXT NOT NULL DEFAULT 'aurora',
  cover_url      TEXT,
  cover_position INTEGER NOT NULL DEFAULT 50,
  skills         JSONB NOT NULL DEFAULT '[]'::jsonb,
  experiences    JSONB NOT NULL DEFAULT '[]'::jsonb,
  education      JSONB NOT NULL DEFAULT '[]'::jsonb,
  certifications JSONB NOT NULL DEFAULT '[]'::jsonb,
  projects       JSONB NOT NULL DEFAULT '[]'::jsonb,
  highlights     JSONB NOT NULL DEFAULT '[]'::jsonb,
  expertise      JSONB NOT NULL DEFAULT '[]'::jsonb,
  clients        JSONB NOT NULL DEFAULT '[]'::jsonb,
  testimonials   JSONB NOT NULL DEFAULT '[]'::jsonb,
  socials        JSONB NOT NULL DEFAULT '{}'::jsonb,
  visibility     JSONB NOT NULL DEFAULT '{}'::jsonb,
  section_order  JSONB NOT NULL DEFAULT '[]'::jsonb,
  view_count     INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_company_ecards_slug ON company_ecards(slug);
CREATE INDEX IF NOT EXISTS idx_company_ecards_company ON company_ecards(company_id);

-- Nhân viên trỏ QR danh bạ sang hồ sơ năng lực công ty (true = QR mở landing công ty).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS ecard_use_company BOOLEAN NOT NULL DEFAULT false;
