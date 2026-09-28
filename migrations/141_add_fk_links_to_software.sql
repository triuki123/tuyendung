-- Migration 141: Liên kết software với company / manager (users) / department
-- manager_user_id khớp kiểu users.id (UUID hoặc TEXT) → DO block tự thích ứng.
-- companies.id / departments.id luôn là UUID.
ALTER TABLE software
  ADD COLUMN IF NOT EXISTS company_id    UUID REFERENCES companies(id)   ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE SET NULL;

DO $$
DECLARE uid_type text;
BEGIN
  SELECT data_type INTO uid_type FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'id';
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'software' AND column_name = 'manager_user_id') THEN
    EXECUTE format(
      'ALTER TABLE software ADD COLUMN manager_user_id %s REFERENCES users(id) ON DELETE SET NULL',
      uid_type);
  END IF;
END $$;
