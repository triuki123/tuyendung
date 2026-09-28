-- Enhance audit_logs table to support asset history
ALTER TABLE IF EXISTS public.audit_logs
ADD COLUMN IF NOT EXISTS asset_id UUID,
ADD COLUMN IF NOT EXISTS asset_code VARCHAR(100),
ADD COLUMN IF NOT EXISTS asset_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS asset_type VARCHAR(50),
ADD COLUMN IF NOT EXISTS timestamp TIMESTAMP WITH TIME ZONE;

-- Update existing records to have timestamp from created_at if not already set
UPDATE public.audit_logs
SET timestamp = created_at
WHERE timestamp IS NULL;

-- Add index for asset_id for better query performance
CREATE INDEX IF NOT EXISTS idx_audit_logs_asset_id ON public.audit_logs(asset_id);

-- Add index for timestamp for better sorting
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON public.audit_logs(timestamp DESC);
