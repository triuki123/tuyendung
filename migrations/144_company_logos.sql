-- Migration 144: logo công ty (lưu BYTEA trong DB, phục vụ động — bền với redeploy)
-- companies.logo_url đã được tham chiếu trong companiesService nhưng cột chưa tồn tại.
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS logo_url TEXT;

CREATE TABLE IF NOT EXISTS company_logos (
  company_id UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  content    BYTEA NOT NULL,
  mime_type  TEXT  NOT NULL DEFAULT 'image/png',
  size_bytes INTEGER,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
