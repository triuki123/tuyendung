-- Migration 285: Tiện ích rút gọn link + tạo mã QR (có hạn dùng / vĩnh viễn)
CREATE TABLE IF NOT EXISTS short_links (
  id           TEXT PRIMARY KEY,
  code         TEXT NOT NULL UNIQUE,        -- slug ngắn, dùng trong /s/<code>
  target_url   TEXT NOT NULL,               -- link đích (http/https)
  title        TEXT,                        -- nhãn tùy chọn cho người tạo dễ nhớ
  created_by   UUID,                        -- user AssetFlow tạo
  expires_at   TIMESTAMPTZ,                 -- NULL = vĩnh viễn
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  click_count  INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_short_links_creator ON short_links(created_by, created_at DESC);
