-- Migration 088: Bảng lookup hình thức làm việc với thời hạn mặc định
CREATE TABLE IF NOT EXISTS public.employment_types (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  description           TEXT,
  default_duration_days INTEGER,          -- NULL = vô thời hạn (chính thức)
  requires_evaluation   BOOLEAN NOT NULL DEFAULT false,
  sort_order            INTEGER NOT NULL DEFAULT 0,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Seed dữ liệu mặc định
INSERT INTO public.employment_types (id, name, description, default_duration_days, requires_evaluation, sort_order)
VALUES
  ('etype_probation',   'Thử việc',           'Nhân viên trong thời gian thử việc',   60,   true,  1),
  ('etype_apprentice',  'Học việc',            'Nhân viên trong thời gian học việc',   90,   true,  2),
  ('etype_intern',      'Thực tập',            'Sinh viên thực tập tại công ty',       90,   true,  3),
  ('etype_full_time',   'Toàn thời gian',      'Nhân viên chính thức toàn thời gian',  NULL, false, 4),
  ('etype_part_time',   'Bán thời gian',       'Nhân viên bán thời gian',              NULL, false, 5),
  ('etype_contract',    'Hợp đồng ngắn hạn',   'Hợp đồng lao động có thời hạn',       NULL, false, 6)
ON CONFLICT (id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_employment_types_is_active ON public.employment_types(is_active);
