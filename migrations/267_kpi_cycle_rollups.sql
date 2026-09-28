-- Migration 267: Liên kết kỳ tháng → kỳ tổng hợp (quý/6 tháng/năm).
-- Kỳ tổng hợp vẫn là 1 kpi_cycle THẬT, có phiếu/chốt điểm như bình thường — bảng này chỉ
-- ghi nhận "kỳ tháng nào được gộp tham khảo vào kỳ tổng hợp nào" để tính điểm tham khảo
-- (trung bình các kỳ tháng đã CHỐT), không tự động cộng vào điểm chính thức.
CREATE TABLE IF NOT EXISTS public.kpi_cycle_rollups (
  id              TEXT PRIMARY KEY,
  parent_cycle_id TEXT NOT NULL REFERENCES public.kpi_cycles(id) ON DELETE CASCADE,
  child_cycle_id  TEXT NOT NULL REFERENCES public.kpi_cycles(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (parent_cycle_id, child_cycle_id)
);

CREATE INDEX IF NOT EXISTS idx_kpi_cycle_rollups_parent ON public.kpi_cycle_rollups(parent_cycle_id);
CREATE INDEX IF NOT EXISTS idx_kpi_cycle_rollups_child  ON public.kpi_cycle_rollups(child_cycle_id);
