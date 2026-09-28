-- Migration 266: Chống trùng nhắc hạn KPI (phiếu cá nhân + phiếu đơn vị).
-- Mỗi (loại phiếu, id, mốc ngày) chỉ nhắc đúng 1 lần.
CREATE TABLE IF NOT EXISTS public.kpi_reminder_log (
  id             TEXT PRIMARY KEY,
  entity_type    TEXT NOT NULL,   -- assignment | unit_assignment
  entity_id      TEXT NOT NULL,
  milestone_days INT NOT NULL,
  sent_date      DATE NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (entity_type, entity_id, milestone_days)
);
