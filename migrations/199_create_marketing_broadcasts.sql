-- Migration 199: bài Marketing broadcast gửi qua bot Solace
-- status: draft | scheduled | sending | sent | failed
--  - scheduled_at: nếu có → scheduler tự gửi đúng giờ; null + status='sending' → gửi ngay
--  - total/sent/failed_count: thống kê sau khi phát
CREATE TABLE IF NOT EXISTS public.marketing_broadcasts (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  content       TEXT NOT NULL,
  image_url     TEXT,
  button_label  TEXT,
  button_url    TEXT,
  status        TEXT NOT NULL DEFAULT 'draft',
  scheduled_at  TIMESTAMPTZ,
  total_count   INTEGER NOT NULL DEFAULT 0,
  sent_count    INTEGER NOT NULL DEFAULT 0,
  failed_count  INTEGER NOT NULL DEFAULT 0,
  created_by    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_marketing_broadcasts_sched
  ON public.marketing_broadcasts (status, scheduled_at);
