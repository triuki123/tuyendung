-- Migration 205: cờ trừ nghỉ trưa theo từng nhân sự (xử lý ca đặc biệt, vd tài xế làm xuyên trưa)
-- Mặc định TRUE = trừ 1h nghỉ trưa như cũ → deploy KHÔNG đổi hành vi của ai.
-- FALSE = không trừ trưa (giờ làm tính trọn từ check-in đến check-out).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS deduct_lunch BOOLEAN NOT NULL DEFAULT true;
