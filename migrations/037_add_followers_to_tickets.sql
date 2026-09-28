-- Add followers field to tickets table
-- followers: JSONB array of user IDs who are following this ticket

ALTER TABLE public.tickets
ADD COLUMN IF NOT EXISTS followers JSONB DEFAULT '[]'::jsonb;

-- Create index for better performance when querying by followers
CREATE INDEX IF NOT EXISTS idx_tickets_followers ON public.tickets USING GIN (followers);

-- Add comment for clarity
COMMENT ON COLUMN public.tickets.followers IS 'Array of user IDs following this ticket. Format: ["user_id_1", "user_id_2", ...]';
