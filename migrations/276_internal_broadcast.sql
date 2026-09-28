-- Migration 276: lịch sử "Gửi Tin Nhắn Telegram" (thường, không RSVP) trong tab Nội Bộ
-- + template hệ thống "vehicle" cho email soạn tự do (không cần chọn mẫu có sẵn).
CREATE TABLE IF NOT EXISTS internal_tg_broadcasts (
  id               TEXT PRIMARY KEY,
  title            TEXT NOT NULL,
  content          TEXT NOT NULL,
  image_url        TEXT,
  target_summary   TEXT,
  total_count      INTEGER NOT NULL DEFAULT 0,
  sent_count       INTEGER NOT NULL DEFAULT 0,
  failed_count     INTEGER NOT NULL DEFAULT 0,
  no_channel_count INTEGER NOT NULL DEFAULT 0,
  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_internal_tg_broadcasts_created ON internal_tg_broadcasts(created_at DESC);

-- Template "vehicle" cho email soạn tự do (Panel Email Nội Bộ) — subject/body luôn bị override
-- bởi nội dung soạn tay per-recipient, chỉ cần tồn tại để pass permission check theo category.
INSERT INTO email_templates (id, category, key, name, description, subject_tpl, body_html_tpl, schema, engine, is_system)
VALUES (
  'et_internal_freeform',
  'internal',
  'internal_freeform',
  'Nội Bộ — Soạn tự do',
  'Vehicle nội bộ cho email soạn tự do (không phải mẫu để chọn hiển thị nội dung cố định)',
  '{{subject}}',
  '{{body}}',
  '[]'::jsonb,
  'ses', true
) ON CONFLICT (key) DO NOTHING;
