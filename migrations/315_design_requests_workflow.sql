-- Migration 315: mở rộng design_requests cho workflow Social Design (Giai đoạn 1)
-- Thêm: campaign/kênh, brief chi tiết, thông số thiết kế, tài nguyên tham khảo,
-- lý do bị chặn; mở rộng trạng thái (revision_requested/approved/blocked).
ALTER TABLE design_requests
  ADD COLUMN IF NOT EXISTS campaign_name TEXT,
  ADD COLUMN IF NOT EXISTS channel TEXT,
  ADD COLUMN IF NOT EXISTS brief_detail JSONB,
  ADD COLUMN IF NOT EXISTS design_spec JSONB,
  ADD COLUMN IF NOT EXISTS resources JSONB,
  ADD COLUMN IF NOT EXISTS block_reason TEXT,
  ADD COLUMN IF NOT EXISTS block_note TEXT;

ALTER TABLE design_requests DROP CONSTRAINT IF EXISTS design_requests_status;
ALTER TABLE design_requests ADD CONSTRAINT design_requests_status CHECK (
  status IN ('new','accepted','in_progress','review','revision_requested','approved',
             'completed','rejected','archived','blocked')
);
