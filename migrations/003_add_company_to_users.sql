-- Add company field to users table
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS company TEXT DEFAULT 'FADO Group';

-- Create index for company
CREATE INDEX IF NOT EXISTS idx_users_company ON public.users(company);
