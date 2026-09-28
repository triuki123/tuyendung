-- Migration 170: QR phòng họp + check-in/check-out vật lý
-- - rooms.code: mã ngắn duy nhất, nhúng vào URL QR dán cửa phòng (vd ROOM-001 / A101)
-- - room_bookings.checked_in_at / checked_out_at: mốc giờ chính xác khi nhận/trả phòng qua QR
--   (confirmed_at sẵn có dùng cho "xác nhận booking"; tách riêng để không lẫn ngữ nghĩa)

ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS code TEXT;

-- Backfill mã tuần tự cho phòng chưa có code (idempotent: chỉ set khi NULL)
UPDATE rooms r
SET code = 'ROOM-' || lpad(t.rn::text, 3, '0')
FROM (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
  FROM rooms
  WHERE code IS NULL OR code = ''
) t
WHERE r.id = t.id AND (r.code IS NULL OR r.code = '');

-- Mã phòng duy nhất (không phân biệt hoa thường), bỏ qua NULL
CREATE UNIQUE INDEX IF NOT EXISTS idx_rooms_code_unique
  ON rooms (lower(code)) WHERE code IS NOT NULL AND code <> '';

ALTER TABLE room_bookings
  ADD COLUMN IF NOT EXISTS checked_in_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS checked_out_at TIMESTAMPTZ;
