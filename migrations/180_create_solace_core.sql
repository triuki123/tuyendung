-- Migration 180: Module SOLACE (quán cà phê nội bộ) — schema lõi
-- Catalog (danh mục/món/tuỳ chọn), Kho (nguyên liệu/công thức/xuất nhập),
-- Đơn hàng (orders/order_items) + bộ đếm sinh mã đơn.
-- Tiền lưu BIGINT theo đồng VND (không số lẻ). ID là TEXT do app sinh.
-- Idempotent: dùng IF NOT EXISTS toàn bộ.

-- ─── DANH MỤC & THỰC ĐƠN ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.solace_categories (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.solace_products (
  id            TEXT PRIMARY KEY,
  code          TEXT,
  category_id   TEXT REFERENCES public.solace_categories(id) ON DELETE SET NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  price         BIGINT NOT NULL DEFAULT 0,        -- đồng VND
  track_recipe  BOOLEAN NOT NULL DEFAULT TRUE,    -- trừ kho theo công thức khi bán?
  has_image     BOOLEAN NOT NULL DEFAULT FALSE,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,    -- bật/tắt món
  sort_order    INTEGER NOT NULL DEFAULT 0,
  sold_count    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_solace_products_code
  ON public.solace_products (lower(code)) WHERE code IS NOT NULL AND code <> '';
CREATE INDEX IF NOT EXISTS idx_solace_products_category ON public.solace_products (category_id);

-- Ảnh món (BYTEA) — 1 ảnh / món, serve qua /api/solace/products/[id]/image
CREATE TABLE IF NOT EXISTS public.solace_product_images (
  product_id  TEXT PRIMARY KEY REFERENCES public.solace_products(id) ON DELETE CASCADE,
  mime_type   TEXT NOT NULL,
  content     BYTEA NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── TUỲ CHỌN MÓN (đường / đá / size / topping) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.solace_option_groups (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,                       -- vd "Đường", "Đá", "Size"
  selection_type  TEXT NOT NULL DEFAULT 'single',      -- 'single' | 'multi'
  is_required     BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.solace_option_values (
  id          TEXT PRIMARY KEY,
  group_id    TEXT NOT NULL REFERENCES public.solace_option_groups(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,                           -- vd "Ít đường", "100%", "Size L"
  extra_price BIGINT NOT NULL DEFAULT 0,               -- giá cộng thêm (đồng)
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_solace_option_values_group ON public.solace_option_values (group_id);

-- Gắn nhóm tuỳ chọn vào món (nhiều-nhiều)
CREATE TABLE IF NOT EXISTS public.solace_product_options (
  product_id  TEXT NOT NULL REFERENCES public.solace_products(id) ON DELETE CASCADE,
  group_id    TEXT NOT NULL REFERENCES public.solace_option_groups(id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, group_id)
);

-- ─── KHO NGUYÊN LIỆU & CÔNG THỨC ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.solace_ingredients (
  id          TEXT PRIMARY KEY,
  code        TEXT,
  name        TEXT NOT NULL,
  unit        TEXT NOT NULL DEFAULT 'g',               -- g | ml | cái | gói...
  stock_qty   NUMERIC(14,3) NOT NULL DEFAULT 0,        -- tồn hiện tại
  min_qty     NUMERIC(14,3) NOT NULL DEFAULT 0,        -- ngưỡng cảnh báo
  avg_cost    BIGINT NOT NULL DEFAULT 0,               -- giá vốn TB / đơn vị (đồng)
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_solace_ingredients_code
  ON public.solace_ingredients (lower(code)) WHERE code IS NOT NULL AND code <> '';

-- Định mức công thức: 1 món gồm nhiều nguyên liệu, có khấu hao (%) hao hụt
CREATE TABLE IF NOT EXISTS public.solace_recipe_items (
  id            TEXT PRIMARY KEY,
  product_id    TEXT NOT NULL REFERENCES public.solace_products(id) ON DELETE CASCADE,
  ingredient_id TEXT NOT NULL REFERENCES public.solace_ingredients(id) ON DELETE CASCADE,
  qty           NUMERIC(14,3) NOT NULL DEFAULT 0,      -- định mức / 1 phần
  wastage_pct   NUMERIC(5,2) NOT NULL DEFAULT 0,       -- % khấu hao hao hụt
  UNIQUE (product_id, ingredient_id)
);
CREATE INDEX IF NOT EXISTS idx_solace_recipe_product ON public.solace_recipe_items (product_id);

-- Biến động kho (nhập / xuất bán / điều chỉnh / hao hụt)
CREATE TABLE IF NOT EXISTS public.solace_stock_movements (
  id            TEXT PRIMARY KEY,
  ingredient_id TEXT NOT NULL REFERENCES public.solace_ingredients(id) ON DELETE CASCADE,
  type          TEXT NOT NULL,                         -- 'in' | 'out' | 'adjust' | 'waste'
  qty           NUMERIC(14,3) NOT NULL,                -- dương = tăng tồn, âm = giảm tồn
  unit_cost     BIGINT NOT NULL DEFAULT 0,             -- giá vốn / đơn vị tại thời điểm
  balance_after NUMERIC(14,3) NOT NULL DEFAULT 0,
  reason        TEXT,                                  -- 'sale' | 'purchase' | 'stocktake'...
  ref_type      TEXT,                                  -- 'order' | 'stocktake'...
  ref_id        TEXT,
  note          TEXT,
  performed_by  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_solace_stock_mov_ing ON public.solace_stock_movements (ingredient_id, created_at);
CREATE INDEX IF NOT EXISTS idx_solace_stock_mov_ref ON public.solace_stock_movements (ref_type, ref_id);

-- ─── ĐƠN HÀNG ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.solace_orders (
  id               TEXT PRIMARY KEY,
  code             TEXT,
  channel          TEXT NOT NULL DEFAULT 'pos',         -- 'pos' | 'web'
  customer_user_id TEXT,                                -- NULL nếu khách vãng lai tại quầy
  customer_name    TEXT,
  status           TEXT NOT NULL DEFAULT 'pending',     -- pending|preparing|ready|done|cancelled
  fulfillment_type TEXT NOT NULL DEFAULT 'counter',     -- 'counter' (tại quầy) | 'dine_in' (tại chỗ)
  floor_note       TEXT,                                -- bắt buộc khi dine_in
  subtotal         BIGINT NOT NULL DEFAULT 0,
  discount         BIGINT NOT NULL DEFAULT 0,
  total            BIGINT NOT NULL DEFAULT 0,
  payment_method   TEXT,                                -- 'wallet' | 'bankqr' | 'cash'
  payment_status   TEXT NOT NULL DEFAULT 'unpaid',      -- unpaid|paid|partial|debt
  paid_amount      BIGINT NOT NULL DEFAULT 0,
  note             TEXT,
  pickup_time      TIMESTAMPTZ,                         -- giờ nhận mong muốn (đặt webapp)
  business_date    DATE,                                -- ngày kinh doanh (giờ VN) cho kết ca
  created_by       TEXT,
  served_by        TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at          TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_solace_orders_code
  ON public.solace_orders (lower(code)) WHERE code IS NOT NULL AND code <> '';
CREATE INDEX IF NOT EXISTS idx_solace_orders_customer ON public.solace_orders (customer_user_id);
CREATE INDEX IF NOT EXISTS idx_solace_orders_status ON public.solace_orders (status);
CREATE INDEX IF NOT EXISTS idx_solace_orders_bizdate ON public.solace_orders (business_date);
CREATE INDEX IF NOT EXISTS idx_solace_orders_paystatus ON public.solace_orders (payment_status);

CREATE TABLE IF NOT EXISTS public.solace_order_items (
  id            TEXT PRIMARY KEY,
  order_id      TEXT NOT NULL REFERENCES public.solace_orders(id) ON DELETE CASCADE,
  product_id    TEXT,                                  -- giữ lịch sử kể cả khi món bị xoá
  name_snapshot TEXT NOT NULL,                          -- tên món tại thời điểm bán
  unit_price    BIGINT NOT NULL DEFAULT 0,              -- giá gốc + tuỳ chọn / 1 phần
  qty           INTEGER NOT NULL DEFAULT 1,
  line_total    BIGINT NOT NULL DEFAULT 0,
  options_json  JSONB,                                  -- snapshot tuỳ chọn đã chọn
  note          TEXT
);
CREATE INDEX IF NOT EXISTS idx_solace_order_items_order ON public.solace_order_items (order_id);

-- Bộ đếm sinh mã đơn (nguyên tử, reset theo ngày) — scope = "YYYY-MM-DD" (giờ VN)
CREATE TABLE IF NOT EXISTS public.solace_order_code_counters (
  scope      TEXT PRIMARY KEY,
  last_seq   INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
