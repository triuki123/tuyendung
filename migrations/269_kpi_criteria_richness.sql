-- Migration 269: làm giàu tiêu chí KPI.
--  - category: nhóm tiêu chí (ket_qua | nang_luc | thai_do | tuan_thu) trên MẪU và trên PHIẾU.
--  - self_achieved / manager_achieved: trạng thái Đạt/Không đạt của từng tiêu chí ở mỗi tầng (NULL = chưa đánh giá).
--  - phần TỔNG KẾT + xếp loại trên phiếu: strengths / improvements / next_goals / training_needs / grade.
ALTER TABLE public.kpi_template_items
  ADD COLUMN IF NOT EXISTS category TEXT;

ALTER TABLE public.kpi_assignment_items
  ADD COLUMN IF NOT EXISTS category         TEXT,
  ADD COLUMN IF NOT EXISTS self_achieved    BOOLEAN,
  ADD COLUMN IF NOT EXISTS manager_achieved BOOLEAN;

ALTER TABLE public.kpi_assignments
  ADD COLUMN IF NOT EXISTS strengths       TEXT,
  ADD COLUMN IF NOT EXISTS improvements    TEXT,
  ADD COLUMN IF NOT EXISTS next_goals      TEXT,
  ADD COLUMN IF NOT EXISTS training_needs  TEXT,
  ADD COLUMN IF NOT EXISTS grade           TEXT;
