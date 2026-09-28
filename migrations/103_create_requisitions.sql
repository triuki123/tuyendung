-- Migration 103: Yêu cầu tuyển dụng (requisitions) — nền tảng cho time-to-fill, plan-vs-actual, aging.
-- Mỗi requisition = 1 nhu cầu tuyển cho 1 vị trí: số lượng cần (target), người phụ trách, ngày mở.

CREATE TABLE IF NOT EXISTS requisitions (
  id                TEXT PRIMARY KEY,
  title             TEXT NOT NULL,
  company_id        TEXT,
  department_id     TEXT,
  position_id       TEXT,
  jd_id             TEXT,                                   -- liên kết hr_jd_pool (tùy chọn)
  target_headcount  INTEGER NOT NULL DEFAULT 1,
  filled_count      INTEGER NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'open'   CHECK (status IN ('open','on_hold','filled','cancelled')),
  priority          TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  owner_id          TEXT,                                   -- recruiter phụ trách (users.id)
  open_date         DATE NOT NULL DEFAULT CURRENT_DATE,
  target_close_date DATE,
  filled_at         DATE,                                   -- ngày tuyển đủ (time-to-fill)
  note              TEXT,
  created_by        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_requisitions_status ON requisitions(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_requisitions_owner  ON requisitions(owner_id);
CREATE INDEX IF NOT EXISTS idx_requisitions_open   ON requisitions(open_date);

SELECT 'Migration 103: requisitions created' AS migration_status;
