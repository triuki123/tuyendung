-- Create departments table
-- Phòng Ban là đơn vị trực tiếp dưới Công Ty
-- Ví dụ: Phòng Kế Toán, Phòng Nhân Sự, Phòng IT, etc.

CREATE TABLE IF NOT EXISTS public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50),
  description TEXT,
  manager_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(company_id, name)
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_departments_company_id ON public.departments(company_id);
CREATE INDEX IF NOT EXISTS idx_departments_name ON public.departments(name);
CREATE INDEX IF NOT EXISTS idx_departments_manager_id ON public.departments(manager_id);
CREATE INDEX IF NOT EXISTS idx_departments_active ON public.departments(is_active);

-- RLS Policy
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

-- Read policy: All authenticated users can view departments
CREATE POLICY "Allow viewing departments" ON public.departments
  FOR SELECT
  USING (true);

-- Create/Update/Delete policy: Only for super admins
CREATE POLICY "Only super admins can manage departments" ON public.departments
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
    AND users.role = 'super_admin'
  ));
