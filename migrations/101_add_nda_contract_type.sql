-- Migration 101: loại hợp đồng "Thỏa thuận bảo mật thông tin" (NDA)
-- Phục vụ tự động tạo bản nháp khi nhân sự sắp vào làm (cùng "Thỏa thuận hợp tác" ctype_cooperation).
-- "Thỏa thuận hợp tác" đã có sẵn (ctype_cooperation), chỉ cần bổ sung NDA.

INSERT INTO contract_types (id, name, sort_order)
VALUES ('ctype_nda', 'Thỏa thuận bảo mật thông tin', 5)
ON CONFLICT (id) DO NOTHING;

SELECT 'Migration 101: ctype_nda added' AS migration_status;
