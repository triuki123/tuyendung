-- Migration 194: loại hồ sơ "Biên bản đánh giá thử việc"
-- Dùng để TỰ ĐỘNG lưu biên bản vào hồ sơ nhân sự khi đánh giá thử việc ĐẠT.
INSERT INTO public.hr_document_types (id, name, sort_order) VALUES
  ('hdoc_probation_eval', 'Biên bản đánh giá thử việc', 6)
ON CONFLICT (id) DO NOTHING;
