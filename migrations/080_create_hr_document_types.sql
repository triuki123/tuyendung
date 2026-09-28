-- Migration 080: hr_document_types — loại hồ sơ nhân sự (lookup editable)
CREATE TABLE IF NOT EXISTS public.hr_document_types (
  id          TEXT PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  description TEXT,
  sort_order  INTEGER DEFAULT 0,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hr_document_types_is_active ON public.hr_document_types(is_active);

INSERT INTO public.hr_document_types (id, name, sort_order) VALUES
  ('hdoc_cv',        'Sơ yếu lý lịch / CV',        1),
  ('hdoc_id_card',   'CMND / CCCD',                2),
  ('hdoc_degree',    'Bằng cấp / Chứng chỉ',       3),
  ('hdoc_health',    'Giấy khám sức khỏe',         4),
  ('hdoc_other',     'Giấy tờ khác',               5)
ON CONFLICT (id) DO NOTHING;
