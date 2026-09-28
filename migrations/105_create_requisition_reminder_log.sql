-- Migration 105: log chống trùng cho nhắc Yêu Cầu Tuyển Dụng sắp hết hạn (5 ngày & 1 ngày trước).
-- UNIQUE(requisition_id, milestone, sent_date): mỗi mốc nhắc tối đa 1 lần/ngày.

CREATE TABLE IF NOT EXISTS requisition_reminder_log (
  id             TEXT PRIMARY KEY,
  requisition_id TEXT NOT NULL,
  milestone      TEXT NOT NULL,
  sent_date      DATE NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (requisition_id, milestone, sent_date)
);
CREATE INDEX IF NOT EXISTS idx_req_reminder_log_req ON requisition_reminder_log(requisition_id);

SELECT 'Migration 105: requisition_reminder_log created' AS migration_status;
