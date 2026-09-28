-- Migration 117: phân loại quyền mẫu hệ thống + thứ tự hiển thị
-- is_system: đánh dấu 4 mẫu mặc định (Toàn quyền/Quản trị/Quản lý/Nhân viên) để hiển thị khác
--            và phục vụ chức năng "Khôi phục mẫu gốc". Vẫn cho phép sửa/xóa như mẫu thường.
ALTER TABLE permission_presets
  ADD COLUMN IF NOT EXISTS is_system  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 100;
