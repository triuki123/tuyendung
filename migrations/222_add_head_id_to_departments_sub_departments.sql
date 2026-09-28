-- Migration 222: bổ sung head_id cho departments & sub_departments.
-- DB dev đã có 2 cột này (thêm ngoài luồng, không có migration số) nhưng prod có thể thiếu
-- → org-chart API join d.head_id/sd.head_id sẽ lỗi trên DB init mới. Idempotent.
ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS head_id UUID;
ALTER TABLE sub_departments
  ADD COLUMN IF NOT EXISTS head_id UUID;

CREATE INDEX IF NOT EXISTS idx_departments_head ON departments(head_id);
CREATE INDEX IF NOT EXISTS idx_sub_departments_head ON sub_departments(head_id);
