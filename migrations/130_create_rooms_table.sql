-- Migration 130: Tạo bảng rooms (danh sách phòng họp có thể đặt)
CREATE TABLE IF NOT EXISTS rooms (
  id          TEXT PRIMARY KEY,
  name        TEXT    NOT NULL UNIQUE,
  capacity    INTEGER,
  location    TEXT,
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Nếu bảng rooms đã tồn tại sẵn theo schema cũ (thiếu cột), bổ sung cho đủ
-- để câu INSERT bên dưới không lỗi (42703: column does not exist).
ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS capacity    INTEGER,
  ADD COLUMN IF NOT EXISTS location    TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS is_active   BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Seed dữ liệu mẫu — dùng WHERE NOT EXISTS thay vì ON CONFLICT để không phụ
-- thuộc vào unique/PK constraint (bảng rooms cũ có thể thiếu PK trên id → 42P10).
INSERT INTO rooms (id, name, capacity, location, description)
SELECT v.id, v.name, v.capacity, v.location, v.description
FROM (VALUES
  ('room-001', 'Phòng Họp A', 10, 'Tầng 2', 'Phòng họp nhỏ, màn chiếu, điều hòa'),
  ('room-002', 'Phòng Họp B', 20, 'Tầng 3', 'Phòng họp lớn, TV 75 inch, bảng trắng'),
  ('room-003', 'Phòng Đào Tạo', 30, 'Tầng 4', 'Phòng đào tạo, máy chiếu, âm thanh')
) AS v(id, name, capacity, location, description)
WHERE NOT EXISTS (SELECT 1 FROM rooms r WHERE r.id = v.id);
