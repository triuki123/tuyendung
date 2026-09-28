-- Migration 220: Bật/tắt Hồ Sơ Chuyên Cần cho từng người dùng.
-- Mặc định FALSE (tắt) — chỉ ai được super_admin bật mới được TÍNH VÀO hồ sơ chuyên cần.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS diligence_enabled BOOLEAN NOT NULL DEFAULT false;
