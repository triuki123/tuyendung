-- Migration 155: Ảnh chữ ký email phục vụ PUBLIC (avatar/logo dán sang email vẫn tải được).
-- Mọi ảnh đưa vào chữ ký (upload mới / copy từ user_avatars / copy từ company_logos)
-- được lưu BYTEA ở đây và phục vụ qua route public /api/public/signature-image/[id]
-- (không cần cookie) → mail client của người nhận tải được.
CREATE TABLE IF NOT EXISTS public.signature_images (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  mime_type  TEXT NOT NULL DEFAULT 'image/png',
  content    BYTEA NOT NULL,
  size_bytes INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_signature_images_user ON public.signature_images(user_id);
