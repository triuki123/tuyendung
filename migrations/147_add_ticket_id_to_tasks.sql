-- Migration 147: liên kết Task ↔ Ticket Hỗ Trợ
-- Một ticket có thể cần nhiều task để hoàn thành; mỗi task thuộc tối đa 1 ticket.
-- Khi ticket bị xóa, task vẫn giữ lại nhưng gỡ liên kết (SET NULL).
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_ticket_id
  ON public.tasks(ticket_id)
  WHERE ticket_id IS NOT NULL;
