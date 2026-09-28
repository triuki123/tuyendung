-- Migration 313: công khai văn bản qua link (giống biểu mẫu /forms/<token>)
-- is_public   : FALSE = chỉ nội bộ (mặc định, giữ nguyên hành vi cũ)
--               TRUE  = ai có link /thong-bao/<public_token> đều xem được, không cần đăng nhập
-- public_token: token ngẫu nhiên do app sinh khi bật công khai lần đầu, không xoay vòng.
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS is_public    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS public_token TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_documents_public_token
  ON documents (public_token)
  WHERE public_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_documents_is_public
  ON documents (is_public)
  WHERE is_public = TRUE;
