-- Migration 063: Bảng mapping mã máy chấm công ↔ user hệ thống
-- Admin gán employee_code của máy cho từng tài khoản người dùng

CREATE TABLE IF NOT EXISTS public.attendance_machine_mappings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id     TEXT NOT NULL DEFAULT 'default',  -- mã máy (văn phòng A, B...)
  employee_code  TEXT NOT NULL,                     -- mã nhân viên trên máy
  user_id        UUID NOT NULL,                     -- user trong hệ thống
  created_by     UUID,
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(machine_id, employee_code)
);

CREATE INDEX IF NOT EXISTS idx_machine_mappings_machine_code ON public.attendance_machine_mappings(machine_id, employee_code);
CREATE INDEX IF NOT EXISTS idx_machine_mappings_user_id      ON public.attendance_machine_mappings(user_id);

-- Bảng lưu các bản ghi máy đẩy lên nhưng chưa có mapping
CREATE TABLE IF NOT EXISTS public.attendance_unmatched (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id     TEXT NOT NULL,
  employee_code  TEXT NOT NULL,
  event_type     TEXT NOT NULL,
  recorded_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  resolved       BOOLEAN DEFAULT false,
  resolved_to    UUID,   -- user_id sau khi admin resolve
  resolved_at    TIMESTAMP WITH TIME ZONE,
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attendance_unmatched_resolved ON public.attendance_unmatched(resolved);
CREATE INDEX IF NOT EXISTS idx_attendance_unmatched_machine  ON public.attendance_unmatched(machine_id, employee_code);

SELECT 'Migration 063: machine mappings + unmatched tables created' AS migration_status;
