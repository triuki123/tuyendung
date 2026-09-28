-- Migration 317: cho phép giao 1 yêu cầu thiết kế cho NHIỀU người (team) thay
-- vì chỉ 1 người. Giữ design_requests.assignee_id/assignee_name làm "người
-- phụ trách chính" (tương thích ngược cho các chỗ đã dùng: notify khi tạo,
-- badge trên card...); bảng mới lưu đầy đủ danh sách người tham gia.
CREATE TABLE IF NOT EXISTS design_request_assignees (
  id TEXT PRIMARY KEY DEFAULT ('dra_' || replace(gen_random_uuid()::text, '-', '')),
  design_request_id TEXT NOT NULL REFERENCES design_requests(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  user_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (design_request_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_design_request_assignees_req ON design_request_assignees(design_request_id);
CREATE INDEX IF NOT EXISTS idx_design_request_assignees_user ON design_request_assignees(user_id);

-- Backfill: mỗi yêu cầu đã có assignee_id đơn → thêm vào bảng nhiều người.
INSERT INTO design_request_assignees (design_request_id, user_id, user_name)
SELECT id, assignee_id, assignee_name FROM design_requests
WHERE assignee_id IS NOT NULL
ON CONFLICT (design_request_id, user_id) DO NOTHING;
