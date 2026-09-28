-- Migration 069: Add extended profile fields to users table
-- hire_date, employment_type, bank info, home_address, work_location

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS hire_date         DATE,
  ADD COLUMN IF NOT EXISTS employment_type   TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_no   TEXT,
  ADD COLUMN IF NOT EXISTS bank_name         TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_name TEXT,
  ADD COLUMN IF NOT EXISTS home_address      TEXT,
  ADD COLUMN IF NOT EXISTS work_location     TEXT;
