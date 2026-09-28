-- Add Telegram notification settings to users table

ALTER TABLE users ADD COLUMN IF NOT EXISTS "telegram_enabled" BOOLEAN DEFAULT false;

-- Add comment for clarity
COMMENT ON COLUMN users."telegram_enabled" IS 'Enable/disable Telegram notifications for this user';
