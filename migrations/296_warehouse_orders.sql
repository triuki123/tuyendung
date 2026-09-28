-- Migration 296: ĐƠN HÀNG kho/xưởng — xương sống nối trục A-Z
-- "Đơn hàng khách → nổ lệnh sản xuất nhiều cấp → nhập thành phẩm → xuất theo đơn"
--
-- Trước 296: sản xuất (295) và xuất hàng (295) là 2 trục rời, không biết "làm cho ai".
-- 296 CHỈ THÊM (bảng mới + cột nullable) — luồng lô SX rời / đợt xuất rời cũ chạy y hệt.

-- ===== 1. Đơn hàng =====
CREATE TABLE IF NOT EXISTS warehouse_orders (
  id               TEXT PRIMARY KEY,
  warehouse_id     TEXT NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  code             TEXT NOT NULL,               -- DH-2026-0001 (sinh nguyên tử qua counter)
  customer_name    TEXT NOT NULL,
  customer_contact TEXT,
  -- draft: mới tạo | confirmed: chốt đơn | in_production: đã nổ lệnh SX
  -- ready: đủ tồn mọi line | shipped: đã xuất đủ | cancelled
  status           TEXT NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft', 'confirmed', 'in_production', 'ready', 'shipped', 'cancelled')),
  expected_date    DATE,
  note             TEXT,
  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at     TIMESTAMPTZ,
  shipped_at       TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_wh_orders_code ON warehouse_orders(warehouse_id, code);
CREATE INDEX IF NOT EXISTS idx_wh_orders_wh ON warehouse_orders(warehouse_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS warehouse_order_lines (
  id        TEXT PRIMARY KEY,
  order_id  TEXT NOT NULL REFERENCES warehouse_orders(id) ON DELETE CASCADE,
  item_id   TEXT NOT NULL REFERENCES warehouse_items(id) ON DELETE CASCADE,
  quantity  NUMERIC(14,2) NOT NULL CHECK (quantity > 0),
  UNIQUE (order_id, item_id)
);

-- ===== 2. Counter sinh mã NGUYÊN TỬ (khuôn solace_order_code_counters) =====
-- Thay cho nextCode() COUNT(*) — không trùng khi xóa bản ghi hoặc 2 người tạo cùng lúc.
CREATE TABLE IF NOT EXISTS warehouse_code_counters (
  warehouse_id TEXT NOT NULL,
  prefix       TEXT NOT NULL,
  year         INTEGER NOT NULL,
  seq          INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (warehouse_id, prefix, year)
);

-- ===== 3. Nối 2 trục hiện có vào đơn hàng (nullable — không gãy luồng cũ) =====
ALTER TABLE warehouse_production_orders
  ADD COLUMN IF NOT EXISTS order_id TEXT REFERENCES warehouse_orders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_wh_po_order ON warehouse_production_orders(order_id) WHERE order_id IS NOT NULL;

ALTER TABLE warehouse_shipments
  ADD COLUMN IF NOT EXISTS order_id TEXT REFERENCES warehouse_orders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_wh_ship_order ON warehouse_shipments(order_id) WHERE order_id IS NOT NULL;

-- ===== 4. Sản lượng công nhân gắn LÔ SX (đối chiếu người khai vs kho nhận) =====
ALTER TABLE warehouse_output
  ADD COLUMN IF NOT EXISTS production_order_id TEXT REFERENCES warehouse_production_orders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_wh_output_po ON warehouse_output(production_order_id) WHERE production_order_id IS NOT NULL;

-- ===== 5. Bán thành phẩm 'semi' cho cây sản xuất nhiều cấp =====
-- (dừa thô[raw] → dừa gọt[semi] → thùng dừa[finished])
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'warehouse_items_item_type_check') THEN
    ALTER TABLE warehouse_items DROP CONSTRAINT warehouse_items_item_type_check;
  END IF;
  ALTER TABLE warehouse_items
    ADD CONSTRAINT warehouse_items_item_type_check CHECK (item_type IN ('raw', 'semi', 'finished'));
EXCEPTION WHEN duplicate_object THEN NULL;  -- chạy lại lần 2 không lỗi
END $$;

-- ===== 6. Siết integrity: 2 cột TEXT trần của sổ kho thành FK thật =====
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_wh_stock_moves_po') THEN
    ALTER TABLE warehouse_stock_moves
      ADD CONSTRAINT fk_wh_stock_moves_po FOREIGN KEY (production_order_id)
      REFERENCES warehouse_production_orders(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_wh_stock_moves_shipment') THEN
    ALTER TABLE warehouse_stock_moves
      ADD CONSTRAINT fk_wh_stock_moves_shipment FOREIGN KEY (shipment_id)
      REFERENCES warehouse_shipments(id) ON DELETE SET NULL;
  END IF;
END $$;
