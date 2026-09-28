-- Migration 288: Vật tư kho/xưởng (nguyên vật liệu + công cụ dụng cụ)
--
-- Tách biệt HOÀN TOÀN với module Tài Sản (assets): đây là sổ vật tư nội bộ, mỗi kho
-- tự quản, do quản lý kho nhập. Không giá tiền, không nhà cung cấp — cố tình giữ đơn giản.
--
-- Tồn kho KHÔNG lưu thành cột: luôn tính từ sổ warehouse_supply_moves
--   tồn      = SUM(in) - SUM(out) - SUM(assign) + SUM(return)
--   đang cấp = SUM(assign) - SUM(return)  (theo từng công nhân)
-- Làm vậy để "số tồn" không bao giờ lệch khỏi "lịch sử biến động".

-- Danh mục vật tư của kho
CREATE TABLE IF NOT EXISTS warehouse_supplies (
  id            TEXT PRIMARY KEY,
  warehouse_id  TEXT NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  -- material = nguyên vật liệu (dùng là hết) | tool = công cụ dụng cụ (dùng nhiều lần)
  kind          TEXT NOT NULL CHECK (kind IN ('material', 'tool')),
  unit          TEXT NOT NULL DEFAULT 'cái',
  -- Ngưỡng cảnh báo sắp hết. NULL = không cảnh báo.
  min_quantity  NUMERIC(14, 2),
  note          TEXT,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wh_supplies_warehouse
  ON warehouse_supplies(warehouse_id, active, kind);

-- Sổ biến động vật tư — nguồn sự thật duy nhất của tồn kho
CREATE TABLE IF NOT EXISTS warehouse_supply_moves (
  id            TEXT PRIMARY KEY,
  warehouse_id  TEXT NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  supply_id     TEXT NOT NULL REFERENCES warehouse_supplies(id) ON DELETE CASCADE,
  -- in = nhập kho | out = xuất (dùng hết/hỏng/mất)
  -- assign = cấp phát cho công nhân | return = công nhân trả lại
  move_type     TEXT NOT NULL CHECK (move_type IN ('in', 'out', 'assign', 'return')),
  -- Luôn DƯƠNG. Dấu do move_type quyết định — tránh nhập nhầm số âm.
  quantity      NUMERIC(14, 2) NOT NULL CHECK (quantity > 0),
  worker_id     TEXT REFERENCES warehouse_workers(id) ON DELETE SET NULL,
  note          TEXT,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Cấp phát/thu hồi BẮT BUỘC có công nhân; nhập/xuất thì KHÔNG được có.
  -- Chặn ngay ở DB để tồn "đang cấp phát" không bao giờ mồ côi.
  CONSTRAINT chk_supply_move_worker CHECK (
    (move_type IN ('assign', 'return') AND worker_id IS NOT NULL)
    OR
    (move_type IN ('in', 'out') AND worker_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_wh_supply_moves_supply
  ON warehouse_supply_moves(supply_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wh_supply_moves_worker
  ON warehouse_supply_moves(worker_id) WHERE worker_id IS NOT NULL;
