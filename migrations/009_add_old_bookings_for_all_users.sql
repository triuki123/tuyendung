-- Add test bookings >7 days old for all active users to show History button
-- File   : migrations/009_add_old_bookings_for_all_users.sql
-- Purpose: Create old bookings for primary system users so History button displays

-- For user: 15895d78-806a-4cf4-9cac-04391f3949b4 (Vương Kiều My)
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
) VALUES
  (
    'booking-user1-old-001',
    'Phòng A101',
    '2026-05-14',
    '09:00',
    '11:00',
    'Họp đánh giá hiệu suất tháng 5',
    'approved',
    '15895d78-806a-4cf4-9cac-04391f3949b4',
    'Vương Kiều My',
    5,
    false,
    true,
    NOW() - INTERVAL '14 days',
    NOW() - INTERVAL '15 days',
    NOW() - INTERVAL '14 days'
  ),
  (
    'booking-user1-old-002',
    'Phòng B202',
    '2026-05-16',
    '14:00',
    '16:00',
    'Thảo luận kế hoạch Q2',
    'cancelled',
    '15895d78-806a-4cf4-9cac-04391f3949b4',
    'Vương Kiều My',
    8,
    true,
    false,
    NULL,
    NOW() - INTERVAL '13 days',
    NOW() - INTERVAL '12 days'
  )
ON CONFLICT (id) DO NOTHING;

-- For user: 42381a03-13d0-4bb0-9242-c7f4b27c47ac (Hồ Mai Thy)
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
) VALUES
  (
    'booking-user2-old-001',
    'Phòng C303',
    '2026-05-18',
    '10:00',
    '12:00',
    'Tập huấn kỹ năng lãnh đạo',
    'approved',
    '42381a03-13d0-4bb0-9242-c7f4b27c47ac',
    'Hồ Mai Thy',
    12,
    false,
    true,
    NOW() - INTERVAL '11 days',
    NOW() - INTERVAL '11 days',
    NOW() - INTERVAL '11 days'
  ),
  (
    'booking-user2-old-002',
    'Phòng A101',
    '2026-05-20',
    '13:00',
    '15:00',
    'Cập nhật chiến lược bán hàng',
    'rejected',
    '42381a03-13d0-4bb0-9242-c7f4b27c47ac',
    'Hồ Mai Thy',
    6,
    true,
    false,
    NULL,
    NOW() - INTERVAL '9 days',
    NOW() - INTERVAL '9 days'
  )
ON CONFLICT (id) DO NOTHING;

-- For user: 4ff71fda-0505-4332-a490-684922435f1c (Admin)
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
) VALUES
  (
    'booking-user3-old-001',
    'Phòng B202',
    '2026-05-19',
    '09:00',
    '11:30',
    'Cuộc họp tổng kết dự án',
    'approved',
    '4ff71fda-0505-4332-a490-684922435f1c',
    'Admin',
    10,
    true,
    true,
    NOW() - INTERVAL '10 days',
    NOW() - INTERVAL '10 days',
    NOW() - INTERVAL '10 days'
  )
ON CONFLICT (id) DO NOTHING;
