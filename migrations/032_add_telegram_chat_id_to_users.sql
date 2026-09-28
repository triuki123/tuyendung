-- Add Telegram Chat ID column to users table
-- Allows users to receive Telegram notifications for their bookings

ALTER TABLE users ADD COLUMN IF NOT EXISTS "telegram_chat_id" TEXT;

-- Add comment for clarity
COMMENT ON COLUMN users."telegram_chat_id" IS 'User Telegram Chat ID for receiving booking notifications';
