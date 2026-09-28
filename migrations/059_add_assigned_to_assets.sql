-- Migration 059: Thêm cột assigned_to vào bảng assets
-- Dùng để tra cứu tài sản cá nhân và tài sản cấp dưới (manager)

ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS assigned_to UUID;

CREATE INDEX IF NOT EXISTS idx_assets_assigned_to ON public.assets(assigned_to);

SELECT 'Migration 059: assets.assigned_to column added' AS migration_status;
