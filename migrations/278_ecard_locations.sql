-- Migration 278: thêm mục "Trụ sở & Chi nhánh" (locations) cho Hồ Sơ Năng Lực.
-- Mảng [{label, address, phone}] — địa chỉ trụ sở/chi nhánh/văn phòng của doanh nghiệp.
-- Thêm cho cả 3 bảng ecard để service/editor dùng chung không lệch schema.
ALTER TABLE user_ecards
  ADD COLUMN IF NOT EXISTS locations JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE user_ecard_variants
  ADD COLUMN IF NOT EXISTS locations JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE company_ecards
  ADD COLUMN IF NOT EXISTS locations JSONB NOT NULL DEFAULT '[]'::jsonb;
