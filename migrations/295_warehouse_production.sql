-- Migration 295: SẢN XUẤT & TỒN KHO kho/xưởng — hàng thô, thành phẩm, định mức (BOM),
-- lệnh sản xuất theo lô, đợt xuất kho quét barcode, GIÁ VỐN bình quân gia quyền.
--
-- Triết lý kế thừa từ module Vật Tư (mig 288): TỒN KHO KHÔNG LƯU THÀNH CỘT — luôn tính
-- từ sổ biến động (warehouse_stock_moves). Muốn sửa tồn phải ghi một dòng kiểm kê có
-- người ký. Giá vốn = bình quân gia quyền trên các lượt NHẬP có đơn giá.
--
-- Dòng chảy: HÀNG THÔ --(lệnh SX, trừ theo BOM)--> THÀNH PHẨM --(đợt xuất, quét đếm)--> XUẤT
-- Vật tư đóng gói dùng module Vật Tư sẵn có (warehouse_supplies) — BOM trỏ sang được.

-- 1) Danh mục hàng hóa: hàng thô (raw) + thành phẩm (finished). SKU/barcode để quét.
CREATE TABLE IF NOT EXISTS warehouse_items (
  id               TEXT PRIMARY KEY,
  warehouse_id     TEXT NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  sku              TEXT NOT NULL,
  barcode          TEXT,                       -- mã vạch in tem (NULL = dùng SKU khi quét)
  name             TEXT NOT NULL,
  item_type        TEXT NOT NULL CHECK (item_type IN ('raw', 'finished')),
  unit             TEXT NOT NULL DEFAULT 'cái',
  -- Số đơn vị trong 1 thùng — quét 1 thùng khi xuất = +units_per_carton. NULL = quét lẻ.
  units_per_carton NUMERIC(14, 2),
  min_quantity     NUMERIC(14, 2),             -- ngưỡng cảnh báo sắp hết. NULL = không cảnh báo
  note             TEXT,
  active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_wh_items_sku ON warehouse_items(warehouse_id, sku);
CREATE INDEX IF NOT EXISTS idx_wh_items_wh ON warehouse_items(warehouse_id, active, item_type);

-- 2) Sổ kho — NGUỒN SỰ THẬT DUY NHẤT của tồn + giá vốn.
--    tồn = SUM(nhập) - SUM(xuất); giá vốn BQ = Σ(qty×unit_cost các lượt nhập) / Σ(qty nhập)
CREATE TABLE IF NOT EXISTS warehouse_stock_moves (
  id                  TEXT PRIMARY KEY,
  warehouse_id        TEXT NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  item_id             TEXT NOT NULL REFERENCES warehouse_items(id) ON DELETE CASCADE,
  -- purchase_in    = nhập mua hàng thô        | production_out = xuất nguyên liệu cho lô SX
  -- production_in  = nhập thành phẩm từ lô SX | ship_out       = xuất bán theo đợt
  -- adjust_in/out  = kiểm kê điều chỉnh (thừa/thiếu)
  move_type           TEXT NOT NULL CHECK (move_type IN
                        ('purchase_in', 'production_in', 'production_out', 'ship_out', 'adjust_in', 'adjust_out')),
  quantity            NUMERIC(14, 2) NOT NULL CHECK (quantity > 0),  -- luôn DƯƠNG, dấu do move_type
  -- Đơn giá (đồng/đơn vị) cho lượt NHẬP: purchase_in nhập tay; production_in do hệ thống
  -- cuộn từ chi phí nguyên liệu của lô. Lượt XUẤT không ghi (giá vốn tính bình quân).
  unit_cost           NUMERIC(18, 2),
  production_order_id TEXT,                    -- gắn lô SX (production_in / production_out)
  shipment_id         TEXT,                    -- gắn đợt xuất (ship_out)
  note                TEXT,
  created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wh_stock_moves_item ON warehouse_stock_moves(item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wh_stock_moves_wh   ON warehouse_stock_moves(warehouse_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wh_stock_moves_po   ON warehouse_stock_moves(production_order_id) WHERE production_order_id IS NOT NULL;

-- 3) Định mức (BOM): công thức 1 đơn vị thành phẩm ăn bao nhiêu nguyên liệu/vật tư.
--    Mỗi thành phẩm 1 BOM active (đổi công thức → tắt BOM cũ, tạo BOM mới → giữ lịch sử lô cũ).
CREATE TABLE IF NOT EXISTS warehouse_boms (
  id               TEXT PRIMARY KEY,
  warehouse_id     TEXT NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  finished_item_id TEXT NOT NULL REFERENCES warehouse_items(id) ON DELETE CASCADE,
  name             TEXT,                       -- vd "Công thức đóng hộp 12 trái"
  active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_wh_bom_finished_active
  ON warehouse_boms(finished_item_id) WHERE active;

-- Dòng định mức: component là HÀNG THÔ (item_id) hoặc VẬT TƯ (supply_id) — đúng 1 trong 2.
CREATE TABLE IF NOT EXISTS warehouse_bom_lines (
  id          TEXT PRIMARY KEY,
  bom_id      TEXT NOT NULL REFERENCES warehouse_boms(id) ON DELETE CASCADE,
  item_id     TEXT REFERENCES warehouse_items(id) ON DELETE CASCADE,
  supply_id   TEXT REFERENCES warehouse_supplies(id) ON DELETE CASCADE,
  quantity    NUMERIC(14, 4) NOT NULL CHECK (quantity > 0),  -- cho 1 đơn vị thành phẩm (1/12 thùng = 0.0833)
  CONSTRAINT chk_bom_line_component CHECK (
    (item_id IS NOT NULL AND supply_id IS NULL) OR (item_id IS NULL AND supply_id IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_wh_bom_lines_bom ON warehouse_bom_lines(bom_id);

-- 4) Lệnh sản xuất theo LÔ.
--    Hoàn thành lô = backflush: trừ nguyên liệu + vật tư theo BOM × số thực tế,
--    cộng thành phẩm; giá vốn thành phẩm = tổng chi phí nguyên liệu / số thành phẩm đạt.
CREATE TABLE IF NOT EXISTS warehouse_production_orders (
  id               TEXT PRIMARY KEY,
  warehouse_id     TEXT NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  code             TEXT NOT NULL,              -- LO-2026-0001
  finished_item_id TEXT NOT NULL REFERENCES warehouse_items(id) ON DELETE CASCADE,
  bom_id           TEXT REFERENCES warehouse_boms(id) ON DELETE SET NULL,
  planned_qty      NUMERIC(14, 2) NOT NULL CHECK (planned_qty > 0),
  actual_qty       NUMERIC(14, 2),             -- số thành phẩm ĐẠT (điền khi hoàn thành)
  waste_qty        NUMERIC(14, 2) NOT NULL DEFAULT 0,  -- phế phẩm (vẫn tiêu nguyên liệu, không nhập kho)
  status           TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft', 'in_progress', 'completed', 'cancelled')),
  material_cost    NUMERIC(18, 2),             -- tổng chi phí NVL đã trừ (đồng) — chốt khi hoàn thành
  unit_cost        NUMERIC(18, 2),             -- giá vốn 1 thành phẩm = material_cost / actual_qty
  note             TEXT,
  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at       TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_wh_po_code ON warehouse_production_orders(warehouse_id, code);
CREATE INDEX IF NOT EXISTS idx_wh_po_wh ON warehouse_production_orders(warehouse_id, status, created_at DESC);

-- 5) Đợt xuất kho + kiểm đếm bằng quét SKU/barcode.
CREATE TABLE IF NOT EXISTS warehouse_shipments (
  id            TEXT PRIMARY KEY,
  warehouse_id  TEXT NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  code          TEXT NOT NULL,                 -- XK-2026-0001
  customer      TEXT,                          -- khách / nơi nhận
  status        TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'counting', 'shipped', 'cancelled')),
  note          TEXT,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  shipped_at    TIMESTAMPTZ,
  shipped_by    UUID REFERENCES users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_wh_shipment_code ON warehouse_shipments(warehouse_id, code);
CREATE INDEX IF NOT EXISTS idx_wh_shipments_wh ON warehouse_shipments(warehouse_id, status, created_at DESC);

-- Dòng hàng dự kiến của đợt xuất; qty_counted tăng dần theo từng lần quét.
CREATE TABLE IF NOT EXISTS warehouse_shipment_lines (
  id           TEXT PRIMARY KEY,
  shipment_id  TEXT NOT NULL REFERENCES warehouse_shipments(id) ON DELETE CASCADE,
  item_id      TEXT NOT NULL REFERENCES warehouse_items(id) ON DELETE CASCADE,
  qty_planned  NUMERIC(14, 2) NOT NULL CHECK (qty_planned > 0),
  qty_counted  NUMERIC(14, 2) NOT NULL DEFAULT 0,
  UNIQUE (shipment_id, item_id)
);

-- Log TỪNG LẦN QUÉT — bằng chứng kiểm đếm, đối chiếu khi lệch số.
CREATE TABLE IF NOT EXISTS warehouse_shipment_scans (
  id           TEXT PRIMARY KEY,
  shipment_id  TEXT NOT NULL REFERENCES warehouse_shipments(id) ON DELETE CASCADE,
  item_id      TEXT NOT NULL REFERENCES warehouse_items(id) ON DELETE CASCADE,
  quantity     NUMERIC(14, 2) NOT NULL,        -- +units_per_carton (quét thùng) hoặc +1 (quét lẻ); âm = trừ nhầm
  scanned_code TEXT,                           -- mã thô đã quét (đối chiếu)
  scanned_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wh_ship_scans ON warehouse_shipment_scans(shipment_id, created_at);

-- 6) Vật tư (mig 288) thêm đơn giá cho lượt NHẬP — để cuộn giá vốn thành phẩm có cả
--    chi phí đóng gói. Lượt nhập cũ không có giá → coi 0 đồng trong bình quân.
ALTER TABLE warehouse_supply_moves
  ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(18, 2);
