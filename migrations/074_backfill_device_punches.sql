-- Migration 074: Backfill device_punches từ dữ liệu machine cũ + chuẩn hóa machine_id canonical
--
-- An toàn: GIỮ NGUYÊN rows cũ trong attendance_records (không xóa) để có đường rollback.
-- Idempotent: chạy lại nhiều lần không lỗi nhờ ON CONFLICT DO NOTHING.
--
-- Canonical machine_id = 'zkteco_ronald_jack_1' (khớp ZKTECO_MACHINE_ID default trong code).
-- Mọi punch + mapping được quy về giá trị này để JOIN read-path khớp chính xác.

-- ── B0. Đảm bảo cột employee_code tồn tại (phòng khi migration 072 chưa chạy) ────
ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS employee_code TEXT;

-- ── B1. Chuẩn hóa machine_id của mappings về canonical ──────────────────────────
-- Chỉ đổi những dòng chưa canonical VÀ không gây trùng UNIQUE(machine_id, employee_code).
-- Dòng nào đổi sẽ gây trùng thì để nguyên (admin xử lý tay) — log số lượng còn lại bên dưới.
UPDATE public.attendance_machine_mappings m
SET machine_id = 'zkteco_ronald_jack_1', updated_at = NOW()
WHERE m.machine_id <> 'zkteco_ronald_jack_1'
  AND NOT EXISTS (
    SELECT 1 FROM public.attendance_machine_mappings m2
    WHERE m2.machine_id = 'zkteco_ronald_jack_1'
      AND m2.employee_code = m.employee_code
  );

-- ── B2. Backfill device_punches từ attendance_records (type='machine') ───────────
-- employee_code: ưu tiên cột có sẵn (migration 072); nếu NULL thì reverse-lookup theo
-- user_id — CHỈ khi user đó có ĐÚNG 1 mapping (tránh nhầm khi user có nhiều mã).
WITH single_mapping AS (
  -- user_id -> employee_code, chỉ những user có đúng 1 mapping
  SELECT user_id, MIN(employee_code) AS employee_code
  FROM public.attendance_machine_mappings
  GROUP BY user_id
  HAVING COUNT(*) = 1
)
INSERT INTO public.device_punches (machine_id, employee_code, punch_time)
SELECT
  'zkteco_ronald_jack_1' AS machine_id,
  COALESCE(ar.employee_code, sm.employee_code) AS employee_code,
  ar.recorded_at AS punch_time
FROM public.attendance_records ar
LEFT JOIN single_mapping sm ON sm.user_id = ar.user_id
WHERE ar.type = 'machine'
  AND COALESCE(ar.employee_code, sm.employee_code) IS NOT NULL
ON CONFLICT (machine_id, employee_code, punch_time) DO NOTHING;

-- ── B2b. Backfill từ attendance_unmatched — NGUỒN PUNCH THÔ LỚN NHẤT ────────────
-- Bảng cũ attendance_unmatched chứa punch thô từ máy với employee_code THẬT
-- (21k+ bản ghi, nhiều mã chưa từng map). Đây mới là kho dữ liệu máy đầy đủ.
-- Copy thẳng sang device_punches (machine_id đã canonical, employee_code thật).
INSERT INTO public.device_punches (machine_id, employee_code, punch_time)
SELECT machine_id, employee_code, recorded_at
FROM public.attendance_unmatched
WHERE employee_code IS NOT NULL
ON CONFLICT (machine_id, employee_code, punch_time) DO NOTHING;

-- ── B3. Báo cáo: machine rows cũ KHÔNG backfill được (không tra ra employee_code) ─
-- (user nhiều mapping, hoặc chưa có mapping nào) — cần xử lý tay nếu > 0.
SELECT COUNT(*) AS machine_rows_khong_backfill_duoc
FROM public.attendance_records ar
LEFT JOIN (
  SELECT user_id, MIN(employee_code) AS employee_code
  FROM public.attendance_machine_mappings
  GROUP BY user_id HAVING COUNT(*) = 1
) sm ON sm.user_id = ar.user_id
WHERE ar.type = 'machine'
  AND COALESCE(ar.employee_code, sm.employee_code) IS NULL;

SELECT 'Migration 074: backfill device_punches completed' AS migration_status;
