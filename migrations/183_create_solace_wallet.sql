-- Migration 183: Ví tín dụng nội bộ SOLACE + sổ giao dịch + yêu cầu nạp tiền.
-- Tiền BIGINT theo đồng VND. user_id = users.id (UUID lưu dạng TEXT để đồng nhất với các bảng solace_*).

-- Ví: 1 ví / người dùng.
CREATE TABLE IF NOT EXISTS public.solace_wallets (
  user_id      TEXT PRIMARY KEY,
  balance      BIGINT NOT NULL DEFAULT 0,
  total_topup  BIGINT NOT NULL DEFAULT 0,
  total_spent  BIGINT NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sổ giao dịch ví (như sao kê ngân hàng). amount có dấu: + nạp/hoàn, - thanh toán.
CREATE TABLE IF NOT EXISTS public.solace_wallet_txns (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  type          TEXT NOT NULL,                  -- 'topup' | 'payment' | 'refund' | 'adjust'
  amount        BIGINT NOT NULL,                -- có dấu
  balance_after BIGINT NOT NULL,
  method        TEXT,                           -- 'cash' | 'transfer' | NULL
  ref_order_id  TEXT,                           -- nếu là thanh toán đơn
  note          TEXT,
  performed_by  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_solace_wallet_txns_user ON public.solace_wallet_txns (user_id, created_at DESC);

-- Yêu cầu nạp tiền (chuyển khoản: khách tạo → admin duyệt; tiền mặt: nhân viên nạp trực tiếp = đã duyệt).
CREATE TABLE IF NOT EXISTS public.solace_topup_requests (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  amount        BIGINT NOT NULL,
  method        TEXT NOT NULL DEFAULT 'transfer', -- 'cash' | 'transfer'
  status        TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'approved' | 'rejected'
  note          TEXT,
  requested_by  TEXT,
  approved_by   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_solace_topup_status ON public.solace_topup_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_solace_topup_user ON public.solace_topup_requests (user_id, created_at DESC);
