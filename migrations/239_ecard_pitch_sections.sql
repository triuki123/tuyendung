-- Migration 239: hồ sơ năng lực hướng khách hàng — mục pitch + chọn template landing.
ALTER TABLE user_ecards
  ADD COLUMN IF NOT EXISTS template     TEXT NOT NULL DEFAULT 'aurora',        -- mẫu landing
  ADD COLUMN IF NOT EXISTS highlights   JSONB NOT NULL DEFAULT '[]'::jsonb,    -- [{label,value}] con số nổi bật
  ADD COLUMN IF NOT EXISTS expertise    JSONB NOT NULL DEFAULT '[]'::jsonb,    -- [{name,desc}] lĩnh vực/dịch vụ
  ADD COLUMN IF NOT EXISTS clients      JSONB NOT NULL DEFAULT '[]'::jsonb,    -- [{name,logo}] khách hàng/đối tác
  ADD COLUMN IF NOT EXISTS testimonials JSONB NOT NULL DEFAULT '[]'::jsonb;    -- [{quote,author,role}]
