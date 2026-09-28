-- Lien ket org_tags <-> don vi to chuc (cong ty / phong ban / bo phan).
-- Moi dong gan 1 tag cho dung 1 don vi (1 trong 3 cot dich duoc set).

CREATE TABLE IF NOT EXISTS public.org_tag_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tag_id UUID NOT NULL REFERENCES public.org_tags(id) ON DELETE CASCADE,
  company_id        UUID REFERENCES public.companies(id)       ON DELETE CASCADE,
  department_id     UUID REFERENCES public.departments(id)     ON DELETE CASCADE,
  sub_department_id UUID REFERENCES public.sub_departments(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  -- Dung 1 trong 3 cot dich duoc set
  CONSTRAINT org_tag_assignments_one_target CHECK (
    (CASE WHEN company_id        IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN department_id     IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN sub_department_id IS NOT NULL THEN 1 ELSE 0 END) = 1
  )
);

-- Chong trung (NULL trong UNIQUE khong dedupe duoc -> dung partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS ux_org_tag_company
  ON public.org_tag_assignments(tag_id, company_id) WHERE company_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_org_tag_department
  ON public.org_tag_assignments(tag_id, department_id) WHERE department_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_org_tag_sub_department
  ON public.org_tag_assignments(tag_id, sub_department_id) WHERE sub_department_id IS NOT NULL;

-- Index tra cuu nguoc tu don vi
CREATE INDEX IF NOT EXISTS idx_org_tag_assignments_company ON public.org_tag_assignments(company_id);
CREATE INDEX IF NOT EXISTS idx_org_tag_assignments_department ON public.org_tag_assignments(department_id);
CREATE INDEX IF NOT EXISTS idx_org_tag_assignments_sub_department ON public.org_tag_assignments(sub_department_id);

-- RLS Policy
ALTER TABLE public.org_tag_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow viewing org tag assignments" ON public.org_tag_assignments
  FOR SELECT
  USING (true);

CREATE POLICY "Only super admins can manage org tag assignments" ON public.org_tag_assignments
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
    AND users.role = 'super_admin'
  ));
