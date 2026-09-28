-- Migration 168: gộp "Người nhận" về một nguồn (system_settings.recipient.*)
-- Di trú dữ liệu từ bảng cũ (hr_settings, room_booking_settings) sang system_settings.
-- ON CONFLICT DO NOTHING: nếu admin đã cấu hình recipient.* qua UI mới thì KHÔNG ghi đè.
-- Idempotent: chạy lại không nhân đôi.

-- 1) Người nhận Quản Lý Hồ Sơ: hr_settings.hr_notify_recipient_user_ids (mảng user_id)
INSERT INTO system_settings (key, category, value, updated_at)
SELECT 'recipient.hr_general', 'recipient',
       jsonb_build_object(
         'roles', '[]'::jsonb,
         'includeHrEditors', false,
         'userIds', COALESCE(value, '[]'::jsonb)
       ),
       NOW()
FROM hr_settings
WHERE key = 'hr_notify_recipient_user_ids'
ON CONFLICT (key) DO NOTHING;

-- 2) Người nhận Đặt Phòng Họp: room_booking_settings.settings->'notifyRecipients'
INSERT INTO system_settings (key, category, value, updated_at)
SELECT 'recipient.room_booking', 'recipient',
       jsonb_build_object(
         'roles', '[]'::jsonb,
         'includeHrEditors', false,
         'userIds', COALESCE(settings->'notifyRecipients', '[]'::jsonb)
       ),
       NOW()
FROM room_booking_settings
WHERE id = 1
ON CONFLICT (key) DO NOTHING;
