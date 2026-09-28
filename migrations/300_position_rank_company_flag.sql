-- Migration 300: Cờ "Hiện ở Nhân sự cấp công ty" cho cấp bậc chức vụ.
-- Cấp bậc bật cờ → mọi CHỨC VỤ thuộc cấp bậc đó trở thành ô gán người ở thẻ công ty (Giám Đốc,
-- GĐĐH, Founder, Cố Vấn HĐQT...). Chỉ-thêm, idempotent.
ALTER TABLE position_ranks ADD COLUMN IF NOT EXISTS show_in_company BOOLEAN NOT NULL DEFAULT false;

-- Seed sẵn cho các cấp bậc CAO (rank 1–3: HĐQT, Ban Giám Đốc, Quản lý cấp công ty) — mặc định
-- toàn hệ thống. Không đổi hành vi cũ (tính năng gán mới chỉ dùng cờ này).
UPDATE position_ranks SET show_in_company = true
  WHERE company_id IS NULL AND rank IN (1, 2, 3) AND show_in_company = false;
