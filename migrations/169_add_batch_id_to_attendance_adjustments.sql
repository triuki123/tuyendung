-- Migration 169: gom nhóm bù công nhiều ngày
-- batch_id nối các dòng adjustment cùng một đợt (vd công tác 5 ngày = 5 dòng cùng batch_id)
-- để hiển thị/hủy/duyệt theo cả đợt. NULL = đề xuất 1 ngày như cũ (không đổi hành vi cũ).
ALTER TABLE attendance_adjustments
  ADD COLUMN IF NOT EXISTS batch_id TEXT;

CREATE INDEX IF NOT EXISTS idx_att_adj_batch ON attendance_adjustments (batch_id);
