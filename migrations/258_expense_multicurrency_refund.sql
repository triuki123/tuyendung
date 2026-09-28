-- Migration 258: Chi Phí đa tiền tệ + xác nhận hoàn ứng
-- Đa quốc gia: amount nhập theo NGUYÊN TỆ (có thể lẻ, vd USD 123.45) → NUMERIC;
-- amount_base = quy đổi VND (BIGINT đồng) dùng cho hạn mức duyệt / báo cáo.
-- Hoàn ứng: quyết toán < tạm ứng → nhân viên hoàn tiền, công ty xác nhận đã nhận.

ALTER TABLE expenses
  ALTER COLUMN amount TYPE NUMERIC(18,2),
  ALTER COLUMN amount_before_tax TYPE NUMERIC(18,2),
  ALTER COLUMN vat_amount TYPE NUMERIC(18,2);

ALTER TABLE expense_lines
  ALTER COLUMN don_gia TYPE NUMERIC(18,2),
  ALTER COLUMN thanh_tien TYPE NUMERIC(18,2);

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS exchange_rate       NUMERIC(18,6) NOT NULL DEFAULT 1,  -- 1 nguyên tệ = ? VND
  ADD COLUMN IF NOT EXISTS amount_base         BIGINT,                            -- tổng cộng quy đổi VND
  ADD COLUMN IF NOT EXISTS refund_confirmed_at TIMESTAMPTZ,                       -- công ty đã nhận hoàn ứng
  ADD COLUMN IF NOT EXISTS refund_confirmed_by TEXT;

UPDATE expenses SET amount_base = ROUND(amount * exchange_rate) WHERE amount_base IS NULL;
