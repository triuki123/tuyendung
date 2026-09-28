-- Migration 308: cột đồng bộ SSO (sso.fadoai.com) trên bảng users
-- sso_sync_status: synced | error | skipped_zimbra | NULL (chưa sync)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS sso_user_id     TEXT,
  ADD COLUMN IF NOT EXISTS sso_sync_status TEXT,
  ADD COLUMN IF NOT EXISTS sso_sync_error  TEXT,
  ADD COLUMN IF NOT EXISTS sso_synced_at   TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS users_sso_user_id_key
  ON users (sso_user_id) WHERE sso_user_id IS NOT NULL;
