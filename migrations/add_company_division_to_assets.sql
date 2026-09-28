-- Add company_id, division_id, sub_department_id to assets table
ALTER TABLE public.assets
ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS division_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS sub_department_id UUID REFERENCES public.sub_departments(id) ON DELETE SET NULL;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_assets_company_id ON public.assets(company_id);
CREATE INDEX IF NOT EXISTS idx_assets_division_id ON public.assets(division_id);
CREATE INDEX IF NOT EXISTS idx_assets_sub_department_id ON public.assets(sub_department_id);
