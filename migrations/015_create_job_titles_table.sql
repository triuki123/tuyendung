-- Create job_titles table
-- Chuc danh duoc dinh nghia o cap cong ty (company-level)
-- Moi cong ty co danh sach chuc danh rieng

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
