-- Create sub_departments table
-- Bộ Phận là đơn vị trực tiếp dưới Phòng Ban
-- Ví dụ: Phòng Kế Toán -> Kế Toán Giá Thành, Kế Toán Kế Toán Tổng Hợp

CREATE TABLE IF NOT EXISTS public.sub_departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50),
  description TEXT,
  manager_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(department_id, name)
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_sub_departments_department_id ON public.sub_departments(department_id);
CREATE INDEX IF NOT EXISTS idx_sub_departments_name ON public.sub_departments(name);
CREATE INDEX IF NOT EXISTS idx_sub_departments_manager_id ON public.sub_departments(manager_id);
CREATE INDEX IF NOT EXISTS idx_sub_departments_active ON public.sub_departments(is_active);

-- RLS Policy
ALTER TABLE public.sub_departments ENABLE ROW LEVEL SECURITY;

-- Read policy: All authenticated users can view sub_departments
CREATE POLICY "Allow viewing sub_departments" ON public.sub_departments
  FOR SELECT
  USING (true);

-- Create/Update/Delete policy: Only for super admins
CREATE POLICY "Only super admins can manage sub_departments" ON public.sub_departments
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
    AND users.role = 'super_admin'
  ));
