-- Migration 114: thêm company_id vào leave_types để mỗi công ty có loại phép riêng
-- NULL = loại phép toàn hệ thống (dùng chung), non-null = chỉ riêng công ty đó
-- companies.id là UUID (migration 012) → company_id phải UUID, nếu để TEXT thì
-- foreign key không tạo được (lỗi 42804: foreign key constraint cannot be implemented)
ALTER TABLE leave_types
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL;
