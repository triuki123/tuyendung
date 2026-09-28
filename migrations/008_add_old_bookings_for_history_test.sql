-- =============================================================================
-- Add test bookings with dates older than 7 days to display History button
-- File   : migrations/008_add_old_bookings_for_history_test.sql
-- Purpose: Create bookings from 8-14 days ago so History button displays
--          in Table and Grid views (tests week-based filtering)
-- =============================================================================

-- Insert test bookings from 8-14 days ago (before May 22, 2026 from today May 29, 2026)
INSERT INTO room_bookings (
  id,
  room_name,
  booking_date,
  start_time,
  end_time,
  purpose,
  status,
  requested_by,
  requested_by_name,
  num_participants,
  has_online_meeting,
  needs_room_setup,
  confirmed_at,
  created_at,
  updated_at
)
VALUES
  -- 14 days ago (May 15, 2026) - Cancelled booking
  (
    'booking-old-001',
    'Phòng A101',
    '2026-05-15',
    '09:00',
    '11:00',
    'Họp bộ phận Marketing - Tháng 5',
    'cancelled',
    '4ff71fda-0505-4332-a490-684922435f1c',
    'Admin',
    4,
    false,
    true,
    NULL,
    NOW() - INTERVAL '14 days',
    NOW() - INTERVAL '14 days'
  ),
  -- 12 days ago (May 17, 2026) - Approved and confirmed booking
  (
    'booking-old-002',
    'Phòng B202',
    '2026-05-17',
    '14:00',
    '16:00',
    'Thảo luận dự án mới',
    'approved',
    '4ff71fda-0505-4332-a490-684922435f1c',
    'Admin',
    6,
    true,
    false,
    NOW() - INTERVAL '11 days',
    NOW() - INTERVAL '12 days',
    NOW() - INTERVAL '11 days'
  ),
  -- 10 days ago (May 19, 2026) - Rejected booking
  (
    'booking-old-003',
    'Phòng C303',
    '2026-05-19',
    '10:00',
    '12:00',
    'Gặp gỡ khách hàng',
    'rejected',
    '4ff71fda-0505-4332-a490-684922435f1c',
    'Admin',
    3,
    false,
    true,
    NULL,
    NOW() - INTERVAL '10 days',
    NOW() - INTERVAL '10 days'
  ),
  -- 8 days ago (May 21, 2026) - Pending booking
  (
    'booking-old-004',
    'Phòng A101',
    '2026-05-21',
    '13:00',
    '15:00',
    'Đào tạo nhân viên mới',
    'pending',
    '4ff71fda-0505-4332-a490-684922435f1c',
    'Admin',
    8,
    false,
    true,
    NULL,
    NOW() - INTERVAL '8 days',
    NOW() - INTERVAL '8 days'
  )
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- END OF MIGRATION
-- =============================================================================
