-- Add language and theme preferences to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS "preferred_language" TEXT DEFAULT 'vi';
ALTER TABLE users ADD COLUMN IF NOT EXISTS "preferred_theme" TEXT DEFAULT 'light';

COMMENT ON COLUMN users."preferred_language" IS 'User preferred language: vi, en, zh';
COMMENT ON COLUMN users."preferred_theme" IS 'User preferred theme: light, dark, auto';
