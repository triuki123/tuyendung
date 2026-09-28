-- 066_create_attendance_adjustments.sql
-- Bù Công / Bù Giờ Vào / Bù Giờ Ra: đề xuất điều chỉnh chấm công

CREATE TABLE IF NOT EXISTS attendance_adjustments (
  id                  TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id             TEXT        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  adjustment_type     TEXT        NOT NULL
                        CHECK (adjustment_type IN ('bu_cong','bu_checkin','bu_checkout')),
  work_date           DATE        NOT NULL,

  requested_checkin   TIMESTAMPTZ,
  requested_checkout  TIMESTAMPTZ,
  reason              TEXT        NOT NULL,

  status              TEXT        NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','approved','rejected','cancelled')),

  -- Người duyệt
  reviewed_by         TEXT,
  reviewed_at         TIMESTAMPTZ,
  review_note         TEXT,

  -- Audit: ai tạo yêu cầu (NV tự tạo = NULL, quản lý thêm hộ = managerId)
  created_by          TEXT,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (user_id, work_date, adjustment_type)
);

CREATE INDEX IF NOT EXISTS idx_att_adj_user_date   ON attendance_adjustments (user_id, work_date);
CREATE INDEX IF NOT EXISTS idx_att_adj_status      ON attendance_adjustments (status);
CREATE INDEX IF NOT EXISTS idx_att_adj_work_date   ON attendance_adjustments (work_date);
