-- Create user_tags junction table
-- Many-to-many relationship between users and tags

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
