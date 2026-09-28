-- Migration 071: tạo bảng attendance_overtime (khai báo tăng ca)
CREATE TABLE IF NOT EXISTS public.attendance_overtime (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT        NOT NULL,
  work_date     DATE        NOT NULL,
  start_time    TEXT        NOT NULL,
  end_time      TEXT        NOT NULL,
  evening_hours DECIMAL(5,2) NOT NULL DEFAULT 0,
  night_hours   DECIMAL(5,2) NOT NULL DEFAULT 0,
  reason        TEXT,
  status        TEXT        NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','rejected','cancelled')),
  reviewed_by   TEXT,
  reviewed_at   TIMESTAMP WITH TIME ZONE,
  review_note   TEXT,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (user_id, work_date)
);

CREATE INDEX IF NOT EXISTS idx_attendance_overtime_user_id   ON public.attendance_overtime(user_id);
CREATE INDEX IF NOT EXISTS idx_attendance_overtime_work_date ON public.attendance_overtime(work_date);
CREATE INDEX IF NOT EXISTS idx_attendance_overtime_status    ON public.attendance_overtime(status);
