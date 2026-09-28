-- Migration 119: comment/activity log for requisitions
CREATE TABLE IF NOT EXISTS requisition_comments (
  id             TEXT PRIMARY KEY,
  requisition_id TEXT NOT NULL,
  user_id        TEXT NOT NULL,
  user_name      TEXT,
  content        TEXT NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_req_comments_req_id ON requisition_comments(requisition_id);
