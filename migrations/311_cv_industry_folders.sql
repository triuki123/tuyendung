-- Migration 311: group candidate CVs into industry folders.
ALTER TABLE hr_cv_pool
  ADD COLUMN IF NOT EXISTS industry TEXT;

CREATE INDEX IF NOT EXISTS idx_hr_cv_pool_industry
  ON hr_cv_pool (industry)
  WHERE deleted_at IS NULL;
