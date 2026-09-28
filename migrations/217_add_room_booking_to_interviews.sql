-- Migration 217: Nối lịch phỏng vấn (trực tiếp) với Đặt Phòng Họp.
-- Lịch onsite tự tạo 1 room_bookings và lưu id tại đây để đồng bộ (huỷ lịch → huỷ phòng).
ALTER TABLE hr_interview_schedules
  ADD COLUMN IF NOT EXISTS room_booking_id TEXT;
