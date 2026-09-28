-- Migration: Add booking confirmation and cancellation fields
-- Purpose: Enable booking confirmation (30 min before), cancellation with reason, and audit trails

ALTER TABLE room_bookings
ADD COLUMN confirmed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN confirmed_by UUID,
ADD COLUMN cancellation_reason TEXT,
ADD COLUMN cancelled_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN cancelled_by UUID;

-- Indexes for efficient querying
CREATE INDEX idx_room_bookings_confirmed_at ON room_bookings(confirmed_at DESC);
CREATE INDEX idx_room_bookings_cancelled_at ON room_bookings(cancelled_at DESC);

-- Comment on columns for documentation
COMMENT ON COLUMN room_bookings.confirmed_at IS 'Timestamp when booking was confirmed (within 30 min of start time)';
COMMENT ON COLUMN room_bookings.confirmed_by IS 'User ID who confirmed the booking';
COMMENT ON COLUMN room_bookings.cancellation_reason IS 'Reason provided by user when cancelling booking';
COMMENT ON COLUMN room_bookings.cancelled_at IS 'Timestamp when booking was cancelled';
COMMENT ON COLUMN room_bookings.cancelled_by IS 'User ID who cancelled the booking';
