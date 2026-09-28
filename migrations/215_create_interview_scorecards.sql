-- Migration 215: Scorecard phỏng vấn có cấu trúc (theo VỊ TRÍ / application)
-- Nhiều vòng, nhiều người phỏng vấn, chấm theo tiêu chí + khuyến nghị → quyết định dựa dữ liệu.
CREATE TABLE IF NOT EXISTS hr_interview_scorecards (
  id             TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES hr_applications(id) ON DELETE CASCADE,
  cv_id          TEXT NOT NULL,           -- denormalize để gộp theo CV
  requisition_id TEXT NOT NULL,
  round_label    TEXT NOT NULL DEFAULT 'Vòng 1',
  interviewer_id TEXT,                     -- users.id người chấm
  recommendation TEXT,                     -- strong_yes | yes | neutral | no | strong_no
  overall        SMALLINT,                 -- điểm tổng 1..5
  criteria       JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{name, rating, comment}]
  summary        TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_scorecard_overall CHECK (overall IS NULL OR overall BETWEEN 1 AND 5)
);
CREATE INDEX IF NOT EXISTS idx_scorecard_app ON hr_interview_scorecards(application_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scorecard_cv  ON hr_interview_scorecards(cv_id, created_at DESC);
