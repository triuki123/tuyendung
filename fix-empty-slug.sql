-- Fix empty slug in companies table
-- Script này xóa các records có slug rỗng và thêm constraint NOT NULL

-- 1. Xem các records có slug rỗng
SELECT id, name, slug FROM public.companies WHERE slug IS NULL OR slug = '';

-- 2. Xóa các records có slug rỗng (nếu có)
DELETE FROM public.companies WHERE slug IS NULL OR slug = '';

-- 3. Thêm constraint NOT NULL cho slug (nếu chưa có)
ALTER TABLE public.companies
ALTER COLUMN slug SET NOT NULL;

-- 4. Verify kết quả
SELECT COUNT(*) as total_companies FROM public.companies;
SELECT * FROM public.companies LIMIT 10;
