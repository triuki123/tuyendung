-- Drop old department column and create 3 new columns for proper data normalization
-- This migration properly links assets to the organizational hierarchy

-- Drop the old department column if it exists
ALTER TABLE public.assets
DROP COLUMN IF EXISTS department CASCADE;

-- Add the three new organizational reference columns
ALTER TABLE public.assets
ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS sub_department_id UUID REFERENCES public.sub_departments(id) ON DELETE SET NULL;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_assets_company_id ON public.assets(company_id);
CREATE INDEX IF NOT EXISTS idx_assets_department_id ON public.assets(department_id);
CREATE INDEX IF NOT EXISTS idx_assets_sub_department_id ON public.assets(sub_department_id);
