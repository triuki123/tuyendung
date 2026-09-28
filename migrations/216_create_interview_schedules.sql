-- Migration 216: Lịch phỏng vấn (theo VỊ TRÍ / application)
-- Đặt lịch phỏng vấn cho ứng viên: vòng, thời gian, hình thức, người phỏng vấn, địa điểm/link.
CREATE TABLE IF NOT EXISTS hr_interview_schedules (
  id             TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES hr_applications(id) ON DELETE CASCADE,
  cv_id          TEXT NOT NULL,
  requisition_id TEXT NOT NULL,
  round_label    TEXT NOT NULL DEFAULT 'Vòng 1',
  scheduled_at   TIMESTAMPTZ NOT NULL,
  duration_min   INTEGER NOT NULL DEFAULT 60,
  mode           TEXT NOT NULL DEFAULT 'onsite',      -- onsite | online | phone
  location       TEXT,                                 -- phòng họp / địa điểm
  meeting_link   TEXT,                                 -- link online
  interviewer_ids TEXT[] NOT NULL DEFAULT '{}',        -- users.id người phỏng vấn
  status         TEXT NOT NULL DEFAULT 'scheduled',    -- scheduled | done | cancelled
  note           TEXT,
  created_by     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_interview_mode CHECK (mode IN ('onsite','online','phone')),
  CONSTRAINT chk_interview_status CHECK (status IN ('scheduled','done','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_interview_app ON hr_interview_schedules(application_id, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS idx_interview_when ON hr_interview_schedules(scheduled_at) WHERE status = 'scheduled';
