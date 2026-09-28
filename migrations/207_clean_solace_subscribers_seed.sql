-- Migration 207: Xóa subscriber Solace bị seed sai từ nhân viên nội bộ
--
-- Migration 198 đã seed toàn bộ users.telegram_chat_id vào solace_subscribers,
-- nhưng đây là chat_id của bot FADO Notification (bot chính), không phải của
-- @solacecoffeebot. Những người này chưa bao giờ /start Solace bot nên Telegram
-- từ chối gửi (403) → toàn bộ broadcast fail.
--
-- Chỉ giữ lại subscriber nào THỰC SỰ đã /start @solacecoffeebot:
-- - có user_id = NULL (khách chưa liên kết tài khoản FADO — chắc chắn là khách thật)
-- - hoặc user_id không null nhưng đã được ghi qua handler /start của Solace bot
--   (phân biệt bằng: seeded rows có started_at ≈ thời điểm migration chạy
--    và opted_out = false nhưng chưa có hoạt động thật)
--
-- Cách đơn giản nhất & an toàn: xóa mọi subscriber mà chat_id khớp với
-- users.telegram_chat_id (nghĩa là được seed từ nhân viên, không phải từ /start thật).
-- Nếu nhân viên đó sau này thật sự /start Solace bot, handler sẽ upsert lại đúng.

DELETE FROM solace_subscribers
WHERE chat_id IN (
  SELECT telegram_chat_id
  FROM users
  WHERE telegram_chat_id IS NOT NULL
)
AND opted_out = false;
