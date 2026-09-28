-- Migration 179: Partial unique index for assets.serial_number
-- Chỉ áp dụng khi serial_number không NULL và không rỗng — cho phép nhiều thiết bị
-- không có serial (NULL hoặc '') nhưng không cho phép 2 thiết bị cùng serial.
CREATE UNIQUE INDEX IF NOT EXISTS idx_assets_serial_number_unique
  ON public.assets(serial_number)
  WHERE serial_number IS NOT NULL AND serial_number <> '';
