-- Migration 089: Thêm trường thời hạn thử việc và employment_type_id vào users
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS employment_type_id     TEXT REFERENCES public.employment_types(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS probation_duration_days INTEGER,   -- Override thời hạn mặc định
  ADD COLUMN IF NOT EXISTS probation_end_date     DATE;       -- Cache: hire_date + duration

CREATE INDEX IF NOT EXISTS idx_users_employment_type_id  ON public.users(employment_type_id);
CREATE INDEX IF NOT EXISTS idx_users_probation_end_date  ON public.users(probation_end_date);
