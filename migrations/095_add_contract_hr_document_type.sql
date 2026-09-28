-- Migration 095: Thêm loại tài liệu "Hợp đồng" vào kho Hồ Sơ (cho hợp đồng lưu trữ tự động)
INSERT INTO public.hr_document_types (id, name, description, sort_order, is_active)
VALUES ('hdoc_contract', 'Hợp đồng', 'Hợp đồng lao động đã lưu trữ tự động khi hoàn tất', 6, true)
ON CONFLICT (id) DO NOTHING;
