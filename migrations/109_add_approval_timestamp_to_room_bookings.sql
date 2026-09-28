-- Migration 109: them approval_timestamp va approval_by_name vao room_bookings
ALTER TABLE public.room_bookings
  ADD COLUMN IF NOT EXISTS approval_timestamp TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS approval_by_name   TEXT;

CREATE INDEX IF NOT EXISTS idx_room_bookings_approval_timestamp ON public.room_bookings(approval_timestamp);
