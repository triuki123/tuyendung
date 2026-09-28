-- Migration 236: thêm trường thông tin pháp lý công ty (theo luật VN) — tất cả optional
-- (tax_code, address, invoice_address, website đã có sẵn từ trước)
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS business_name        TEXT,   -- tên pháp lý đầy đủ
  ADD COLUMN IF NOT EXISTS legal_representative TEXT,   -- người đại diện pháp luật
  ADD COLUMN IF NOT EXISTS phone                TEXT,   -- điện thoại
  ADD COLUMN IF NOT EXISTS email                TEXT;   -- email công ty
