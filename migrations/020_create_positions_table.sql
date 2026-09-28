-- Create positions table
-- Positions are job positions within a company (e.g., Engineer, Manager, Designer)
-- Different from job_titles which are also organizational roles

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
