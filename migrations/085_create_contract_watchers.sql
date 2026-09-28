-- Migration 085: bảng người theo dõi hợp đồng
CREATE TABLE IF NOT EXISTS public.contract_watchers (
  id           TEXT PRIMARY KEY,
  contract_id  TEXT NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL,
  added_by     TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_contract_watchers
  ON public.contract_watchers(contract_id, user_id);
CREATE INDEX IF NOT EXISTS idx_contract_watchers_contract_id
  ON public.contract_watchers(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_watchers_user_id
  ON public.contract_watchers(user_id);
