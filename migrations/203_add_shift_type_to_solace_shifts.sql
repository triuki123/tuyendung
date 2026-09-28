-- Migration 203: loại ca bán hàng (Sáng/Chiều) cho phiên ca Solace.
--  - shift_type: mã ca ('morning' | 'afternoon' | ...) khớp cấu hình ca bán hàng.
--  - shift_label: nhãn hiển thị tại thời điểm mở ca (vd "Ca Sáng") — snapshot để báo cáo ổn định.
ALTER TABLE public.solace_shifts
  ADD COLUMN IF NOT EXISTS shift_type  TEXT,
  ADD COLUMN IF NOT EXISTS shift_label TEXT;
