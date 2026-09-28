-- Migration 154: Chữ ký email — lưu chữ ký cá nhân của mỗi người dùng.
-- 1 người dùng = 1 chữ ký đang dùng (Phase 1). data giữ toàn bộ trường form (JSONB),
-- html giữ bản render email-safe để tái sử dụng / đẩy sang Zimbra (Phase 2).
CREATE TABLE IF NOT EXISTS public.user_signatures (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  company_id  TEXT,
  template_id TEXT NOT NULL DEFAULT 'modern',
  data        JSONB NOT NULL DEFAULT '{}'::jsonb,
  html        TEXT,
  text_plain  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Mỗi user chỉ 1 chữ ký (Phase 1) — upsert theo user_id.
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_signatures_user ON public.user_signatures(user_id);
