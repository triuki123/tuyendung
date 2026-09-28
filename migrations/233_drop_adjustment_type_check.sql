-- Migration 233: bỏ ràng buộc CHECK cứng trên attendance_adjustments.adjustment_type
-- để cho phép loại work-mode MỚI (tự tạo qua danh mục Loại nghỉ, cờ Áp dụng cho Bù công).
-- Hợp lệ được kiểm ở tầng ứng dụng (POST /api/attendance/adjustments): phải là loại
-- cấu trúc (bu_cong/bu_cong_dac_biet/bu_checkin/bu_checkout) HOẶC code loại nghỉ đang bật
-- applies_to_adjustment.
ALTER TABLE attendance_adjustments
  DROP CONSTRAINT IF EXISTS attendance_adjustments_adjustment_type_check;
