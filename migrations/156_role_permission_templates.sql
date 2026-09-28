-- Migration 156: bảng lưu quyền mặc định theo vai trò
CREATE TABLE IF NOT EXISTS role_permission_templates (
  role               TEXT PRIMARY KEY,
  module_permissions JSONB NOT NULL DEFAULT '{}',
  updated_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_by         TEXT
);

-- Seed 3 row mặc định (rỗng — admin tự cấu hình qua UI)
INSERT INTO role_permission_templates (role, module_permissions)
VALUES
  ('user',    '{}'),
  ('manager', '{}'),
  ('admin',   '{}')
ON CONFLICT (role) DO NOTHING;
