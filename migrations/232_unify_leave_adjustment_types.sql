-- Migration 232: hợp nhất "loại nghỉ" và "loại bù công" vào leave_types.
-- Thêm 2 cờ: applies_to_adjustment (loại này dùng được ở luồng Bù công/Bù giờ)
--           allow_half_day       (cho phép nghỉ theo buổi: Sáng/Chiều)
-- Seed 3 loại "work-mode" cũ (cong_tac/wfh/lam_theo_ca) thành loại nghỉ hệ thống
-- KHÔNG trừ quỹ + bật applies_to_adjustment → 1 định danh dùng chung 2 luồng.
-- Seed-only + is_system: KHÔNG đổi hành vi khi deploy (chưa luồng nào đọc cờ này ở P1).
ALTER TABLE leave_types
  ADD COLUMN IF NOT EXISTS applies_to_adjustment BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_half_day        BOOLEAN NOT NULL DEFAULT false;

INSERT INTO leave_types
  (code, name, paid_by, deducts_balance, allow_hourly, applies_to_adjustment, allow_half_day, color, is_system, active, sort_order)
VALUES
  ('cong_tac',    'Công tác',           'company', false, false, true, false, '#0ea5e9', true, true, 90),
  ('wfh',         'Làm việc tại nhà',   'company', false, false, true, false, '#8b5cf6', true, true, 91),
  ('lam_theo_ca', 'Làm theo ca',        'company', false, false, true, false, '#14b8a6', true, true, 92)
ON CONFLICT (code) DO NOTHING;
