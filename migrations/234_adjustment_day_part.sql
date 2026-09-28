-- Migration 234: nghỉ/bù công theo BUỔI cho work-mode (WFH/Công tác/loại tự tạo).
-- day_part: 'morning' | 'afternoon' | NULL (NULL = cả ngày). Nửa buổi tính 0.5 công.
-- Chỉ áp cho loại bật allow_half_day trong danh mục Loại nghỉ.
ALTER TABLE attendance_adjustments
  ADD COLUMN IF NOT EXISTS day_part TEXT;
