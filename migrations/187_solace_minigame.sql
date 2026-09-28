-- Migration 187: Minigame "đến sớm" Solace
-- - users.work_start_time: giờ vào làm theo từng nhân viên ("HH:MM")
-- - solace_vouchers: mã thưởng (reward) — chỉ áp cho 1 số món, do minigame sinh
-- - solace_minigame_claims: log nhận quà / ngày (chống nhận quá giới hạn)

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS work_start_time TEXT;

ALTER TABLE public.solace_vouchers
  ADD COLUMN IF NOT EXISTS is_reward          BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reward_product_ids JSONB,
  ADD COLUMN IF NOT EXISTS owner_user_id      TEXT;

CREATE TABLE IF NOT EXISTS public.solace_minigame_claims (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  business_date DATE NOT NULL,
  voucher_code  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_solace_minigame_claims_user_date
  ON public.solace_minigame_claims(user_id, business_date);
