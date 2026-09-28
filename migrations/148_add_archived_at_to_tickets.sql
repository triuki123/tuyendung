-- Migration 148: tự động lưu trữ ticket đã kết thúc
-- Ticket hoàn thành (completed/resolved) hoặc hủy (rejected) — và trạng thái
-- cuối closed — sau 7 ngày sẽ được đánh dấu lưu trữ (ẩn khỏi danh sách chính).
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_tickets_archived_at
  ON public.tickets(archived_at);
