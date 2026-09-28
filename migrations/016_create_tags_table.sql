-- Create tags table
-- Tags dung de phan loai, danh dau va loc users

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
