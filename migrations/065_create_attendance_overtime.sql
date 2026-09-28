-- 065_create_attendance_overtime.sql
-- Tăng Ca: lưu khai báo tăng ca của nhân sự
-- Khung giờ 1 (tối): 17:30 – 22:00
-- Khung giờ 2 (đêm): 22:01 – 07:00 ngày hôm sau

CREATE TABLE IF NOT EXISTS attendance_overtime (
  id             TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id        TEXT        NOT NULL,
  work_date      DATE        NOT NULL,

  -- Thời gian tăng ca (dạng HH:MM)
  start_time     TEXT        NOT NULL,
  end_time       TEXT        NOT NULL,

  -- Tính toán tự động theo 2 khung giờ
  evening_hours  NUMERIC(4,2) NOT NULL DEFAULT 0, -- 17:30–22:00
  night_hours    NUMERIC(4,2) NOT NULL DEFAULT 0, -- 22:01–07:00+1

  reason         TEXT,
  status         TEXT        NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','approved','rejected','cancelled')),

  reviewed_by    TEXT,
  reviewed_at    TIMESTAMPTZ,
  review_note    TEXT,

  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Một khai báo tăng ca mỗi ngày
  UNIQUE (user_id, work_date)
);

CREATE INDEX IF NOT EXISTS idx_att_overtime_user_date ON attendance_overtime (user_id, work_date);
CREATE INDEX IF NOT EXISTS idx_att_overtime_status    ON attendance_overtime (status);
CREATE INDEX IF NOT EXISTS idx_att_overtime_date      ON attendance_overtime (work_date);
