-- Migration 058: Tạo bảng contacts cho module Đầu Mối Liên Hệ
-- Hỗ trợ cả nhân sự nội bộ (user_id link) và liên hệ bên ngoài (user_id NULL)

CREATE TABLE IF NOT EXISTS public.contacts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID,
  name        TEXT NOT NULL,
  title       TEXT,
  department  TEXT,
  area        TEXT,
  phone       TEXT,
  email       TEXT,
  avatar      TEXT,
  note        TEXT,
  is_active   BOOLEAN DEFAULT true,
  sort_order  INTEGER DEFAULT 0,
  created_by  UUID,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contacts_is_active  ON public.contacts(is_active);
CREATE INDEX IF NOT EXISTS idx_contacts_sort_order ON public.contacts(sort_order ASC);
CREATE INDEX IF NOT EXISTS idx_contacts_user_id    ON public.contacts(user_id);

SELECT 'Migration 058: contacts table created' AS migration_status;
