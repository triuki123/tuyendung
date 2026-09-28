-- Migration 211: lưu tin nhắn duyệt đã gửi qua Telegram để đồng bộ khi duyệt trên web
-- Khi người duyệt thao tác trên web, ta cần biết đã gửi tin nhắn Telegram nào
-- (chat_id + message_id, có thể nhiều người nhận) để gỡ nút + cập nhật trạng thái.
CREATE TABLE IF NOT EXISTS telegram_approval_messages (
  id          TEXT PRIMARY KEY,
  type        TEXT        NOT NULL,               -- leave | adj | adjbatch | ot | room
  request_id  TEXT        NOT NULL,               -- id của yêu cầu tương ứng
  chat_id     TEXT        NOT NULL,
  message_id  BIGINT      NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tg_approval_msg_lookup
  ON telegram_approval_messages (type, request_id);
