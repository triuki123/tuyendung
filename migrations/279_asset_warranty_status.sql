-- Migration 279: trạng thái bảo hành tài sản — Còn Bảo Hành / Hết Bảo Hành / Không Bảo Hành.
-- warranty_expiry (cột cũ) vẫn là ngày hết hạn thực tế khi có (tự tính hoặc null) — mọi nơi
-- đang đọc cột này (nhắc bảo hành, chi tiết, lịch sử) không cần sửa gì.
ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS warranty_status TEXT CHECK (warranty_status IN ('active', 'expired', 'none')),
  ADD COLUMN IF NOT EXISTS warranty_months INTEGER;
