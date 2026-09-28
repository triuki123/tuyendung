-- Migration 132: Tạo lại bảng contacts với schema mới
-- Schema cũ (migration 058) dùng UUID + cột name/title/department... không khớp service
-- Schema mới: id TEXT, user_id TEXT, responsibility (thay name), không lưu thông tin trực tiếp

-- Backup bảng cũ nếu tồn tại (để không mất dữ liệu)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'name'
  ) THEN
    -- Bảng cũ có cột 'name' → đổi tên backup
    ALTER TABLE contacts RENAME TO contacts_backup_v1;
  END IF;
END $$;

-- Tạo bảng mới đúng schema service
CREATE TABLE IF NOT EXISTS contacts (
  id              TEXT PRIMARY KEY,
  user_id         TEXT,
  responsibility  TEXT NOT NULL,
  note            TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_by      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contacts_is_active  ON contacts (is_active);
CREATE INDEX IF NOT EXISTS idx_contacts_sort_order ON contacts (sort_order ASC);
CREATE INDEX IF NOT EXISTS idx_contacts_user_id    ON contacts (user_id);
