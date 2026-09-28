-- Migration 192: Sổ Quỹ Solace — theo dõi tiền mặt (két) & ngân hàng của quán.
-- Mọi khoản Thu/Chi (bán hàng, nạp ví, trả nợ, mua nguyên liệu, chi phí, hoàn tiền,
-- chuyển quỹ, số dư đầu kỳ, kiểm quỹ) ghi 1 dòng. Số dư = SUM(in) - SUM(out) theo account.
-- Tiền BIGINT đồng VND. Idempotent.
CREATE TABLE IF NOT EXISTS solace_cash_txns (
  id            TEXT PRIMARY KEY,
  account       TEXT NOT NULL,                 -- 'cash' (két) | 'bank' (ngân hàng)
  direction     TEXT NOT NULL,                 -- 'in' (thu) | 'out' (chi)
  amount        BIGINT NOT NULL,               -- luôn dương
  category      TEXT NOT NULL,                 -- opening/sale/topup/debt_payment/purchase/expense/refund/transfer/adjust
  ref_type      TEXT,                          -- order/wallet/ingredient/...
  ref_id        TEXT,
  note          TEXT,
  business_date TEXT,                          -- YYYY-MM-DD (giờ VN)
  created_by    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_solace_cash_txns_date ON solace_cash_txns (business_date DESC);
CREATE INDEX IF NOT EXISTS idx_solace_cash_txns_acct ON solace_cash_txns (account);
CREATE INDEX IF NOT EXISTS idx_solace_cash_txns_cat  ON solace_cash_txns (category);
