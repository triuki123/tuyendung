-- Migration: Add new columns to email_accounts table
-- Run this in Supabase SQL Editor if the columns don't exist yet

ALTER TABLE email_accounts
ADD COLUMN IF NOT EXISTS nguoiSuDung TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS congtyDonvi TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS phongban TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS createdDate TEXT DEFAULT '';

-- Update the status constraint if it's not already correct
-- Note: May need to be done in two steps if the constraint already exists

-- Optional: Create additional indexes for the new columns if they don't exist
CREATE INDEX IF NOT EXISTS idx_email_accounts_nguoiSuDung ON email_accounts(nguoiSuDung);
CREATE INDEX IF NOT EXISTS idx_email_accounts_congtyDonvi ON email_accounts(congtyDonvi);
CREATE INDEX IF NOT EXISTS idx_email_accounts_phongban ON email_accounts(phongban);
