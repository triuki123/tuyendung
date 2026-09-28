-- Create companies table
-- Công Ty là đơn vị cấp cao nhất trong tổ chức
-- Hệ sinh thái bao gồm 8-10 công ty khác nhau

CREATE TABLE IF NOT EXISTS public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL UNIQUE,
  code VARCHAR(50) NOT NULL UNIQUE,
  description TEXT,
  address TEXT,
  invoice_address TEXT,
  phone VARCHAR(20),
  email VARCHAR(255),
  website VARCHAR(255),
  tax_code VARCHAR(50),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_companies_name ON public.companies(name);
CREATE INDEX IF NOT EXISTS idx_companies_code ON public.companies(code);
CREATE INDEX IF NOT EXISTS idx_companies_active ON public.companies(is_active);

-- RLS Policy
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- Read policy: All authenticated users can view companies
CREATE POLICY "Allow viewing companies" ON public.companies
  FOR SELECT
  USING (true);

-- Create/Update/Delete policy: Only for super admins
CREATE POLICY "Only super admins can manage companies" ON public.companies
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
    AND users.role = 'super_admin'
  ));
