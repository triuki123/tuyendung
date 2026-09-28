-- Migration 241: Hồ sơ năng lực đa biến thể (Cá Nhân + theo Công Ty).
-- 1 user có thể có: 1 hồ sơ Cá Nhân + N hồ sơ Công Ty (mỗi công ty user được gán 1).
-- Không auto-tạo — super_admin bấm "Thêm biến thể" mới sinh row.
CREATE TABLE IF NOT EXISTS user_ecard_variants (
  id             TEXT PRIMARY KEY,
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope          TEXT NOT NULL CHECK (scope IN ('personal', 'company')),
  company_id     UUID REFERENCES companies(id) ON DELETE CASCADE,
  slug           TEXT UNIQUE NOT NULL,
  title          TEXT,                                 -- Tiêu đề hiển thị chip, VD "HSNL - Proship"
  qr_mode        TEXT NOT NULL DEFAULT 'profile',      -- 'contact' | 'profile'
  is_public      BOOLEAN NOT NULL DEFAULT true,
  headline       TEXT,
  bio            TEXT,
  theme          TEXT DEFAULT 'indigo',
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

-- Postgres coi NULL là distinct → dùng partial unique index để mỗi user chỉ 1 hồ sơ Cá Nhân,
-- và mỗi cặp (user, company) chỉ 1 hồ sơ Công Ty.
CREATE UNIQUE INDEX IF NOT EXISTS uq_uev_personal ON user_ecard_variants(user_id) WHERE scope = 'personal';
CREATE UNIQUE INDEX IF NOT EXISTS uq_uev_company  ON user_ecard_variants(user_id, company_id) WHERE scope = 'company';
CREATE INDEX IF NOT EXISTS idx_uev_slug    ON user_ecard_variants(slug);
CREATE INDEX IF NOT EXISTS idx_uev_user    ON user_ecard_variants(user_id);
CREATE INDEX IF NOT EXISTS idx_uev_company ON user_ecard_variants(company_id) WHERE company_id IS NOT NULL;

-- Backfill: chuyển mọi user_ecards đang có thành variant 'personal', giữ nguyên slug/dữ liệu.
INSERT INTO user_ecard_variants (
  id, user_id, scope, company_id, slug, title, qr_mode, is_public, headline, bio, theme, template,
  cover_url, cover_position, skills, experiences, education, certifications, projects,
  highlights, expertise, clients, testimonials, socials, visibility, section_order, view_count,
  created_at, updated_at
)
SELECT
  'uev_' || substr(md5(random()::text || clock_timestamp()::text || e.user_id::text), 1, 20),
  e.user_id, 'personal', NULL, e.slug, 'Cá Nhân', e.qr_mode, e.is_public, e.headline, e.bio, e.theme, e.template,
  e.cover_url, e.cover_position, e.skills, e.experiences, e.education, e.certifications, e.projects,
  e.highlights, e.expertise, e.clients, e.testimonials, e.socials, e.visibility, e.section_order, e.view_count,
  e.created_at, e.updated_at
FROM user_ecards e
WHERE NOT EXISTS (
  SELECT 1 FROM user_ecard_variants v WHERE v.user_id = e.user_id AND v.scope = 'personal'
);
