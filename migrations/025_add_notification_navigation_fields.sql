-- Add navigation fields to notifications table for click-to-navigate feature
ALTER TABLE public.notifications
ADD COLUMN IF NOT EXISTS related_id TEXT,
ADD COLUMN IF NOT EXISTS related_url TEXT;

-- Create indexes for better query performance on navigation fields
CREATE INDEX IF NOT EXISTS idx_notifications_related_id ON public.notifications(related_id);
CREATE INDEX IF NOT EXISTS idx_notifications_related_url ON public.notifications(related_url);
