-- Migration 221: đánh dấu đơn nghỉ NỬA BUỔI (buổi sáng / buổi chiều)
-- Phân biệt "nghỉ nửa buổi" (day_part) với "nghỉ vài giờ tuỳ ý" (mode='hour', day_part NULL).
-- Khi công ty bật halfDayLeaveValue, đơn có day_part sẽ trừ quỹ phép = giá trị cố định
-- thay vì theo giờ thực (giờ ÷ 8).
ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS day_part TEXT;

-- Chỉ nhận 'morning' / 'afternoon' (NULL = cả ngày hoặc theo giờ tuỳ ý). Idempotent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leave_requests_day_part_check'
  ) THEN
    ALTER TABLE leave_requests
      ADD CONSTRAINT leave_requests_day_part_check
      CHECK (day_part IS NULL OR day_part IN ('morning','afternoon'));
  END IF;
END $$;
