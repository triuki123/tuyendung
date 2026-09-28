-- Kho ứng viên: schema ATS đầy đủ, dùng được cả khi môi trường local chưa chạy migration lịch sử.
CREATE TABLE IF NOT EXISTS hr_cv_pool (
  id                TEXT PRIMARY KEY,
  candidate_name    TEXT NOT NULL,
  candidate_email   TEXT,
  candidate_phone   TEXT,
  position_applied  TEXT,
  industry          TEXT,
  source            TEXT,
  status            TEXT NOT NULL DEFAULT 'new'
                    CHECK (status IN ('new','screening','interviewed','offered','hired','rejected','pool')),
  note              TEXT,
  file_name         TEXT,
  mime_type         TEXT,
  size_bytes        INTEGER,
  content           BYTEA,
  media_id          TEXT,
  uploaded_by       TEXT,
  content_text      TEXT,
  search_text       TEXT,
  skills            TEXT[] NOT NULL DEFAULT '{}',
  years_experience  NUMERIC(4,1),
  current_title     TEXT,
  education_level   TEXT,
  expected_salary   BIGINT,
  location          TEXT,
  languages         TEXT[] NOT NULL DEFAULT '{}',
  rating            SMALLINT CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  tags              TEXT[] NOT NULL DEFAULT '{}',
  extracted_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_hr_cv_pool_status ON hr_cv_pool(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_hr_cv_pool_industry ON hr_cv_pool(industry) WHERE deleted_at IS NULL;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
DROP INDEX IF EXISTS idx_hr_cv_pool_search;
CREATE INDEX IF NOT EXISTS idx_hr_cv_pool_search_trgm
  ON hr_cv_pool USING GIN(search_text gin_trgm_ops)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_hr_cv_pool_skills ON hr_cv_pool USING GIN(skills);

SELECT 'Migration 319: hr_cv_pool ready' AS migration_status;
