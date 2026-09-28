-- Remove FOREIGN KEY constraint from assigned_to
-- so it can store either user IDs or support category names

ALTER TABLE public.tickets 
DROP CONSTRAINT IF EXISTS tickets_created_by_fkey;

-- Re-add constraint only for created_by (which should be a user ID)
ALTER TABLE public.tickets
ADD CONSTRAINT tickets_created_by_fkey 
FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;
