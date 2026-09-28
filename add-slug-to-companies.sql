-- Thêm cột slug vào bảng companies với hàm generate slug

-- 1. Tạo function để generate slug từ tên
CREATE OR REPLACE FUNCTION generate_slug(text_input VARCHAR)
RETURNS VARCHAR AS $$
BEGIN
  RETURN LOWER(REPLACE(REPLACE(REPLACE(TRIM(text_input), ' ', '-'), 'đ', 'd'), '--', '-'));
END;
$$ LANGUAGE plpgsql;

-- 2. Thêm cột slug (nếu chưa có)
ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS slug VARCHAR(255) UNIQUE;

-- 3. Tạo index cho slug
CREATE INDEX IF NOT EXISTS idx_companies_slug ON public.companies(slug);

-- 4. Update slug từ name cho các records hiện tại (nếu slug rỗng)
UPDATE public.companies
SET slug = generate_slug(name)
WHERE slug IS NULL OR slug = '';

-- 5. Đảm bảo slug NOT NULL
ALTER TABLE public.companies
ALTER COLUMN slug SET NOT NULL;

-- 6. Verify kết quả
SELECT id, name, slug FROM public.companies LIMIT 10;
SELECT COUNT(*) as total FROM public.companies;
