-- ============================================================================
-- Organization Module - Database Migrations
-- Execute all migrations in order in Supabase SQL Editor
-- ============================================================================

-- ============================================================================
-- MIGRATION 1: Create job_titles table
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.job_titles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(company_id, title)
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_job_titles_company_id ON public.job_titles(company_id);
CREATE INDEX IF NOT EXISTS idx_job_titles_active ON public.job_titles(is_active);

-- RLS Policy: Allow authenticated users to see job titles
ALTER TABLE public.job_titles ENABLE ROW LEVEL SECURITY;

-- Read policy: Allow authenticated users to view job titles for their company
CREATE POLICY "Allow viewing job titles for company" ON public.job_titles
  FOR SELECT
  USING (true);

-- Create/Update/Delete policy: Only for admins
CREATE POLICY "Only super admins can manage job titles" ON public.job_titles
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
    AND users.role = 'super_admin'
  ));

-- ============================================================================
-- MIGRATION 2: Create tags table
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  color VARCHAR(7) DEFAULT '#6366f1',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_tags_name ON public.tags(name);
CREATE INDEX IF NOT EXISTS idx_tags_active ON public.tags(is_active);

-- RLS Policy
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

-- Read policy: All authenticated users can view tags
CREATE POLICY "Allow viewing tags" ON public.tags
  FOR SELECT
  USING (true);

-- Create/Update/Delete policy: Only for super admins
CREATE POLICY "Only super admins can manage tags" ON public.tags
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
    AND users.role = 'super_admin'
  ));

-- ============================================================================
-- MIGRATION 3: Create user_tags junction table
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, tag_id)
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_user_tags_user_id ON public.user_tags(user_id);
CREATE INDEX IF NOT EXISTS idx_user_tags_tag_id ON public.user_tags(tag_id);

-- RLS Policy
ALTER TABLE public.user_tags ENABLE ROW LEVEL SECURITY;

-- Read policy: Allow viewing user tags
CREATE POLICY "Allow viewing user tags" ON public.user_tags
  FOR SELECT
  USING (true);

-- Create/Delete policy: Only for admins
CREATE POLICY "Only admins can manage user tags" ON public.user_tags
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
    AND users.role IN ('super_admin', 'admin')
  ));

-- ============================================================================
-- MIGRATION 4: Add job_title_id to users table
-- ============================================================================
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS job_title_id UUID REFERENCES public.job_titles(id) ON DELETE SET NULL;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_users_job_title_id ON public.users(job_title_id);

-- ============================================================================
-- MIGRATION 5: Create positions table
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  salary_range_min DECIMAL(12, 2),
  salary_range_max DECIMAL(12, 2),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(company_id, name)
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_positions_company_id ON public.positions(company_id);
CREATE INDEX IF NOT EXISTS idx_positions_active ON public.positions(is_active);

-- RLS Policy: Allow authenticated users to see positions
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;

-- Read policy: Allow authenticated users to view positions
CREATE POLICY "Allow viewing positions" ON public.positions
  FOR SELECT
  USING (true);

-- Create/Update/Delete policy: Only for admins
CREATE POLICY "Only super admins can manage positions" ON public.positions
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
    AND users.role = 'super_admin'
  ));

-- ============================================================================
-- MIGRATION 6: Add position_id to users table
-- ============================================================================
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS position_id UUID REFERENCES public.positions(id) ON DELETE SET NULL;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_users_position_id ON public.users(position_id);

-- Add comment for clarity
COMMENT ON COLUMN public.users.position_id IS 'Reference to the position/job role assigned to this user within their company.';

-- ============================================================================
-- All migrations completed!
-- ============================================================================
