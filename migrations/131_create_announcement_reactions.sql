-- Migration 131: Tạo bảng announcement_reactions (cảm xúc thông báo)
CREATE TABLE IF NOT EXISTS announcement_reactions (
  id               TEXT PRIMARY KEY,
  announcement_id  TEXT NOT NULL,
  user_id          TEXT NOT NULL,
  reaction         TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (announcement_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_announcement_reactions_announcement_id ON announcement_reactions (announcement_id);
CREATE INDEX IF NOT EXISTS idx_announcement_reactions_user_id ON announcement_reactions (user_id);
