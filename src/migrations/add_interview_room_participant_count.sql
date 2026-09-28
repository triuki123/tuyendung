-- Required by interviewService when reserving an interview room.
ALTER TABLE room_bookings ADD COLUMN IF NOT EXISTS num_participants INT DEFAULT 1;
