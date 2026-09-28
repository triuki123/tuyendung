-- Migration 094: Thêm loại hợp đồng "Hồ sơ thôi việc" (dùng khi chấm dứt thử việc)
INSERT INTO public.contract_types (id, name, description, sort_order, is_active)
VALUES ('ctype_termination', 'Hồ sơ thôi việc', 'Hồ sơ chấm dứt hợp đồng / thôi việc', 10, true)
ON CONFLICT (id) DO NOTHING;
