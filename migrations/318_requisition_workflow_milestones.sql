-- Mốc điều phối quy trình tuyển dụng theo từng yêu cầu.
-- SLA được tính khi một mốc được kích hoạt, không tính dồn từ ngày tạo yêu cầu.
CREATE TABLE IF NOT EXISTS requisition_workflow_milestones (
  id TEXT PRIMARY KEY,
  requisition_id TEXT NOT NULL,
  step_code TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  owner_label TEXT,
  sla_hours INTEGER,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'blocked', 'skipped')),
  due_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  note TEXT,
  completed_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (requisition_id, step_code)
);

CREATE INDEX IF NOT EXISTS idx_requisition_workflow_milestones_req
  ON requisition_workflow_milestones(requisition_id, status, due_at);

SELECT 'Migration 318: requisition workflow milestones ready' AS migration_status;
