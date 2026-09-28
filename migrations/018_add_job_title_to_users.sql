-- Add job_title_id to users table
-- Link users to their job titles from Organization module

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS job_title_id UUID REFERENCES public.job_titles(id) ON DELETE SET NULL;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_users_job_title_id ON public.users(job_title_id);
