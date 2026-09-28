-- Add new columns to room_bookings table
ALTER TABLE room_bookings
ADD COLUMN IF NOT EXISTS num_participants INT DEFAULT 1,
ADD COLUMN IF NOT EXISTS has_online_meeting BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS needs_room_setup BOOLEAN DEFAULT false;

-- Create room_booking_participants table
CREATE TABLE IF NOT EXISTS room_booking_participants (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  booking_id TEXT NOT NULL REFERENCES room_bookings(id) ON DELETE CASCADE,
  participant_id UUID REFERENCES users(id) ON DELETE SET NULL,
  participant_email VARCHAR(255),
  participant_name VARCHAR(255),
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_room_booking_participants_booking_id ON room_booking_participants(booking_id);
CREATE INDEX IF NOT EXISTS idx_room_booking_participants_participant_id ON room_booking_participants(participant_id);
CREATE INDEX IF NOT EXISTS idx_room_booking_participants_status ON room_booking_participants(status);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_room_booking_participants_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_room_booking_participants_updated_at ON room_booking_participants;
CREATE TRIGGER trigger_update_room_booking_participants_updated_at
  BEFORE UPDATE ON room_booking_participants
  FOR EACH ROW
  EXECUTE FUNCTION update_room_booking_participants_updated_at();
