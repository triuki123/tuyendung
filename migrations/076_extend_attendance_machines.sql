-- Migration 076: Mở rộng attendance_machines cho mô hình đa máy + chế độ kết nối
--
-- connection_mode:
--   'pull' (mặc định) = poller chủ động TCP kéo dữ liệu (máy LAN nội bộ)
--   'push'            = máy tự gửi ra qua ADMS (/api/attendance/adms) — máy ở xa/qua domain,
--                       không cần mở cổng vào, an toàn. Poller BỎ QUA máy push.
-- comm_key             = khóa giao tiếp/mật khẩu máy (tùy chọn, một số máy ZKTeco yêu cầu).
-- poll_interval_seconds= chu kỳ poll riêng cho máy (giây).

ALTER TABLE public.attendance_machines
  ADD COLUMN IF NOT EXISTS connection_mode       TEXT NOT NULL DEFAULT 'pull',
  ADD COLUMN IF NOT EXISTS comm_key              TEXT,
  ADD COLUMN IF NOT EXISTS poll_interval_seconds INTEGER NOT NULL DEFAULT 30;

SELECT 'Migration 076: attendance_machines extended (connection_mode, comm_key, poll_interval_seconds)' AS migration_status;
