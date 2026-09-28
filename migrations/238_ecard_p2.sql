-- Migration 238: P2 hồ sơ năng lực — ảnh bìa, thứ tự section, lượt xem + kho ảnh.
ALTER TABLE user_ecards
  ADD COLUMN IF NOT EXISTS cover_url     TEXT,
  ADD COLUMN IF NOT EXISTS section_order JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS view_count    INTEGER NOT NULL DEFAULT 0;

-- Ảnh của hồ sơ (bìa + ảnh dự án) lưu BYTEA — bền qua redeploy, phục vụ public.
CREATE TABLE IF NOT EXISTS ecard_images (
  id         TEXT PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content    BYTEA NOT NULL,
  mime_type  TEXT NOT NULL DEFAULT 'image/jpeg',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ecard_images_user ON ecard_images(user_id);
