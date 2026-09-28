-- Create archived_room_bookings table for storing bookings older than 7 days
-- This table mirrors room_bookings structure plus archived_at timestamp

CREATE TABLE IF NOT EXISTS public.archived_room_bookings (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  room_name TEXT,
  booking_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  duration_minutes INTEGER,
  requested_by TEXT NOT NULL,
  requested_by_name TEXT,
  participants TEXT[], -- JSON array of participant objects
  purpose TEXT,
  status TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  approval_timestamp TIMESTAMP,
  approval_by_name TEXT,
  rejection_reason TEXT,
  archived_at TIMESTAMP DEFAULT NOW() -- When this booking was archived
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_archived_room_bookings_booking_date ON public.archived_room_bookings(booking_date);
CREATE INDEX IF NOT EXISTS idx_archived_room_bookings_archived_at ON public.archived_room_bookings(archived_at);
CREATE INDEX IF NOT EXISTS idx_archived_room_bookings_status ON public.archived_room_bookings(status);
CREATE INDEX IF NOT EXISTS idx_archived_room_bookings_room_id ON public.archived_room_bookings(room_id);
