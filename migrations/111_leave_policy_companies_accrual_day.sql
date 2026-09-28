-- Migration 111: thêm accrual_day vào chính sách phép, bảng nối policy-companies
ALTER TABLE leave_accrual_policies
  ADD COLUMN IF NOT EXISTS accrual_day INTEGER DEFAULT 1;

CREATE TABLE IF NOT EXISTS leave_policy_companies (
  policy_id   TEXT NOT NULL REFERENCES leave_accrual_policies(id) ON DELETE CASCADE,
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  PRIMARY KEY (policy_id, company_id)
);
