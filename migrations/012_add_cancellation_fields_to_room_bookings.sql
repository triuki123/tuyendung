-- Add cancellation fields to room_bookings table for tracking cancellations
-- Purpose: Support cancelling bookings with reason tracking and audit trail

ALTER TABLE IF EXISTS public.room_bookings
ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
ADD COLUMN IF NOT EXISTS cancelled_by UUID,
ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE;

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_room_bookings_cancelled_at ON public.room_bookings(cancelled_at DESC);
CREATE INDEX IF NOT EXISTS idx_room_bookings_cancelled_by ON public.room_bookings(cancelled_by);

-- Verify all Phase 2 columns exist
-- num_participants, has_online_meeting, needs_room_setup (from add_room_booking_participants_schema.sql)
-- confirmed_at, confirmed_by, confirmation_note (from 011_add_confirmation_to_room_bookings.sql)
-- cancellation_reason, cancelled_by, cancelled_at (from this migration)
