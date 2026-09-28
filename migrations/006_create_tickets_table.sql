-- Create tickets table
CREATE TABLE IF NOT EXISTS public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  asset_code TEXT,
  asset_name TEXT,
  priority TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'open',
  created_by TEXT NOT NULL,
  created_by_name TEXT,
  assigned_to TEXT,
  assigned_to_name TEXT,
  support_category TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  FOREIGN KEY (created_by) REFERENCES public.users(id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_tickets_created_by ON public.tickets(created_by);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to ON public.tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON public.tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_support_category ON public.tickets(support_category);
CREATE INDEX IF NOT EXISTS idx_tickets_code ON public.tickets(code);

-- Enable RLS (Row Level Security)
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Allow all access to tickets" ON public.tickets
  FOR ALL USING (true) WITH CHECK (true);
