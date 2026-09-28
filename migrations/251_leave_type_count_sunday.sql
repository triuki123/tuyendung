-- Migration 251: cờ tính Chủ nhật cho loại phép/công (dùng cho work-mode như Làm theo ca).
-- true = khi tạo đề xuất nhiều ngày thì KHÔNG bỏ qua Chủ nhật (CN tính 1 ca bình thường).
ALTER TABLE leave_types
  ADD COLUMN IF NOT EXISTS count_sunday BOOLEAN NOT NULL DEFAULT false;

-- Làm theo ca: giữ hành vi hiện tại (tính CN) làm mặc định — đơn vị cho nghỉ bù trong tuần.
UPDATE leave_types SET count_sunday = true WHERE code = 'lam_theo_ca';
