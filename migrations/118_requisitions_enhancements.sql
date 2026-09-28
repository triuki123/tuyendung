-- Migration 118: salary, pipeline counts, and approval fields for requisitions
ALTER TABLE requisitions
  ADD COLUMN IF NOT EXISTS salary_min      INTEGER,
  ADD COLUMN IF NOT EXISTS salary_max      INTEGER,
  ADD COLUMN IF NOT EXISTS salary_type     TEXT DEFAULT 'negotiable',
  ADD COLUMN IF NOT EXISTS budget_code     TEXT,
  ADD COLUMN IF NOT EXISTS cnt_sourcing    INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cnt_screening   INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cnt_interview   INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cnt_offer       INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS approved_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by     TEXT;
