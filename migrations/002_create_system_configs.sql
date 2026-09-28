-- Create system_configs table for managing dynamic options
CREATE TABLE IF NOT EXISTS public.system_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('role', 'department', 'company')),
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'system',
  UNIQUE(type, name)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_system_configs_type ON public.system_configs(type);
CREATE INDEX IF NOT EXISTS idx_system_configs_name ON public.system_configs(name);

-- Enable RLS
ALTER TABLE public.system_configs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Allow all read access" ON public.system_configs
  FOR SELECT USING (true);

CREATE POLICY "Allow insert for authenticated users" ON public.system_configs
  FOR INSERT WITH CHECK (true);

-- Insert default system configs
INSERT INTO public.system_configs (type, name, created_by) VALUES
('role', 'super_admin', 'system'),
('role', 'admin', 'system'),
('role', 'user', 'system'),
('department', 'Ban Giám Đốc', 'system'),
('department', 'Nhân Sự', 'system'),
('department', 'Kỹ Thuật', 'system'),
('company', 'FADO Group', 'system')
ON CONFLICT (type, name) DO NOTHING;
