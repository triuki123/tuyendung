-- Migration 129: Bảng log nhắc onboarding chưa hoàn thành
CREATE TABLE IF NOT EXISTS onboarding_reminder_log (
  id            SERIAL PRIMARY KEY,
  submission_id TEXT NOT NULL,
  sent_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  UNIQUE (submission_id, sent_date)
);
