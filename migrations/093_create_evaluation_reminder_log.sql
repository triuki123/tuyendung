-- Migration 093: Log chống gửi trùng thông báo đánh giá
-- UNIQUE(evaluation_id, sent_date, slot) đảm bảo mỗi slot chỉ gửi 1 lần/ngày
CREATE TABLE IF NOT EXISTS public.evaluation_reminder_log (
  id            TEXT PRIMARY KEY,
  evaluation_id TEXT NOT NULL REFERENCES public.evaluations(id) ON DELETE CASCADE,
  milestone     TEXT NOT NULL,   -- created_7d | d7 | d3 | d1 | due | overdue
  slot          TEXT NOT NULL,   -- am | pm
  sent_date     DATE NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (evaluation_id, sent_date, slot)
);

CREATE INDEX IF NOT EXISTS idx_eval_reminder_log_evaluation ON public.evaluation_reminder_log(evaluation_id);
