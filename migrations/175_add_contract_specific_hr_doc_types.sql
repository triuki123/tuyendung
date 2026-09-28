-- Migration 175: Thêm hr_document_types tương ứng với từng loại hợp đồng
-- Để archive hợp đồng giữ đúng loại thay vì hardcode 'hdoc_contract'
INSERT INTO public.hr_document_types (id, name, sort_order) VALUES
  ('hdoc_probation',    'Thử việc',                       7),
  ('hdoc_cooperation',  'Thỏa thuận hợp tác',             8),
  ('hdoc_nda',          'Thỏa thuận bảo mật thông tin',   9),
  ('hdoc_termination',  'Hồ sơ thôi việc',               10)
ON CONFLICT (id) DO NOTHING;
