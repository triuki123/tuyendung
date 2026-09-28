-- Add manager_id to users table
-- This links users to their manager for reporting line tracking
-- Independent from organizational unit assignment

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS manager_id TEXT REFERENCES public.users(id) ON DELETE SET NULL;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_users_manager_id ON public.users(manager_id);

-- Add comment for clarity
COMMENT ON COLUMN public.users.manager_id IS 'Reference to the user who directly manages this user. Independent from organizational unit (company/department/sub_department).';
