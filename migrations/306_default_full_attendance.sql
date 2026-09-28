-- Migration 306: "Mặc Định Đủ Công" cho các vị trí không phải điểm danh
--
-- default_full_attendance      : bật/tắt ở tab Chế Độ & Đãi Ngộ của hồ sơ người dùng.
-- default_full_attendance_from : mốc HIỆU LỰC — chỉ áp đủ công cho ngày >= mốc này.
--   Đặt bằng ngày đầu KỲ CÔNG hiện tại lúc bật cờ, để bảng công các kỳ đã chốt/đã
--   gửi HR không bị thay đổi hồi tố (số liệu lương đã trả giữ nguyên).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS default_full_attendance      BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_full_attendance_from DATE;

-- Người đang tick (nếu có, do seed) mà thiếu mốc → coi như hiệu lực từ hôm nay.
UPDATE users
   SET default_full_attendance_from = CURRENT_DATE
 WHERE default_full_attendance = true
   AND default_full_attendance_from IS NULL;
