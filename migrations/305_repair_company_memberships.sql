-- Additive repair for skipped migration 149. Resolve ID types from the actual
-- users/company catalogs instead of assuming UUID on legacy installations.
DO $$
DECLARE
  user_type TEXT;
  company_type TEXT;
  department_type TEXT;
  sub_department_type TEXT;
  position_type TEXT;
  job_title_type TEXT;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod) INTO user_type FROM pg_attribute a WHERE a.attrelid='public.users'::regclass AND a.attname='id';
  SELECT format_type(a.atttypid, a.atttypmod) INTO company_type FROM pg_attribute a WHERE a.attrelid='public.companies'::regclass AND a.attname='id';
  SELECT format_type(a.atttypid, a.atttypmod) INTO department_type FROM pg_attribute a WHERE a.attrelid='public.users'::regclass AND a.attname='department_id';
  SELECT format_type(a.atttypid, a.atttypmod) INTO sub_department_type FROM pg_attribute a WHERE a.attrelid='public.users'::regclass AND a.attname='sub_department_id';
  SELECT format_type(a.atttypid, a.atttypmod) INTO position_type FROM pg_attribute a WHERE a.attrelid='public.users'::regclass AND a.attname='position_id';
  SELECT format_type(a.atttypid, a.atttypmod) INTO job_title_type FROM pg_attribute a WHERE a.attrelid='public.users'::regclass AND a.attname='job_title_id';
  EXECUTE format('CREATE TABLE IF NOT EXISTS public.user_company_memberships (
    id UUID PRIMARY KEY, user_id %s NOT NULL, company_id %s NOT NULL,
    role TEXT NOT NULL DEFAULT ''user'', department_id %s, sub_department_id %s,
    position_id %s, job_title_id %s, manager_id %s, module_permissions JSONB,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_user_company UNIQUE (user_id, company_id))',
    user_type, company_type, COALESCE(department_type, user_type), COALESCE(sub_department_type, user_type),
    COALESCE(position_type, user_type), COALESCE(job_title_type, user_type), user_type);
END $$;
CREATE INDEX IF NOT EXISTS idx_ucm_user ON public.user_company_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_ucm_company ON public.user_company_memberships(company_id);
CREATE INDEX IF NOT EXISTS idx_ucm_manager ON public.user_company_memberships(manager_id) WHERE manager_id IS NOT NULL;
