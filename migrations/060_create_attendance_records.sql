-- Migration 060: Tạo bảng attendance_records
-- Lưu từng lần chấm công (vào/ra) từ app hoặc máy chấm công

CREATE TABLE IF NOT EXISTS public.attendance_records (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL,
  type         TEXT NOT NULL DEFAULT 'app',       -- 'app' | 'machine'
  event_type   TEXT NOT NULL DEFAULT 'check_in',  -- 'check_in' | 'check_out'
  recorded_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  lat          DECIMAL(10,8),
  lng          DECIMAL(11,8),
  photo        BYTEA,
  photo_mime   TEXT,
  notes        TEXT,
  machine_id   TEXT,
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attendance_records_user_id     ON public.attendance_records(user_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_recorded_at ON public.attendance_records(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_records_user_date   ON public.attendance_records(user_id, recorded_at DESC);

SELECT 'Migration 060: attendance_records created' AS migration_status;
