-- Add position_id to users table
-- This links users to their position in the company
-- A position is a specific job role (e.g., Engineer, Manager, Designer)

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS position_id UUID REFERENCES public.positions(id) ON DELETE SET NULL;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_users_position_id ON public.users(position_id);

-- Add comment for clarity
COMMENT ON COLUMN public.users.position_id IS 'Reference to the position/job role assigned to this user within their company.';
