-- Migration 240: vị trí căn chỉnh ảnh bìa hồ sơ năng lực (object-position dọc, 0-100%)
ALTER TABLE user_ecards
  ADD COLUMN IF NOT EXISTS cover_position INTEGER NOT NULL DEFAULT 50;
