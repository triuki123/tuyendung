-- Migration 073: Bảng device_punches — NGUỒN SỰ THẬT (source of truth) cho dữ liệu chấm công máy
--
-- Kiến trúc "Projection Model": punch thô từ máy ZKTeco lưu ở đây, ĐỘC LẬP HOÀN TOÀN với mapping.
-- Dữ liệu của user = JOIN sống giữa device_punches và attendance_machine_mappings lúc đọc.
-- Map → hiện ngay; Unmap → ẩn ngay; Remap → user mới thấy ngay. Không copy/move/sync.
--
-- Khóa tự nhiên (machine_id, employee_code, punch_time) cho phép dedup bằng ON CONFLICT DO NOTHING
-- (không cần fuzzy ±5min như cũ — timestamp từ máy là chính xác và ổn định).

CREATE TABLE IF NOT EXISTS public.device_punches (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id    TEXT NOT NULL,                 -- mã máy (canonical, ví dụ 'zkteco_ronald_jack_1')
  employee_code TEXT NOT NULL,                 -- mã nhân viên trên máy
  punch_time    TIMESTAMPTZ NOT NULL,          -- thời gian chấm (lấy đúng từ máy)
  raw_status    INTEGER,                       -- status code thô từ máy (tùy chọn)
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (machine_id, employee_code, punch_time)
);

-- Index cho JOIN với mappings + range filter theo tháng
CREATE INDEX IF NOT EXISTS idx_device_punches_lookup ON public.device_punches(machine_id, employee_code, punch_time);
CREATE INDEX IF NOT EXISTS idx_device_punches_time   ON public.device_punches(punch_time);

SELECT 'Migration 073: device_punches table created' AS migration_status;
