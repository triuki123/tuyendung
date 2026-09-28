-- Migration 116: Quyền mẫu tùy chỉnh (custom permission presets)
-- Cho phép admin lưu một bộ quyền (module mẹ + con) thành mẫu đặt tên, áp dụng lại cho người dùng.
CREATE TABLE IF NOT EXISTS permission_presets (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  permissions JSONB NOT NULL DEFAULT '{}',
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_permission_presets_name ON permission_presets (name);
