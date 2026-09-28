-- Phase 2 Database Migration
-- Tables for Check-In Management System

-- Table 1: Check-In History (Audit Trail)
CREATE TABLE IF NOT EXISTS check_in_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id VARCHAR NOT NULL,
  room_id VARCHAR NOT NULL,
  room_name VARCHAR NOT NULL,
  checked_in_by VARCHAR NOT NULL,
  checked_in_by_name VARCHAR NOT NULL,
  check_in_time VARCHAR NOT NULL,
  check_in_date VARCHAR NOT NULL,
  check_out_time VARCHAR,
  check_out_date VARCHAR,
  status VARCHAR DEFAULT 'checked-in' CHECK (status IN ('checked-in', 'checked-out', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_check_in_history_booking_id ON check_in_history(booking_id);
CREATE INDEX IF NOT EXISTS idx_check_in_history_room_id ON check_in_history(room_id);
CREATE INDEX IF NOT EXISTS idx_check_in_history_checked_in_by ON check_in_history(checked_in_by);
CREATE INDEX IF NOT EXISTS idx_check_in_history_check_in_date ON check_in_history(check_in_date);

-- Table 2: Admin Audit Logs
CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id VARCHAR NOT NULL,
  action VARCHAR NOT NULL,
  admin_id VARCHAR NOT NULL,
  admin_name VARCHAR NOT NULL,
  reason TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_booking_id ON admin_audit_logs(booking_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_admin_id ON admin_audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action ON admin_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON admin_audit_logs(created_at);

-- Table 3: Attendee Check-Ins
CREATE TABLE IF NOT EXISTS attendee_check_ins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id VARCHAR NOT NULL,
  attendee_id VARCHAR NOT NULL,
  attendee_name VARCHAR NOT NULL,
  check_in_date VARCHAR NOT NULL,
  check_in_time VARCHAR NOT NULL,
  check_out_date VARCHAR,
  check_out_time VARCHAR,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  -- Prevent duplicate check-ins on same day
  UNIQUE(booking_id, attendee_id, check_in_date)
);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_attendee_check_ins_booking_id ON attendee_check_ins(booking_id);
CREATE INDEX IF NOT EXISTS idx_attendee_check_ins_attendee_id ON attendee_check_ins(attendee_id);
CREATE INDEX IF NOT EXISTS idx_attendee_check_ins_check_in_date ON attendee_check_ins(check_in_date);

-- Table 4: Attendee Check-In Logs
CREATE TABLE IF NOT EXISTS attendee_check_in_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id VARCHAR NOT NULL,
  attendee_id VARCHAR NOT NULL,
  attendee_name VARCHAR NOT NULL,
  check_in_date VARCHAR NOT NULL,
  check_in_time VARCHAR NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_attendee_check_in_logs_booking_id ON attendee_check_in_logs(booking_id);
CREATE INDEX IF NOT EXISTS idx_attendee_check_in_logs_created_at ON attendee_check_in_logs(created_at);

-- Grant permissions (optional - adjust as needed for your setup)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON check_in_history TO authenticated;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON admin_audit_logs TO authenticated;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON attendee_check_ins TO authenticated;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON attendee_check_in_logs TO authenticated;

-- Views for common reports (optional)

-- View: Today's Check-Ins
CREATE OR REPLACE VIEW today_check_ins AS
SELECT
  c.booking_id,
  c.room_name,
  c.checked_in_by_name,
  c.check_in_time,
  c.check_out_time,
  c.status,
  COUNT(DISTINCT a.id) as attendee_count
FROM check_in_history c
LEFT JOIN attendee_check_ins a ON c.booking_id = a.booking_id AND a.check_in_date = c.check_in_date
WHERE c.check_in_date = CURRENT_DATE
GROUP BY c.id, c.booking_id, c.room_name, c.checked_in_by_name, c.check_in_time, c.check_out_time, c.status
ORDER BY c.check_in_time DESC;

-- View: Admin Actions Summary
CREATE OR REPLACE VIEW admin_actions_summary AS
SELECT
  action,
  COUNT(*) as action_count,
  COUNT(DISTINCT admin_id) as unique_admins,
  MAX(created_at) as last_action_time
FROM admin_audit_logs
GROUP BY action
ORDER BY action_count DESC;

-- View: Attendee Statistics
CREATE OR REPLACE VIEW attendee_statistics AS
SELECT
  booking_id,
  COUNT(*) as total_attendees,
  COUNT(CASE WHEN check_out_time IS NOT NULL THEN 1 END) as checked_out_count,
  COUNT(CASE WHEN check_out_time IS NULL THEN 1 END) as still_checked_in_count
FROM attendee_check_ins
GROUP BY booking_id;
