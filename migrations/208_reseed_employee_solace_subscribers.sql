-- Migration 208: Khôi phục nhân viên vào solace_subscribers
--
-- Migration 207 đã xoá tất cả subscriber có chat_id trùng users.telegram_chat_id
-- (kể cả những người đã thực sự /start @solacecoffeebot nhưng cũng là nhân viên FADO).
-- Migration này re-seed họ trở lại.
--
-- Cơ chế tự làm sạch:
--   - Ai ĐÃ /start @solacecoffeebot → nhận broadcast bình thường.
--   - Ai CHƯA /start → Telegram trả 403 → sendBroadcast() tự gọi setSubscriberOptOut()
--     → opted_out = true → không bị gửi lần sau. Tự heal sau 1 broadcast.
--
-- ON CONFLICT DO NOTHING: giữ nguyên opted_out = true với người đã tự /stop bot.

INSERT INTO solace_subscribers (chat_id, user_id, name, opted_out, started_at, last_seen_at)
SELECT
  u.telegram_chat_id,
  u.id::text,
  u.name,
  false,
  NOW(),
  NOW()
FROM users u
WHERE u.telegram_chat_id IS NOT NULL
  AND u.status = 'active'
ON CONFLICT (chat_id) DO NOTHING;
