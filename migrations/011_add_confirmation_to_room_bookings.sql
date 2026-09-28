-- Add confirmation fields to room_bookings table for usage tracking
ALTER TABLE IF EXISTS public.room_bookings
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS confirmed_by UUID,
ADD COLUMN IF NOT EXISTS confirmation_note TEXT,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Create index for status and confirmed_at for faster queries
CREATE INDEX IF NOT EXISTS idx_room_bookings_status ON public.room_bookings(status);
CREATE INDEX IF NOT EXISTS idx_room_bookings_confirmed_at ON public.room_bookings(confirmed_at DESC);

-- Update existing bookings to have proper status
UPDATE public.room_bookings
SET status = COALESCE(status, 'pending'), updated_at = NOW()
WHERE status IS NULL;
