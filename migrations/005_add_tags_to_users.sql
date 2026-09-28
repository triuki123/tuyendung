-- Add tags column to users table
ALTER TABLE IF EXISTS public.users ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- Create index for tags for better query performance
CREATE INDEX IF NOT EXISTS idx_users_tags ON public.users USING GIN (tags);
