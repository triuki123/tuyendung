-- Migration 214: Chuẩn hóa lý do loại ứng viên (theo vị trí) để phân tích được.
-- reject_reason (đã có) = ghi chú tự do; reject_reason_code = mã lý do chuẩn (nhóm thống kê).
ALTER TABLE hr_applications
  ADD COLUMN IF NOT EXISTS reject_reason_code TEXT;
