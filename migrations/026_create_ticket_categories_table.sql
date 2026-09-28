-- Create ticket_categories table
-- Danh muc ticket co the co phan cap (parent_id)
-- custom_fields la JSON array chua dinh nghia cac truong dong
CREATE TABLE IF NOT EXISTS public.ticket_categories (
  id TEXT PRIMARY KEY,
  parent_id TEXT REFERENCES public.ticket_categories(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  request_type TEXT,
  default_unit_tag_id TEXT REFERENCES public.org_tags(id) ON DELETE SET NULL,
  custom_fields JSONB DEFAULT '[]',
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index
CREATE INDEX IF NOT EXISTS idx_ticket_categories_parent ON public.ticket_categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_ticket_categories_is_active ON public.ticket_categories(is_active);
CREATE INDEX IF NOT EXISTS idx_ticket_categories_request_type ON public.ticket_categories(request_type);
