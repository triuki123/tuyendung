-- Migration 189: Lưu các bản tin Telegram (theo chat) của 1 đơn Solace
-- để khi 1 nhân viên đổi trạng thái thì cập nhật ĐỒNG BỘ nút/tin ở MỌI chat đã gửi.
-- Idempotent.
CREATE TABLE IF NOT EXISTS public.solace_order_messages (
  order_id   TEXT NOT NULL,
  chat_id    TEXT NOT NULL,
  message_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (order_id, chat_id, message_id)
);
CREATE INDEX IF NOT EXISTS idx_solace_order_messages_order
  ON public.solace_order_messages (order_id);
