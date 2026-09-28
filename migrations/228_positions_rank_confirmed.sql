-- Migration 228: cờ "đã xác nhận cấp bậc" cho positions.
-- Vấn đề: rank mặc định = 4 (Nhân viên) nên không phân biệt được "HR đã chủ động
-- xếp là Nhân viên" với "chưa ai xếp" → trang Sức Khoẻ báo sai "chưa xếp cấp bậc"
-- cho chức danh đã được xếp đúng là 4.
-- Giải pháp: rank_confirmed = true khi HR lưu chức danh có chọn cấp bậc (service tự set).
ALTER TABLE positions
  ADD COLUMN IF NOT EXISTS rank_confirmed BOOLEAN NOT NULL DEFAULT false;

-- Seed một lần: cấp khác 4 (do seed 226 theo luật hoặc HR đã chỉnh) coi như đã xác nhận
UPDATE positions SET rank_confirmed = true WHERE COALESCE("rank", 4) <> 4 AND rank_confirmed = false;
