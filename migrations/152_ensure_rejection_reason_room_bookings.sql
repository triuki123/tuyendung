-- Migration 152: bảo đảm cột rejection_reason tồn tại trên prod
--
-- Bug: webhook Telegram từ chối room booking báo lỗi
--   "column rejection_reason of relation room_bookings does not exist".
-- Nguyên nhân: migration 031 đã định nghĩa cột này NHƯNG reconcile.sql cũ chỉ
-- thêm `rejection_note` cho khối room_bookings → DB prod khởi tạo qua reconcile
-- không có cột rejection_reason.
--
-- Fix idempotent: thêm rejection_reason TEXT nếu chưa có.

ALTER TABLE public.room_bookings
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
