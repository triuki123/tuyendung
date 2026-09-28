-- Migration 092: Người theo dõi đánh giá — nhận thông báo khi trạng thái thay đổi
-- user_id dùng UUID (khớp với users.id kiểu UUID trong DB thật)
CREATE TABLE IF NOT EXISTS public.evaluation_watchers (
  id            TEXT PRIMARY KEY,
  evaluation_id TEXT NOT NULL REFERENCES public.evaluations(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  added_by      TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_evaluation_watchers
  ON public.evaluation_watchers(evaluation_id, user_id);
CREATE INDEX IF NOT EXISTS idx_eval_watchers_evaluation ON public.evaluation_watchers(evaluation_id);
CREATE INDEX IF NOT EXISTS idx_eval_watchers_user       ON public.evaluation_watchers(user_id);
