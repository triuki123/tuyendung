-- Add approval timeline fields to room_bookings table
-- These fields track when a booking was approved/rejected and by whom
ALTER TABLE public.room_bookings
ADD COLUMN IF NOT EXISTS approval_timestamp TIMESTAMP,
ADD COLUMN IF NOT EXISTS approval_by_name TEXT,
ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_room_bookings_approval_timestamp ON public.room_bookings(approval_timestamp);
CREATE INDEX IF NOT EXISTS idx_room_bookings_approval_by_name ON public.room_bookings(approval_by_name);
