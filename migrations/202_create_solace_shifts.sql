-- Migration 202: Phiên ca làm việc Solace (mở/đóng ca + quỹ đầu ca).
--  - Cho phép NHIỀU ca/ngày, nhưng chỉ 1 ca MỞ tại một thời điểm (partial unique index).
--  - Mở ca không bắt buộc: đơn tạo khi chưa mở ca có shift_id = NULL (vẫn vào chốt ngày cũ).
--  - Giữ nguyên solace_shift_closes (chốt theo ngày) để không phá báo cáo/lịch sử cũ.
CREATE TABLE IF NOT EXISTS public.solace_shifts (
  id             TEXT PRIMARY KEY,
  business_date  DATE NOT NULL,
  status         TEXT NOT NULL DEFAULT 'open',   -- open | closed
  opened_by      TEXT,
  opened_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  opening_float  BIGINT  NOT NULL DEFAULT 0,      -- quỹ đầu ca (tiền lẻ thối)
  closed_by      TEXT,
  closed_at      TIMESTAMPTZ,
  -- snapshot khi đóng ca:
  total_orders   INTEGER NOT NULL DEFAULT 0,
  total_revenue  BIGINT  NOT NULL DEFAULT 0,      -- đã thu (paid) trong ca
  cash_total     BIGINT  NOT NULL DEFAULT 0,
  bankqr_total   BIGINT  NOT NULL DEFAULT 0,
  wallet_total   BIGINT  NOT NULL DEFAULT 0,
  unpaid_total   BIGINT  NOT NULL DEFAULT 0,
  expected_cash  BIGINT  NOT NULL DEFAULT 0,      -- quỹ đầu ca + tiền mặt bán
  cash_counted   BIGINT,                          -- tiền mặt đếm thực tế (nhập tay)
  variance       BIGINT  NOT NULL DEFAULT 0,      -- chênh lệch = cash_counted - expected_cash
  note           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Chỉ cho phép tối đa 1 ca đang mở tại một thời điểm.
CREATE UNIQUE INDEX IF NOT EXISTS idx_solace_shift_one_open
  ON public.solace_shifts (status) WHERE status = 'open';

-- Tra ca theo ngày kinh doanh nhanh.
CREATE INDEX IF NOT EXISTS idx_solace_shifts_business_date
  ON public.solace_shifts (business_date);

-- Gắn đơn vào ca (đơn tạo trong lúc ca mở). NULL = tạo khi không có ca mở.
ALTER TABLE public.solace_orders
  ADD COLUMN IF NOT EXISTS shift_id TEXT;

CREATE INDEX IF NOT EXISTS idx_solace_orders_shift_id
  ON public.solace_orders (shift_id) WHERE shift_id IS NOT NULL;
