-- Migration 139: Thêm FK manager_user_id + owner_company_id vào domains
-- manager_user_id khớp kiểu users.id (UUID hoặc TEXT tùy DB) → dùng DO block tự thích ứng.
-- owner_company_id: companies.id luôn là UUID.
ALTER TABLE domains
  ADD COLUMN IF NOT EXISTS owner_company_id UUID REFERENCES companies(id) ON DELETE SET NULL;

DO $$
DECLARE uid_type text;
BEGIN
  SELECT data_type INTO uid_type FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'id';
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'domains' AND column_name = 'manager_user_id') THEN
    EXECUTE format(
      'ALTER TABLE domains ADD COLUMN manager_user_id %s REFERENCES users(id) ON DELETE SET NULL',
      uid_type);
  END IF;
END $$;
