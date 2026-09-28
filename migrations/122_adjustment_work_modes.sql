-- Migration 122: thêm 3 chế độ công đặc biệt vào Bù Công (adjustment_type)
-- cong_tac (công tác), wfh (làm việc tại nhà), lam_theo_ca (làm theo ca)
ALTER TABLE attendance_adjustments
  DROP CONSTRAINT IF EXISTS attendance_adjustments_adjustment_type_check;

ALTER TABLE attendance_adjustments
  ADD CONSTRAINT attendance_adjustments_adjustment_type_check
    CHECK (adjustment_type IN (
      'bu_cong',
      'bu_checkin',
      'bu_checkout',
      'cong_tac',
      'wfh',
      'lam_theo_ca'
    ));
