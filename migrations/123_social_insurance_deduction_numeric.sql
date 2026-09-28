-- Migration 123: Đổi social_insurance_deduction sang NUMERIC để lưu số thập phân (vd: 10.5%)
ALTER TABLE users
  ALTER COLUMN social_insurance_deduction TYPE NUMERIC(12,2);
