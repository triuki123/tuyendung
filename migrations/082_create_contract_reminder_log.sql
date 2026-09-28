-- Migration 082: contract_reminder_log — chống gửi nhắc trùng
-- UNIQUE(contract_id, sent_date, slot): mỗi HĐ, mỗi ngày, mỗi khung giờ (am/pm)
-- chỉ gửi 1 lần. Scheduler tick lặp vẫn an toàn.
CREATE TABLE IF NOT EXISTS public.contract_reminder_log (
  id          TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  milestone   TEXT NOT NULL,
  slot        TEXT NOT NULL,
  sent_date   DATE NOT NULL,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (contract_id, sent_date, slot)
);

CREATE INDEX IF NOT EXISTS idx_contract_reminder_log_contract ON public.contract_reminder_log(contract_id);
