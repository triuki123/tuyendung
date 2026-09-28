-- Migration 075: Temporal mapping (effective dating) — chuẩn enterprise
--
-- Mục tiêu: 1 mã máy (employee_code) có thể thuộc NHIỀU người theo THỜI GIAN.
-- Mỗi punch được gán cho người sở hữu mã TẠI ĐÚNG THỜI ĐIỂM chấm (punch_time).
-- Giải quyết triệt để vấn đề "tái sử dụng mã" khi nhân sự nghỉ → cấp mã cho người mới.
--
-- Backward compatible: mapping cũ nhận effective_from = 1970 (bao trùm toàn bộ lịch sử),
-- effective_to = NULL (đang hiệu lực) → hành vi y hệt trước migration này.

ALTER TABLE public.attendance_machine_mappings
  ADD COLUMN IF NOT EXISTS effective_from TIMESTAMPTZ NOT NULL DEFAULT '1970-01-01 00:00:00+00',
  ADD COLUMN IF NOT EXISTS effective_to   TIMESTAMPTZ;

-- Bỏ ràng buộc UNIQUE(machine_id, employee_code) cũ — giờ cho phép nhiều dòng theo thời gian.
ALTER TABLE public.attendance_machine_mappings
  DROP CONSTRAINT IF EXISTS attendance_machine_mappings_machine_id_employee_code_key;

-- Chỉ cho phép DUY NHẤT 1 mapping ĐANG MỞ (effective_to IS NULL) cho mỗi (máy, mã).
-- (Không cần exclusion constraint/btree_gist → không cần quyền superuser; chống chồng lấp
--  giai đoạn đóng được đảm bảo ở tầng ứng dụng khi bàn giao.)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_open_machine_mapping
  ON public.attendance_machine_mappings (machine_id, employee_code)
  WHERE effective_to IS NULL;

-- Index phục vụ JOIN temporal lúc đọc
CREATE INDEX IF NOT EXISTS idx_mapping_temporal
  ON public.attendance_machine_mappings (machine_id, employee_code, effective_from, effective_to);

SELECT 'Migration 075: temporal machine mappings ready' AS migration_status;
