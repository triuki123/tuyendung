-- Migration 312: persist user-managed CV industry folders, including empty ones.
CREATE TABLE IF NOT EXISTS hr_cv_industries (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_cv_industries_name_active
  ON hr_cv_industries (LOWER(name))
  WHERE deleted_at IS NULL;

INSERT INTO hr_cv_industries (id, name)
VALUES
  ('cvi_accounting', 'Kế toán - Kiểm toán'),
  ('cvi_it', 'Công nghệ thông tin'),
  ('cvi_sales', 'Kinh doanh - Bán hàng'),
  ('cvi_marketing', 'Marketing - Truyền thông'),
  ('cvi_hr', 'Nhân sự - Hành chính'),
  ('cvi_finance', 'Tài chính - Ngân hàng'),
  ('cvi_operations', 'Vận hành - Kho vận'),
  ('cvi_engineering', 'Kỹ thuật - Sản xuất'),
  ('cvi_customer_service', 'Chăm sóc khách hàng')
ON CONFLICT DO NOTHING;

-- Preserve industries already assigned before folder management existed.
INSERT INTO hr_cv_industries (id, name)
SELECT 'cvi_' || md5(LOWER(BTRIM(industry))), BTRIM(industry)
FROM hr_cv_pool
WHERE deleted_at IS NULL AND BTRIM(COALESCE(industry, '')) <> ''
GROUP BY BTRIM(industry)
ON CONFLICT DO NOTHING;
