-- Migration 150: Cấu hình module Đặt Phòng Họp (singleton)
--
-- Trước đây danh sách người nhận thông báo "có booking mới" được hardcode qua env
-- SUPER_ADMIN_TELEGRAM_CHAT_ID (1 chat duy nhất). Migration này cho phép super_admin
-- cấu hình DANH SÁCH user nhận thông báo qua UI Cấu Hình Phòng Họp.
--
-- Bảng dạng singleton (chỉ 1 row, id=1). JSONB linh hoạt cho cấu hình mở rộng sau.

CREATE TABLE IF NOT EXISTS public.room_booking_settings (
  id          INT PRIMARY KEY DEFAULT 1,
  settings    JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  TEXT,
  CONSTRAINT room_booking_settings_singleton CHECK (id = 1)
);

-- Đảm bảo có row mặc định để service không cần lo trường hợp NULL
INSERT INTO public.room_booking_settings (id, settings)
VALUES (1, '{"notifyRecipients": []}'::jsonb)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.room_booking_settings IS
  'Cấu hình module Đặt Phòng Họp (singleton). settings.notifyRecipients = danh sách user_id nhận thông báo khi có booking mới.';
