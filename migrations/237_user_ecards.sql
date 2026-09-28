-- Migration 237: Hồ sơ năng lực public + e-card (1 dòng / user).
-- Dữ liệu năng lực dạng JSONB để thêm mục không cần đổi schema.
CREATE TABLE IF NOT EXISTS user_ecards (
  user_id        UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  slug           TEXT UNIQUE NOT NULL,                 -- base62 ~10 ký tự (khó đoán)
  qr_mode        TEXT NOT NULL DEFAULT 'contact',      -- 'contact' | 'profile'
  is_public      BOOLEAN NOT NULL DEFAULT true,
  headline       TEXT,                                 -- câu mô tả ngắn dưới tên
  bio            TEXT,                                 -- Giới thiệu
  theme          TEXT DEFAULT 'indigo',                -- màu nhấn trang public
  skills         JSONB NOT NULL DEFAULT '[]'::jsonb,   -- ["React", ...]
  experiences    JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{title, org, period, desc}]
  education      JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{school, degree, period}]
  certifications JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{name, issuer, year}]
  projects       JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{name, desc, url}]
  socials        JSONB NOT NULL DEFAULT '{}'::jsonb,   -- {linkedin, facebook, telegram, ...}
  visibility     JSONB NOT NULL DEFAULT '{}'::jsonb,   -- {bio:true, skills:true, ...}
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_ecards_slug ON user_ecards(slug);
