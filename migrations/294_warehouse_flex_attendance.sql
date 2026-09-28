-- Migration 294: chấm công kho NHIỀU ĐỢT/NGÀY (chế độ "flex") + sản lượng theo đợt.
--
-- Bối cảnh: công nhân có thể vào-ra nhiều lần trong ngày (sáng làm lô hàng, chiều có
-- hàng lại vào tiếp). Mỗi cặp check-in/check-out = MỘT ĐỢT (một dòng warehouse_attendance).
-- Tổng công ngày = cộng giờ các đợt. Ngày chốt lúc 23:59 giờ VN (work_date theo vnToday).

-- 1) Chế độ chấm công của từng kho: 'shift' (theo ca — như cũ, mặc định) | 'flex' (nhiều đợt).
ALTER TABLE warehouses
  ADD COLUMN IF NOT EXISTS attendance_mode TEXT NOT NULL DEFAULT 'shift';

-- 2) Gỡ rào "1 dòng chấm công/ngày" — chế độ flex cần nhiều dòng cùng (worker, ngày).
--    Chế độ shift vẫn giữ 1 dòng/ngày bằng logic ở service (không dựa constraint nữa).
ALTER TABLE warehouse_attendance
  DROP CONSTRAINT IF EXISTS warehouse_attendance_worker_id_work_date_key;
CREATE INDEX IF NOT EXISTS idx_wh_att_worker_date
  ON warehouse_attendance(worker_id, work_date);

-- 3) Cột cho đợt + tự khai giờ ra (quên check-out → check-in đợt mới phải khai giờ ra
--    đợt trước; giờ tự khai CHỜ QUẢN LÝ DUYỆT mới được tính vào tổng công).
ALTER TABLE warehouse_attendance
  ADD COLUMN IF NOT EXISTS session_no        INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS declared_checkout BOOLEAN NOT NULL DEFAULT FALSE,
  -- NULL = không phải tự khai; pending | approved | rejected
  ADD COLUMN IF NOT EXISTS declared_status   TEXT;

-- 4) Sản lượng theo ĐỢT + công nhân tự khai lúc check-out (chờ duyệt).
--    attendance_id NULL = bản ghi mức NGÀY (quản lý nhập nhanh — như cũ).
ALTER TABLE warehouse_output
  DROP CONSTRAINT IF EXISTS warehouse_output_worker_id_product_id_work_date_key;
ALTER TABLE warehouse_output
  ADD COLUMN IF NOT EXISTS attendance_id TEXT REFERENCES warehouse_attendance(id) ON DELETE SET NULL,
  -- manager (quản lý nhập) | worker (công nhân tự khai lúc check-out)
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manager',
  -- approved (tính vào thống kê) | pending (công nhân khai, chờ quản lý duyệt)
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved';
-- Unique mới: 1 dòng cho mỗi (công nhân, sản phẩm, ngày, đợt); đợt NULL gộp về '' để
-- bản ghi mức ngày vẫn upsert được bằng ON CONFLICT.
CREATE UNIQUE INDEX IF NOT EXISTS uq_wh_output_scope
  ON warehouse_output (worker_id, product_id, work_date, COALESCE(attendance_id, ''));
CREATE INDEX IF NOT EXISTS idx_wh_output_attendance
  ON warehouse_output(attendance_id) WHERE attendance_id IS NOT NULL;
