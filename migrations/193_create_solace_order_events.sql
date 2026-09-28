-- Migration 193: nhật ký thao tác theo từng đơn Solace (audit: ai làm gì, lúc nào)
-- kind: created | status | paid | cancelled | edited | payment_changed
CREATE TABLE IF NOT EXISTS public.solace_order_events (
  id         TEXT PRIMARY KEY,
  order_id   TEXT NOT NULL,
  kind       TEXT NOT NULL,
  detail     TEXT,
  actor      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_solace_order_events_order
  ON public.solace_order_events (order_id, created_at);
