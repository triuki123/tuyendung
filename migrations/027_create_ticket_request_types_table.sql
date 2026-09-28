-- Create ticket_request_types table
-- Loai yeu cau (e.g., Bug, Feature, Support, Maintenance)
CREATE TABLE IF NOT EXISTS public.ticket_request_types (
  id TEXT PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index
CREATE INDEX IF NOT EXISTS idx_ticket_request_types_is_active ON public.ticket_request_types(is_active);
CREATE INDEX IF NOT EXISTS idx_ticket_request_types_code ON public.ticket_request_types(code);
