-- Migration 209: Hoàn tác migration 208 — xóa nhân viên được re-seed sai
--
-- Migration 208 đã re-seed lại nhân viên FADO vào solace_subscribers dựa trên
-- users.telegram_chat_id. Những người này chưa /start @solacecoffeebot nên
-- broadcast vẫn trả 403. Xóa họ đi, chỉ giữ người thực sự đã /start bot Solace.

DELETE FROM solace_subscribers
WHERE chat_id IN (
  SELECT telegram_chat_id
  FROM users
  WHERE telegram_chat_id IS NOT NULL
)
AND opted_out = false;
