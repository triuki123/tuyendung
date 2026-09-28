-- Migration 113: đổi type='machine' → 'app' cho records tạo bởi duyệt bù công
-- Các records này bị ẩn khỏi my-records API vì query lọc AND type='app'
UPDATE attendance_records
SET type = 'app'
WHERE type = 'machine'
  AND notes IN ('Bù công - được duyệt', 'Bù giờ vào - được duyệt', 'Bù giờ ra - được duyệt');
