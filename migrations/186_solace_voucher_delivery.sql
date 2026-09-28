-- Migration 186: Mã giảm giá (voucher) + giao hàng trong toà nhà cho SOLACE.

CREATE TABLE IF NOT EXISTS public.solace_vouchers (
  code         TEXT PRIMARY KEY,                 -- mã (chữ HOA)
  type         TEXT NOT NULL DEFAULT 'amount',   -- 'percent' | 'amount'
  value        BIGINT NOT NULL DEFAULT 0,        -- percent (0-100) hoặc số tiền (đồng)
  min_order    BIGINT NOT NULL DEFAULT 0,        -- giá trị đơn tối thiểu để áp dụng
  max_discount BIGINT NOT NULL DEFAULT 0,        -- trần giảm cho loại percent (0 = không trần)
  usage_limit  INTEGER NOT NULL DEFAULT 0,       -- tổng lượt dùng tối đa (0 = không giới hạn)
  used_count   INTEGER NOT NULL DEFAULT 0,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Đơn hàng: phí giao + SĐT + mã giảm giá đã áp.
ALTER TABLE public.solace_orders
  ADD COLUMN IF NOT EXISTS delivery_fee   BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS customer_phone TEXT,
  ADD COLUMN IF NOT EXISTS voucher_code   TEXT;
