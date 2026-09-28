-- Migration 310: Yêu cầu tuyển dụng — người phỏng vấn, người theo dõi, lịch sử xử lý.
--
-- 1) interviewer_ids: hội đồng/panel phỏng vấn dự kiến của VỊ TRÍ (khác hr_interview_schedules
--    .interviewer_ids là người phỏng vấn của TỪNG BUỔI cụ thể).
-- 2) follower_ids: người theo dõi — được thêm tay trong form HOẶC tự bấm nút "Theo dõi" trên thẻ.
-- Dùng TEXT[] cùng quy ước với hr_interview_schedules (mig 216) thay vì bảng nối.
ALTER TABLE requisitions
  ADD COLUMN IF NOT EXISTS interviewer_ids TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS follower_ids    TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_requisitions_followers   ON requisitions USING GIN (follower_ids);
CREATE INDEX IF NOT EXISTS idx_requisitions_interviewers ON requisitions USING GIN (interviewer_ids);

-- 3) Lịch sử xử lý theo từng yêu cầu tuyển dụng.
-- KHÔNG dùng hr_record_audit_logs (mig 287): bảng đó CHECK entity_type IN (contract, evaluation,
-- hr_document) và feed của nó là tab "Lịch sử" riêng của module Quản Lý Hồ Sơ.
-- performed_by để TEXT cho khớp requisitions.created_by/owner_id (TEXT) trong module này.
CREATE TABLE IF NOT EXISTS requisition_audit_logs (
  id             TEXT PRIMARY KEY,
  requisition_id TEXT NOT NULL,
  action         TEXT NOT NULL,   -- create|update|delete|approve|accept|reject|status_change|follow|unfollow
  details        TEXT,            -- câu mô tả tiếng Việt, hiển thị thẳng lên UI
  changes        JSONB,           -- diff: { field: { label, from, to } }
  performed_by   TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_req_audit_req
  ON requisition_audit_logs(requisition_id, created_at DESC);

SELECT 'Migration 310: requisition panel/followers/audit ready' AS migration_status;
