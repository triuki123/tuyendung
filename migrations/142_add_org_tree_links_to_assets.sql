-- Migration 142: Bổ sung liên kết cây cơ cấu (Phòng Ban → Bộ Phận) cho domains/email/software
-- Mục tiêu: chọn người phụ trách theo nhánh Công Ty → Phòng Ban → Bộ Phận.
-- companies.id / departments.id / sub_departments.id đều là UUID.

-- domains: đã có owner_company_id + manager_user_id; thêm department_id + sub_department_id
ALTER TABLE domains
  ADD COLUMN IF NOT EXISTS department_id     UUID REFERENCES departments(id)     ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sub_department_id UUID REFERENCES sub_departments(id) ON DELETE SET NULL;

-- email_accounts: đã có company_id + department_id + user_id; thêm sub_department_id
ALTER TABLE email_accounts
  ADD COLUMN IF NOT EXISTS sub_department_id UUID REFERENCES sub_departments(id) ON DELETE SET NULL;

-- software: đã có company_id + manager_user_id + department_id; thêm sub_department_id
ALTER TABLE software
  ADD COLUMN IF NOT EXISTS sub_department_id UUID REFERENCES sub_departments(id) ON DELETE SET NULL;
