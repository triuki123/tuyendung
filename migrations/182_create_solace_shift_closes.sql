-- Migration 182: Kết ca quán SOLACE — chốt doanh thu theo ngày kinh doanh (giờ VN).
-- 1 bản ghi / ngày (upsert) — kết lại sẽ cập nhật snapshot (gồm cả đơn phát sinh thêm).
CREATE TABLE IF NOT EXISTS public.solace_shift_closes (
  id            TEXT PRIMARY KEY,
  business_date DATE NOT NULL UNIQUE,
  total_orders  INTEGER NOT NULL DEFAULT 0,
  total_revenue BIGINT  NOT NULL DEFAULT 0,   -- tổng đã thu (paid) theo đồng
  cash_total    BIGINT  NOT NULL DEFAULT 0,
  bankqr_total  BIGINT  NOT NULL DEFAULT 0,
  wallet_total  BIGINT  NOT NULL DEFAULT 0,
  unpaid_total  BIGINT  NOT NULL DEFAULT 0,   -- tổng còn nợ / chưa thu
  cash_counted  BIGINT,                       -- tiền mặt đếm thực tế (nhập tay)
  variance      BIGINT  NOT NULL DEFAULT 0,   -- chênh lệch = cash_counted - cash_total
  note          TEXT,
  closed_by     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
