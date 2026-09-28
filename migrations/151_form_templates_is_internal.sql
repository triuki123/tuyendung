-- Migration 151: Phân loại biểu mẫu Nội Bộ vs Công Khai
--
-- Mặc định FALSE (Công khai) — giữ nguyên hành vi cũ cho các form đã tồn tại.
-- Khi is_internal = TRUE: API /api/public/forms/:token sẽ yêu cầu cookie phiên,
-- người chưa đăng nhập không xem/nộp được biểu mẫu này.

ALTER TABLE public.form_templates
  ADD COLUMN IF NOT EXISTS is_internal BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.form_templates.is_internal IS
  'TRUE = biểu mẫu nội bộ (chỉ user đăng nhập điền được). FALSE = công khai (ai có link đều điền).';
