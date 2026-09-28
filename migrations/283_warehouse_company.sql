-- Migration 283: kho gắn công ty chủ quản — ai thuộc công ty (và có quyền RBAC
-- warehouse) mới thấy kho; NULL = chỉ quản lý được gán đích danh + super_admin.
ALTER TABLE warehouses
  ADD COLUMN IF NOT EXISTS company_id UUID;
