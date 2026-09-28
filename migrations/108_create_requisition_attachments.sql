-- Migration 108: Đính kèm tài liệu cho Yêu Cầu Tuyển Dụng (VD: JD, mô tả vị trí, yêu cầu kỹ năng).
CREATE TABLE IF NOT EXISTS requisition_attachments (
  id           TEXT PRIMARY KEY,
  requisition_id TEXT NOT NULL REFERENCES requisitions(id) ON DELETE CASCADE,
  file_name    TEXT NOT NULL,
  mime_type    TEXT,
  size_bytes   BIGINT,
  content      BYTEA NOT NULL,
  uploaded_by  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_req_attachments_req ON requisition_attachments(requisition_id) WHERE deleted_at IS NULL;

SELECT 'Migration 108: requisition_attachments created' AS migration_status;
