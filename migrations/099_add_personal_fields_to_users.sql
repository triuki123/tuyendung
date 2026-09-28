-- Migration 099: Thêm các trường thông tin cá nhân vào users
-- Phục vụ luồng Onboarding: dữ liệu nhân sự điền form được map vào hồ sơ user khi duyệt.
-- users đã có sẵn: hire_date, bank_account_no, bank_name, bank_account_name,
--                  home_address, phone, telegram_chat_id, employee_code...

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS date_of_birth                   DATE,
  ADD COLUMN IF NOT EXISTS gender                          TEXT,
  ADD COLUMN IF NOT EXISTS personal_email                  TEXT,
  ADD COLUMN IF NOT EXISTS national_id                     TEXT,
  ADD COLUMN IF NOT EXISTS national_id_issue_date          DATE,
  ADD COLUMN IF NOT EXISTS national_id_issue_place         TEXT,
  ADD COLUMN IF NOT EXISTS temporary_address               TEXT,
  ADD COLUMN IF NOT EXISTS nationality                     TEXT,
  ADD COLUMN IF NOT EXISTS education_level                 TEXT,
  ADD COLUMN IF NOT EXISTS major                           TEXT,
  ADD COLUMN IF NOT EXISTS marital_status                  TEXT,
  ADD COLUMN IF NOT EXISTS children_count                  INTEGER,
  ADD COLUMN IF NOT EXISTS ethnicity                       TEXT,
  ADD COLUMN IF NOT EXISTS religion                        TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_type                    TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_plate                   TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_model                   TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_name          TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_relationship  TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone         TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_address       TEXT;

SELECT 'Migration 099: personal fields added to users' AS migration_status;
