-- Migration 061: Tạo bảng attendance_sheets
-- Bảng công hàng tháng của từng nhân sự, manager xem + duyệt

CREATE TABLE IF NOT EXISTS public.attendance_sheets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL,
  month         INTEGER NOT NULL,   -- 1-12
  year          INTEGER NOT NULL,
  status        TEXT NOT NULL DEFAULT 'draft',  -- 'draft'|'submitted'|'approved'|'rejected'
  total_days    INTEGER DEFAULT 0,
  present_days  INTEGER DEFAULT 0,
  late_days     INTEGER DEFAULT 0,
  absent_days   INTEGER DEFAULT 0,
  comment       TEXT,               -- manager ghi chú / kiến nghị
  approved_by   UUID,
  approved_at   TIMESTAMP WITH TIME ZONE,
  submitted_at  TIMESTAMP WITH TIME ZONE,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, month, year)
);

CREATE INDEX IF NOT EXISTS idx_attendance_sheets_user_id    ON public.attendance_sheets(user_id);
CREATE INDEX IF NOT EXISTS idx_attendance_sheets_year_month ON public.attendance_sheets(year DESC, month DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_sheets_status     ON public.attendance_sheets(status);

SELECT 'Migration 061: attendance_sheets created' AS migration_status;
