-- Add module_permissions column to users table
-- This column stores user's permissions for different modules in JSONB format
-- Format: { "module-id": ["view", "create", "edit", ...], ... }

-- Step 1: Add column if it doesn't exist
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS module_permissions JSONB DEFAULT '{}'::JSONB;

-- Step 2: Create index for better performance when querying permissions
CREATE INDEX IF NOT EXISTS idx_users_module_permissions ON public.users USING GIN (module_permissions);

-- Step 3: Add comment to document the column
COMMENT ON COLUMN public.users.module_permissions IS 'JSON object storing module-based permissions for the user. Format: {"module-id": ["view", "create", "edit", "delete", "approve", "export"], ...}';

-- Step 4: Verify the migration
SELECT id, email, name, role, module_permissions FROM public.users LIMIT 5;
