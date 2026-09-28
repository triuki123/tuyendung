CREATE TABLE IF NOT EXISTS design_requests (
  id text PRIMARY KEY DEFAULT ('drq_' || replace(gen_random_uuid()::text, '-', '')),
  company_id text,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  request_type text NOT NULL DEFAULT 'other',
  priority text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'new',
  requester_id text NOT NULL,
  requester_name text,
  assignee_id text,
  assignee_name text,
  brief_url text,
  result_url text,
  result_note text,
  quantity integer NOT NULL DEFAULT 1,
  estimated_hours numeric(10,2),
  actual_hours numeric(10,2),
  due_date date,
  completed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT design_requests_status CHECK (status IN ('new','accepted','in_progress','review','completed','rejected','archived')),
  CONSTRAINT design_requests_priority CHECK (priority IN ('low','normal','high','urgent'))
);

CREATE INDEX IF NOT EXISTS idx_design_requests_company_status ON design_requests(company_id, status);
CREATE INDEX IF NOT EXISTS idx_design_requests_requester ON design_requests(requester_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_design_requests_assignee ON design_requests(assignee_id, created_at DESC);
