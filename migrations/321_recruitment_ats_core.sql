-- Migration 321: Core ATS tables required by the Recruitment and CV Pool modules.
-- This is intentionally idempotent because some local databases were created
-- without the earlier recruitment migrations.

CREATE TABLE IF NOT EXISTS requisitions (
  id                  TEXT PRIMARY KEY,
  title               TEXT NOT NULL,
  company_id          TEXT,
  department_id       TEXT,
  sub_department_id   TEXT,
  position_id         TEXT,
  jd_id               TEXT,
  target_headcount    INTEGER NOT NULL DEFAULT 1,
  filled_count        INTEGER NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'pending_approval',
  priority            TEXT NOT NULL DEFAULT 'normal',
  owner_id            TEXT,
  requested_by        TEXT,
  open_date           DATE NOT NULL DEFAULT CURRENT_DATE,
  target_close_date   DATE,
  filled_at           DATE,
  note                TEXT,
  created_by          TEXT,
  approved_at         TIMESTAMPTZ,
  approved_by         TEXT,
  reject_reason       TEXT,
  salary_min          BIGINT,
  salary_max          BIGINT,
  salary_type         TEXT,
  budget_code         TEXT,
  cnt_sourcing        INTEGER NOT NULL DEFAULT 0,
  cnt_screening       INTEGER NOT NULL DEFAULT 0,
  cnt_interview       INTEGER NOT NULL DEFAULT 0,
  cnt_offer           INTEGER NOT NULL DEFAULT 0,
  interviewer_ids     TEXT[] NOT NULL DEFAULT '{}',
  follower_ids        TEXT[] NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ,
  CONSTRAINT chk_requisitions_status CHECK (status IN ('pending', 'pending_approval', 'open', 'on_hold', 'filled', 'cancelled', 'rejected')),
  CONSTRAINT chk_requisitions_priority CHECK (priority IN ('low', 'normal', 'high', 'urgent'))
);

CREATE INDEX IF NOT EXISTS idx_requisitions_active ON requisitions(status, priority, open_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_requisitions_company ON requisitions(company_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS hr_cv_stage_history (
  id          TEXT PRIMARY KEY,
  cv_id       TEXT NOT NULL REFERENCES hr_cv_pool(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status   TEXT NOT NULL,
  note        TEXT,
  changed_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hr_cv_stage_history_cv ON hr_cv_stage_history(cv_id, created_at DESC);

CREATE TABLE IF NOT EXISTS hr_cv_notes (
  id          TEXT PRIMARY KEY,
  cv_id       TEXT NOT NULL REFERENCES hr_cv_pool(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL DEFAULT 'note',
  rating      SMALLINT,
  body        TEXT,
  author_id   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_hr_cv_notes_rating CHECK (rating IS NULL OR rating BETWEEN 1 AND 5)
);
CREATE INDEX IF NOT EXISTS idx_hr_cv_notes_cv ON hr_cv_notes(cv_id, created_at DESC);

CREATE TABLE IF NOT EXISTS hr_applications (
  id                 TEXT PRIMARY KEY,
  cv_id              TEXT NOT NULL REFERENCES hr_cv_pool(id) ON DELETE CASCADE,
  requisition_id     TEXT NOT NULL REFERENCES requisitions(id) ON DELETE CASCADE,
  status             TEXT NOT NULL DEFAULT 'screening',
  note               TEXT,
  created_by         TEXT,
  decided_by         TEXT,
  decided_at         TIMESTAMPTZ,
  reject_reason      TEXT,
  reject_reason_code TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_hr_applications_cv_requisition UNIQUE (cv_id, requisition_id),
  CONSTRAINT chk_hr_applications_status CHECK (status IN ('new', 'screening', 'interviewed', 'offered', 'hired', 'rejected', 'pool'))
);
CREATE INDEX IF NOT EXISTS idx_hr_applications_cv ON hr_applications(cv_id);
CREATE INDEX IF NOT EXISTS idx_hr_applications_requisition ON hr_applications(requisition_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_app_committed_per_cv
  ON hr_applications(cv_id) WHERE status IN ('interviewed', 'offered', 'hired');

CREATE TABLE IF NOT EXISTS hr_application_history (
  id             TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES hr_applications(id) ON DELETE CASCADE,
  cv_id          TEXT NOT NULL,
  requisition_id TEXT NOT NULL,
  from_status    TEXT,
  to_status      TEXT NOT NULL,
  actor_role     TEXT,
  note           TEXT,
  changed_by     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hr_app_history_application ON hr_application_history(application_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_app_history_cv ON hr_application_history(cv_id, created_at DESC);
