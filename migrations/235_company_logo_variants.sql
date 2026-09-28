-- Migration 235: đa biến thể logo công ty (full_light / full_dark / icon / print)
-- Trước đây mỗi công ty chỉ 1 logo (company_logos PK = company_id).
-- Đổi sang nhiều biến thể / công ty: PK = (company_id, variant). Logo cũ = biến thể 'full_light' (primary).
-- Idempotent, KHÔNG mất dữ liệu, KHÔNG đổi hành vi hiển thị (consumer fallback về full_light).

-- 1) Thêm cột variant, mặc định 'full_light' → dòng logo đơn hiện có tự thành biến thể chính.
ALTER TABLE company_logos ADD COLUMN IF NOT EXISTS variant TEXT NOT NULL DEFAULT 'full_light';

-- 2) Đổi khoá chính company_id → (company_id, variant).
ALTER TABLE company_logos DROP CONSTRAINT IF EXISTS company_logos_pkey;
ALTER TABLE company_logos ADD  PRIMARY KEY (company_id, variant);

-- 3) Map biến thể → URL động (kèm version bust cache). Giữ companies.logo_url = URL của full_light (alias cũ).
ALTER TABLE companies ADD COLUMN IF NOT EXISTS logo_urls JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 4) Backfill: logo_url hiện tại chính là biến thể full_light → ghi vào logo_urls.
UPDATE companies
   SET logo_urls = jsonb_build_object('full_light', logo_url)
 WHERE logo_url IS NOT NULL
   AND (logo_urls IS NULL OR logo_urls = '{}'::jsonb);
