-- Migration 125: Thêm cột bảo trì tài sản + bảng log nhắc
ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS next_maintenance_date TEXT;

CREATE TABLE IF NOT EXISTS asset_reminder_log (
  id             SERIAL PRIMARY KEY,
  asset_id       TEXT        NOT NULL,
  reminder_type  TEXT        NOT NULL,  -- 'warranty' | 'maintenance'
  milestone_days INTEGER     NOT NULL,
  sent_date      DATE        NOT NULL DEFAULT CURRENT_DATE,
  UNIQUE (asset_id, reminder_type, milestone_days, sent_date)
);
