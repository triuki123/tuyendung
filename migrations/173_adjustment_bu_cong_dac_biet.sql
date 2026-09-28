-- Migration 173: thêm loại "bù công đặc thù" (bu_cong_dac_biet)
-- Trường hợp đặc thù — người dùng tự nhập giờ vào/ra + lý do (bắt buộc).
-- Hiện trong luồng "Bù Đủ Giờ" cạnh Công tác / WFH / Làm theo ca.

ALTER TABLE public.attendance_adjustments
  DROP CONSTRAINT IF EXISTS attendance_adjustments_adjustment_type_check;

ALTER TABLE public.attendance_adjustments
  ADD CONSTRAINT attendance_adjustments_adjustment_type_check
  CHECK (adjustment_type IN ('bu_cong','bu_cong_dac_biet','bu_checkin','bu_checkout','cong_tac','wfh','lam_theo_ca'));
