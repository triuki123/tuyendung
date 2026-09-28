-- Migration 280: Module Warehouse — mini-site quản lý công nhân kho/xưởng (/warehouse)
-- Tách biệt hoàn toàn với bảng users của app chính.

-- Kho/xưởng (đa kho ngay từ đầu)
CREATE TABLE IF NOT EXISTS warehouses (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  code          TEXT NOT NULL UNIQUE,
  address       TEXT,
  -- Chấm công GPS
  lat           DOUBLE PRECISION,
  lng           DOUBLE PRECISION,
  radius_m      INTEGER NOT NULL DEFAULT 200,
  -- Cấu hình
  photo_retention_days INTEGER NOT NULL DEFAULT 40,
  report_emails TEXT[] NOT NULL DEFAULT '{}',
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Người quản lý kho = user thường của AssetFlow (users.id là UUID)
CREATE TABLE IF NOT EXISTS warehouse_managers (
  warehouse_id  TEXT NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (warehouse_id, user_id)
);

-- Ca làm việc (nhiều ca, nhiều giờ)
CREATE TABLE IF NOT EXISTS warehouse_shifts (
  id            TEXT PRIMARY KEY,
  warehouse_id  TEXT NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  start_time    TIME NOT NULL,
  end_time      TIME NOT NULL,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Công nhân (KHÔNG nằm trong users của app chính)
CREATE TABLE IF NOT EXISTS warehouse_workers (
  id            TEXT PRIMARY KEY,
  warehouse_id  TEXT NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  full_name     TEXT NOT NULL,
  dob           DATE,
  contact       TEXT,                        -- SĐT / địa chỉ liên hệ
  cccd          TEXT NOT NULL UNIQUE,        -- Căn cước công dân — khóa nhận diện
  pin_hash      TEXT NOT NULL,               -- bcrypt của mã PIN
  shift_id      TEXT REFERENCES warehouse_shifts(id) ON DELETE SET NULL,
  status        TEXT NOT NULL DEFAULT 'active',   -- active | inactive
  created_by    UUID,                        -- user AssetFlow tạo tài khoản
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deactivated_at TIMESTAMPTZ,
  note          TEXT
);
CREATE INDEX IF NOT EXISTS idx_wh_workers_wh ON warehouse_workers(warehouse_id, status);

-- Ảnh chấm công (BYTEA, tự purge sau photo_retention_days)
CREATE TABLE IF NOT EXISTS warehouse_photos (
  id            TEXT PRIMARY KEY,
  worker_id     TEXT NOT NULL REFERENCES warehouse_workers(id) ON DELETE CASCADE,
  content       BYTEA NOT NULL,
  mime_type     TEXT NOT NULL DEFAULT 'image/jpeg',
  size_bytes    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wh_photos_created ON warehouse_photos(created_at);

-- Chấm công theo ngày
CREATE TABLE IF NOT EXISTS warehouse_attendance (
  id            TEXT PRIMARY KEY,
  warehouse_id  TEXT NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  worker_id     TEXT NOT NULL REFERENCES warehouse_workers(id) ON DELETE CASCADE,
  work_date     DATE NOT NULL,
  shift_id      TEXT REFERENCES warehouse_shifts(id) ON DELETE SET NULL,
  check_in_at   TIMESTAMPTZ,
  check_out_at  TIMESTAMPTZ,
  check_in_photo_id  TEXT REFERENCES warehouse_photos(id) ON DELETE SET NULL,
  check_out_photo_id TEXT REFERENCES warehouse_photos(id) ON DELETE SET NULL,
  check_in_lat  DOUBLE PRECISION,
  check_in_lng  DOUBLE PRECISION,
  check_out_lat DOUBLE PRECISION,
  check_out_lng DOUBLE PRECISION,
  check_in_method  TEXT,                     -- gps | qr | manual
  check_out_method TEXT,
  missing_checkout BOOLEAN NOT NULL DEFAULT FALSE,  -- quên check-out, chờ quản lý sửa
  adjusted_by   UUID,                        -- quản lý sửa tay
  note          TEXT,
  UNIQUE (worker_id, work_date)
);
CREATE INDEX IF NOT EXISTS idx_wh_att_wh_date ON warehouse_attendance(warehouse_id, work_date);

-- Loại sản phẩm / công đoạn (đơn vị riêng)
CREATE TABLE IF NOT EXISTS warehouse_products (
  id            TEXT PRIMARY KEY,
  warehouse_id  TEXT NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  unit          TEXT NOT NULL DEFAULT 'cái',
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sản lượng theo ngày (quản lý nhập cuối ngày)
CREATE TABLE IF NOT EXISTS warehouse_output (
  id            TEXT PRIMARY KEY,
  warehouse_id  TEXT NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  worker_id     TEXT NOT NULL REFERENCES warehouse_workers(id) ON DELETE CASCADE,
  product_id    TEXT NOT NULL REFERENCES warehouse_products(id) ON DELETE CASCADE,
  work_date     DATE NOT NULL,
  quantity      NUMERIC NOT NULL DEFAULT 0,
  entered_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (worker_id, product_id, work_date)
);
CREATE INDEX IF NOT EXISTS idx_wh_output_wh_date ON warehouse_output(warehouse_id, work_date);

-- Bảng tin kho
CREATE TABLE IF NOT EXISTS warehouse_posts (
  id            TEXT PRIMARY KEY,
  warehouse_id  TEXT NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  content       TEXT NOT NULL DEFAULT '',
  pinned        BOOLEAN NOT NULL DEFAULT FALSE,
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Đơn xin nghỉ đơn giản
CREATE TABLE IF NOT EXISTS warehouse_leave_requests (
  id            TEXT PRIMARY KEY,
  warehouse_id  TEXT NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  worker_id     TEXT NOT NULL REFERENCES warehouse_workers(id) ON DELETE CASCADE,
  from_date     DATE NOT NULL,
  to_date       DATE NOT NULL,
  reason        TEXT,
  status        TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  decided_by    UUID,
  decided_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wh_leave_wh ON warehouse_leave_requests(warehouse_id, status);

-- Ứng lương / tạm ứng
CREATE TABLE IF NOT EXISTS warehouse_advances (
  id            TEXT PRIMARY KEY,
  warehouse_id  TEXT NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  worker_id     TEXT NOT NULL REFERENCES warehouse_workers(id) ON DELETE CASCADE,
  amount        BIGINT NOT NULL,             -- đồng VND, số nguyên
  reason        TEXT,
  status        TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  decided_by    UUID,
  decided_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wh_adv_wh ON warehouse_advances(warehouse_id, status);

-- Log chống gửi trùng báo cáo tháng
CREATE TABLE IF NOT EXISTS warehouse_report_log (
  warehouse_id  TEXT NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  report_month  TEXT NOT NULL,               -- 'YYYY-MM'
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (warehouse_id, report_month)
);
