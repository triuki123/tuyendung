-- Enhance tickets table with new fields from latest commit
-- Add fields that are referenced in the CreateTicketModal and API routes

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS assigned_unit_tag_id TEXT REFERENCES public.org_tags(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_unit_name TEXT,
  ADD COLUMN IF NOT EXISTS request_type TEXT,
  ADD COLUMN IF NOT EXISTS category_id TEXT REFERENCES public.ticket_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS category_name TEXT,
  ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS requester_id TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS requester_name TEXT,
  ADD COLUMN IF NOT EXISTS requester_department TEXT,
  ADD COLUMN IF NOT EXISTS requester_position TEXT,
  ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]';

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_tickets_category_id ON public.tickets(category_id);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_unit_tag_id ON public.tickets(assigned_unit_tag_id);
CREATE INDEX IF NOT EXISTS idx_tickets_requester_id ON public.tickets(requester_id);
CREATE INDEX IF NOT EXISTS idx_tickets_request_type ON public.tickets(request_type);
