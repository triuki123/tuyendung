-- Migration 077: contract_types — loại hợp đồng (lookup editable)
-- Pattern giống ticket_categories: TEXT PK, name, is_active, sort_order.
CREATE TABLE IF NOT EXISTS public.contract_types (
  id          TEXT PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  description TEXT,
  sort_order  INTEGER DEFAULT 0,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contract_types_is_active ON public.contract_types(is_active);

-- Seed các loại hợp đồng mặc định (idempotent qua id cố định)
INSERT INTO public.contract_types (id, name, sort_order) VALUES
  ('ctype_indefinite', 'Không xác định thời hạn', 1),
  ('ctype_fixed_term', 'Xác định thời hạn',       2),
  ('ctype_probation',  'Thử việc',                3),
  ('ctype_cooperation','Thỏa thuận hợp tác',      4)
ON CONFLICT (id) DO NOTHING;
