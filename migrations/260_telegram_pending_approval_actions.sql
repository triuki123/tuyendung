CREATE TABLE IF NOT EXISTS telegram_pending_approval_actions (
  id                TEXT PRIMARY KEY,
  telegram_chat_id  TEXT NOT NULL UNIQUE,
  approver_user_id  TEXT NOT NULL,
  approval_type     TEXT NOT NULL,
  request_id        TEXT NOT NULL,
  action            TEXT NOT NULL CHECK (action IN ('reject')),
  source_chat_id    TEXT NOT NULL,
  source_message_id BIGINT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tpaa_type_request
  ON telegram_pending_approval_actions (approval_type, request_id);
