-- Migration 112: thêm thời hạn hiệu lực (valid_from, valid_until) vào chính sách phép năm
ALTER TABLE leave_accrual_policies
  ADD COLUMN IF NOT EXISTS valid_from  DATE,
  ADD COLUMN IF NOT EXISTS valid_until DATE;
