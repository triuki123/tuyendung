-- Migration 159: lưu trữ quy trình offboarding
ALTER TABLE offboarding_processes
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS archived_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by  UUID REFERENCES users(id) ON DELETE SET NULL;
