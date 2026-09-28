CREATE TABLE IF NOT EXISTS fdv_tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  due_at TIMESTAMPTZ NOT NULL,
  remind_at TIMESTAMPTZ NOT NULL,
  done BOOLEAN NOT NULL DEFAULT FALSE,
  reminded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS fdv_tasks_reminders ON fdv_tasks (remind_at) WHERE done = FALSE AND reminded_at IS NULL;
ALTER TABLE fdv_tasks ADD COLUMN IF NOT EXISTS interview_id TEXT;
CREATE TABLE IF NOT EXISTS fdv_requests (
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS fdv_requests_user_time ON fdv_requests (user_id, created_at);
