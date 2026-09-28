-- Additive fields only. Unknown candidate details stay NULL.
ALTER TABLE hr_cv_pool
  ADD COLUMN IF NOT EXISTS employment_type TEXT CHECK (employment_type IN ('full_time','part_time','contract','internship','freelance','remote','hybrid','onsite')),
  ADD COLUMN IF NOT EXISTS gender TEXT CHECK (gender IN ('male','female','other')),
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS job_search_status TEXT CHECK (job_search_status IN ('actively_looking','open_to_offers','not_looking')),
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;

UPDATE hr_cv_pool SET last_activity_at = COALESCE(updated_at, created_at) WHERE last_activity_at IS NULL;
ALTER TABLE hr_cv_pool ALTER COLUMN last_activity_at SET DEFAULT NOW();

-- Views belong to the authenticated TA, not a single shared/global flag.
CREATE TABLE IF NOT EXISTS hr_cv_views (
  cv_id TEXT NOT NULL REFERENCES hr_cv_pool(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (cv_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_hr_cv_views_user ON hr_cv_views(user_id, cv_id);
CREATE INDEX IF NOT EXISTS idx_hr_cv_pool_updated ON hr_cv_pool(updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_hr_cv_pool_activity ON hr_cv_pool(last_activity_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_hr_cv_pool_languages ON hr_cv_pool USING GIN(languages) WHERE deleted_at IS NULL;
