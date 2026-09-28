-- Migration 303: log các case uploader null/invalid/not_found phát sinh trong quá trình
-- di trú dữ liệu BYTEA cũ sang bảng media (xem scripts/migrate-media/). Tách riêng khỏi
-- migration 302 vì đây là bảng vận hành phụ trợ, không phải core schema.

CREATE TABLE IF NOT EXISTS public.media_migration_issues (
  id            TEXT PRIMARY KEY,
  source_table  VARCHAR(64) NOT NULL,
  source_id     TEXT NOT NULL,
  reason        VARCHAR(32) NOT NULL,   -- 'null' | 'invalid' | 'not_found'
  raw_value     TEXT,
  media_id      TEXT REFERENCES public.media(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_mmi_source     ON public.media_migration_issues(source_table, source_id);
CREATE INDEX IF NOT EXISTS idx_mmi_unresolved ON public.media_migration_issues(resolved_at) WHERE resolved_at IS NULL;

SELECT 'Migration 303: media_migration_issues table created' AS migration_status;
