-- Migration 297: LƯU TRỮ thẻ đánh giá.
-- archived_at = mốc lưu trữ (NULL = đang hiển thị). Trực giao với kết quả pass/fail —
-- lưu trữ chỉ ẩn khỏi danh sách chính, KHÔNG mất dữ liệu, xem lại qua bộ lọc.
-- Thủ công (nút Lưu trữ) hoặc tự động (scheduler theo evaluationAutoArchiveDays).
ALTER TABLE evaluations
  ADD COLUMN IF NOT EXISTS archived_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by    UUID;

CREATE INDEX IF NOT EXISTS idx_evaluations_archived
  ON evaluations(archived_at) WHERE archived_at IS NULL;
