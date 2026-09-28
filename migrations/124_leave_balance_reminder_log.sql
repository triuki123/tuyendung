-- Migration 124: Bảng log nhắc phép năm sắp hết hạn chuyển năm
CREATE TABLE IF NOT EXISTS leave_balance_reminder_log (
  id          SERIAL PRIMARY KEY,
  user_id     TEXT        NOT NULL,
  year        INTEGER     NOT NULL,
  milestone_days INTEGER  NOT NULL,
  sent_date   DATE        NOT NULL DEFAULT CURRENT_DATE,
  UNIQUE (user_id, year, milestone_days)
);
