-- =============================================================================
-- AssetFlow Pro — Complete Database Schema
-- File   : docker/postgres/init/01-schema.sql
-- Purpose: Runs ONCE on fresh Postgres 16 container first-init
--          (docker-entrypoint-initdb.d). Idempotent throughout.
-- Notes  : No Supabase RLS policies, no auth.uid() references.
--          App-level auth handles access control.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- provides gen_random_uuid()

-- =============================================================================
-- SECTION 1: CORE USER / ORGANISATION TABLES
-- Dependency order: companies → departments → sub_departments
--                   companies → job_titles
--                   companies → positions
--                   users (self-ref manager_id deferred via TEXT FK)
--                   users → user_tags
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1.1  companies
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.companies (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name         VARCHAR(255) NOT NULL UNIQUE,
  code         VARCHAR(50)  NOT NULL UNIQUE,
  slug         VARCHAR(255),                -- generated; UNIQUE constraint added below
  description  TEXT,
  address      TEXT,
  invoice_address TEXT,
  phone        VARCHAR(20),
  email        VARCHAR(255),
  website      VARCHAR(255),
  tax_code     VARCHAR(50),
  is_active    BOOLEAN      NOT NULL DEFAULT true,
  created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Add unique constraint on slug only if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'companies_slug_key' AND conrelid = 'public.companies'::regclass
  ) THEN
    -- Slug uniqueness; nullable initially, so we use a partial unique index
    EXECUTE 'CREATE UNIQUE INDEX companies_slug_key ON public.companies(slug) WHERE slug IS NOT NULL';
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_companies_name   ON public.companies(name);
CREATE INDEX IF NOT EXISTS idx_companies_code   ON public.companies(code);
CREATE INDEX IF NOT EXISTS idx_companies_slug   ON public.companies(slug);
CREATE INDEX IF NOT EXISTS idx_companies_active ON public.companies(is_active);

-- Helper function: generate URL-friendly slug from a company name
CREATE OR REPLACE FUNCTION generate_slug_from_name(text_input VARCHAR)
RETURNS VARCHAR LANGUAGE plpgsql AS $$
BEGIN
  IF text_input IS NULL OR TRIM(text_input) = '' THEN
    RETURN '';
  END IF;
  RETURN LOWER(
    TRIM(
      REGEXP_REPLACE(
        REGEXP_REPLACE(
          REGEXP_REPLACE(text_input, '[^a-z0-9\s-]', '', 'gi'),
          '\s+', '-', 'g'
        ),
        '-+', '-', 'g'
      ),
      '-', 'both'
    )
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 1.2  users  (TEXT PK — matches legacy Supabase user IDs)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
  id                 TEXT        PRIMARY KEY,
  email              TEXT        NOT NULL UNIQUE,
  name               TEXT        NOT NULL,
  password           TEXT        NOT NULL,
  role               TEXT        NOT NULL DEFAULT 'user',
  "roleLabel"        TEXT        NOT NULL DEFAULT 'User',
  department         TEXT        NOT NULL DEFAULT '',
  position           TEXT                 DEFAULT '',
  avatar             TEXT                 DEFAULT '',
  phone              TEXT                 DEFAULT '',
  bio                TEXT                 DEFAULT '',
  status             TEXT        NOT NULL DEFAULT 'active',
  company            TEXT                 DEFAULT 'FADO Group',
  -- company_id and sub_department_id written by usersService createUser/updateUser
  company_id         TEXT                 DEFAULT '',
  sub_department_id  TEXT                 DEFAULT '',
  tags               TEXT[]               DEFAULT '{}',
  -- FK columns added after referenced tables exist (see below)
  job_title_id       UUID,
  manager_id         TEXT,                -- self-ref; FK added below
  position_id        UUID,
  module_permissions JSONB       NOT NULL DEFAULT '{}'::JSONB,
  last_login         TIMESTAMP WITH TIME ZONE,
  created_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_by         TEXT        NOT NULL DEFAULT 'system',
  updated_by         TEXT        NOT NULL DEFAULT 'system'
);

CREATE INDEX IF NOT EXISTS idx_users_email              ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_status             ON public.users(status);
CREATE INDEX IF NOT EXISTS idx_users_role               ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_users_company            ON public.users(company);
CREATE INDEX IF NOT EXISTS idx_users_company_id         ON public.users(company_id);
CREATE INDEX IF NOT EXISTS idx_users_tags               ON public.users USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_users_module_permissions ON public.users USING GIN (module_permissions);

COMMENT ON COLUMN public.users.module_permissions IS
  'JSON object storing module-based permissions. Format: {"module-id": ["view","create","edit","delete","approve","export"], ...}';
COMMENT ON COLUMN public.users.manager_id IS
  'Reference to the user who directly manages this user. Independent from the org-unit (company/department/sub_department).';

-- ---------------------------------------------------------------------------
-- 1.3  departments  (requires companies + users for manager_id)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.departments (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID         NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name        VARCHAR(255) NOT NULL,
  code        VARCHAR(50),
  description TEXT,
  -- manager_id is TEXT to match users.id TEXT PK.
  -- Source migrations declared it UUID, but that causes a type-mismatch FK
  -- error on plain Postgres. Fixed here to TEXT.
  manager_id  TEXT         REFERENCES public.users(id) ON DELETE SET NULL,
  is_active   BOOLEAN      NOT NULL DEFAULT true,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, name)
);

CREATE INDEX IF NOT EXISTS idx_departments_company_id ON public.departments(company_id);
CREATE INDEX IF NOT EXISTS idx_departments_name       ON public.departments(name);
CREATE INDEX IF NOT EXISTS idx_departments_manager_id ON public.departments(manager_id);
CREATE INDEX IF NOT EXISTS idx_departments_active     ON public.departments(is_active);

-- ---------------------------------------------------------------------------
-- 1.4  sub_departments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sub_departments (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID         NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  name          VARCHAR(255) NOT NULL,
  code          VARCHAR(50),
  description   TEXT,
  -- TEXT to match users.id TEXT PK (same fix as departments.manager_id above)
  manager_id    TEXT         REFERENCES public.users(id) ON DELETE SET NULL,
  is_active     BOOLEAN      NOT NULL DEFAULT true,
  created_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(department_id, name)
);

CREATE INDEX IF NOT EXISTS idx_sub_departments_department_id ON public.sub_departments(department_id);
CREATE INDEX IF NOT EXISTS idx_sub_departments_name          ON public.sub_departments(name);
CREATE INDEX IF NOT EXISTS idx_sub_departments_manager_id    ON public.sub_departments(manager_id);
CREATE INDEX IF NOT EXISTS idx_sub_departments_active        ON public.sub_departments(is_active);

-- ---------------------------------------------------------------------------
-- 1.5  job_titles  (company-scoped)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.job_titles (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID         NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title       VARCHAR(255) NOT NULL,
  description TEXT,
  is_active   BOOLEAN      NOT NULL DEFAULT true,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, title)
);

CREATE INDEX IF NOT EXISTS idx_job_titles_company_id ON public.job_titles(company_id);
CREATE INDEX IF NOT EXISTS idx_job_titles_active     ON public.job_titles(is_active);

-- ---------------------------------------------------------------------------
-- 1.6  positions  (company-scoped job roles)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.positions (
  id               UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID           NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name             VARCHAR(255)   NOT NULL,
  description      TEXT,
  salary_range_min DECIMAL(12, 2),
  salary_range_max DECIMAL(12, 2),
  is_active        BOOLEAN        NOT NULL DEFAULT true,
  created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, name)
);

CREATE INDEX IF NOT EXISTS idx_positions_company_id ON public.positions(company_id);
CREATE INDEX IF NOT EXISTS idx_positions_active     ON public.positions(is_active);

-- ---------------------------------------------------------------------------
-- 1.7  Back-fill FK columns on users now that referenced tables exist
--      Use ADD COLUMN IF NOT EXISTS + separate ADD CONSTRAINT to stay idempotent.
-- ---------------------------------------------------------------------------

-- job_title_id FK
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS job_title_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_job_title_id_fkey' AND conrelid = 'public.users'::regclass
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_job_title_id_fkey
      FOREIGN KEY (job_title_id) REFERENCES public.job_titles(id) ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_users_job_title_id ON public.users(job_title_id);

-- position_id FK
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS position_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_position_id_fkey' AND conrelid = 'public.users'::regclass
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_position_id_fkey
      FOREIGN KEY (position_id) REFERENCES public.positions(id) ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_users_position_id ON public.users(position_id);

COMMENT ON COLUMN public.users.position_id IS
  'Reference to the position/job role assigned to this user within their company.';

-- manager_id self-ref FK (TEXT → TEXT)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS manager_id TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_manager_id_fkey' AND conrelid = 'public.users'::regclass
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_manager_id_fkey
      FOREIGN KEY (manager_id) REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_users_manager_id ON public.users(manager_id);

-- ---------------------------------------------------------------------------
-- 1.8  tags  (global, not company-scoped)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tags (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  color       VARCHAR(7)   NOT NULL DEFAULT '#6366f1',
  is_active   BOOLEAN      NOT NULL DEFAULT true,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tags_name   ON public.tags(name);
CREATE INDEX IF NOT EXISTS idx_tags_active ON public.tags(is_active);

-- ---------------------------------------------------------------------------
-- 1.9  user_tags  (junction)
-- NOTE: users.id is TEXT; FK cast as TEXT to match.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_tags (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tag_id     UUID NOT NULL REFERENCES public.tags(id)  ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_user_tags_user_id ON public.user_tags(user_id);
CREATE INDEX IF NOT EXISTS idx_user_tags_tag_id  ON public.user_tags(tag_id);

-- =============================================================================
-- SECTION 2: SYSTEM CONFIG
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.system_configs (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  type       TEXT    NOT NULL CHECK (type IN ('role', 'department', 'company')),
  name       TEXT    NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_by TEXT    NOT NULL DEFAULT 'system',
  UNIQUE(type, name)
);

CREATE INDEX IF NOT EXISTS idx_system_configs_type ON public.system_configs(type);
CREATE INDEX IF NOT EXISTS idx_system_configs_name ON public.system_configs(name);

-- Default seed values
INSERT INTO public.system_configs (type, name, created_by) VALUES
  ('role',       'super_admin',    'system'),
  ('role',       'admin',          'system'),
  ('role',       'user',           'system'),
  ('department', 'Ban Giám Đốc',   'system'),
  ('department', 'Nhân Sự',        'system'),
  ('department', 'Kỹ Thuật',       'system'),
  ('company',    'FADO Group',     'system')
ON CONFLICT (type, name) DO NOTHING;

-- =============================================================================
-- SECTION 3: AUDIT LOGS
-- =============================================================================

-- audit_logs is a superset covering all writer variants:
--   usersService.addAuditLog  : id (TEXT), action, "userId", details, "performedBy", timestamp
--   tagsService.addAuditLog   : action, table_name, record_id, changes, created_by
--   assets/route.ts + org services (companies/departments/positions/jobTitles/subDepartments):
--                               admin_id, action, details, asset_id, asset_code, asset_name,
--                               asset_type, timestamp, created_at
--   usersService.getAuditLogs filters on "userId" — that quoted column must exist.
--   All non-universal columns are nullable.
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id             TEXT         PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  action         TEXT         NOT NULL,
  -- usersService writer columns (camelCase preserved via double-quotes)
  "userId"       TEXT,
  "performedBy"  TEXT,
  -- org-services / asset-route writer columns
  admin_id       TEXT                     DEFAULT '',
  target_user_id TEXT,
  details        TEXT,
  -- tagsService writer columns
  table_name     TEXT,
  record_id      TEXT,
  changes        TEXT,
  created_by     TEXT,
  -- asset-history extension columns
  asset_id       UUID,
  asset_code     VARCHAR(100),
  asset_name     VARCHAR(255),
  asset_type     VARCHAR(50),
  "timestamp"    TIMESTAMP WITH TIME ZONE,
  created_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_admin_id       ON public.audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_user_id ON public.audit_logs(target_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action         ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id        ON public.audit_logs("userId");
CREATE INDEX IF NOT EXISTS idx_audit_logs_asset_id       ON public.audit_logs(asset_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp      ON public.audit_logs("timestamp" DESC);

-- =============================================================================
-- SECTION 4: ASSET MANAGEMENT TABLES
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 4.1  asset_categories
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.asset_categories (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  color       VARCHAR(7)   NOT NULL DEFAULT '#6366f1',
  is_active   BOOLEAN      NOT NULL DEFAULT true,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_asset_categories_name   ON public.asset_categories(name);
CREATE INDEX IF NOT EXISTS idx_asset_categories_active ON public.asset_categories(is_active);

INSERT INTO public.asset_categories (name, description, color, is_active) VALUES
  ('Laptop',          'Máy tính xách tay',                  '#3b82f6', true),
  ('Màn hình',        'Màn hình máy tính',                  '#8b5cf6', true),
  ('Điện thoại',      'Điện thoại di động',                 '#ec4899', true),
  ('Máy in',          'Máy in và thiết bị scan',            '#f59e0b', true),
  ('Máy tính bảng',   'Máy tính bảng và tablet',            '#10b981', true),
  ('Thiết bị mạng',   'Router, switch, access point',       '#06b6d4', true),
  ('Máy chủ',         'Server và máy chủ vật lý',           '#6366f1', true),
  ('Phụ kiện',        'Chuột, bàn phím, cáp và phụ kiện khác', '#64748b', true)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4.2  assets  (main asset register)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.assets (
  id                UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  code              TEXT           NOT NULL UNIQUE,
  name              TEXT           NOT NULL,
  category          TEXT           NOT NULL,
  brand             TEXT,
  model             TEXT,
  serial_number     TEXT,
  status            TEXT           NOT NULL DEFAULT 'active',
  assigned_to       TEXT,
  assigned_to_name  TEXT,
  -- plain-text department used by assets/route.ts and assets/[id]/route.ts
  department        TEXT,
  -- structured org-unit FK columns used by hardware/route.ts
  company_id        UUID           REFERENCES public.companies(id)       ON DELETE SET NULL,
  department_id     UUID           REFERENCES public.departments(id)     ON DELETE SET NULL,
  sub_department_id UUID           REFERENCES public.sub_departments(id) ON DELETE SET NULL,
  purchase_date     TEXT,
  warranty_expiry   TEXT,
  value             NUMERIC(15, 2),
  condition         TEXT,
  location          TEXT,
  notes             TEXT,
  image_url         TEXT           NOT NULL DEFAULT '',
  created_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assets_code              ON public.assets(code);
CREATE INDEX IF NOT EXISTS idx_assets_status            ON public.assets(status);
CREATE INDEX IF NOT EXISTS idx_assets_category          ON public.assets(category);
CREATE INDEX IF NOT EXISTS idx_assets_department        ON public.assets(department);
CREATE INDEX IF NOT EXISTS idx_assets_company_id        ON public.assets(company_id);
CREATE INDEX IF NOT EXISTS idx_assets_department_id     ON public.assets(department_id);
CREATE INDEX IF NOT EXISTS idx_assets_sub_department_id ON public.assets(sub_department_id);

-- ---------------------------------------------------------------------------
-- 4.3  delete_requests  (asset deletion workflow)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.delete_requests (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id          UUID         NOT NULL,
  asset_code        VARCHAR(100) NOT NULL,
  asset_name        VARCHAR(255) NOT NULL,
  asset_type        VARCHAR(50),
  requested_by      UUID,
  requested_by_name VARCHAR(255),
  requested_at      TIMESTAMP WITH TIME ZONE,
  reason            TEXT,
  status            VARCHAR(50)  NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  reviewed_by       UUID,
  reviewed_at       TIMESTAMP WITH TIME ZONE,
  review_note       TEXT,
  created_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delete_requests_status       ON public.delete_requests(status);
CREATE INDEX IF NOT EXISTS idx_delete_requests_asset_id     ON public.delete_requests(asset_id);
CREATE INDEX IF NOT EXISTS idx_delete_requests_requested_by ON public.delete_requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_delete_requests_created_at   ON public.delete_requests(created_at DESC);

-- =============================================================================
-- SECTION 5: LEGACY IT-ASSET TABLES (software / domains / hardware / email_accounts)
-- These use TEXT PKs matching the original Supabase design.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 5.1  software
--      Column names match softwareService.ts toDatabaseFormat exactly
--      (all lowercase, no camelCase).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.software (
  id                 TEXT           PRIMARY KEY,
  softwarename       TEXT           NOT NULL DEFAULT '',
  vendor             TEXT           NOT NULL DEFAULT '',
  category           TEXT                    DEFAULT 'productivity',
  licensetype        TEXT                    DEFAULT 'subscription',
  totallicenses      INTEGER                 DEFAULT 0,
  usedlicenses       INTEGER                 DEFAULT 0,
  unitcost           DECIMAL(10, 2)          DEFAULT 0,
  purchasedate       TEXT                    DEFAULT '',
  renewaldate        TEXT                    DEFAULT '',
  department         TEXT                    DEFAULT '',
  manager            TEXT                    DEFAULT '',
  status             TEXT                    DEFAULT 'active'
                       CHECK (status IN ('active', 'expiring', 'expired')),
  notes              TEXT                    DEFAULT '',
  totalcost          DECIMAL(15, 2)          DEFAULT 0,
  licensesavailable  INTEGER                 DEFAULT 0,
  usagepercentage    DECIMAL(5, 2)           DEFAULT 0,
  created_at         TIMESTAMP               NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMP               NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_software_status ON public.software(status);
CREATE INDEX IF NOT EXISTS idx_software_name   ON public.software(softwarename);

-- ---------------------------------------------------------------------------
-- 5.2  domains
--      Column names match domainsService.ts toDatabaseFormat exactly
--      (all lowercase, no camelCase).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.domains (
  id               TEXT           PRIMARY KEY,
  domainname       TEXT           NOT NULL UNIQUE DEFAULT '',
  tld              TEXT                    DEFAULT '',
  registrar        TEXT           NOT NULL DEFAULT '',
  registrationdate TEXT                    DEFAULT '',
  expirationdate   TEXT                    DEFAULT '',
  autorenew        BOOLEAN                 DEFAULT FALSE,
  accountusername  TEXT                    DEFAULT '',
  accountpassword  TEXT                    DEFAULT '',
  ownercompany     TEXT                    DEFAULT '',
  manager          TEXT                    DEFAULT '',
  cost             DECIMAL(10, 2)          DEFAULT 0,
  renewalcost      DECIMAL(10, 2)          DEFAULT 0,
  dnsprovider      TEXT                    DEFAULT '',
  sslcertificate   TEXT                    DEFAULT '',
  sslexpirydate    TEXT                    DEFAULT '',
  status           TEXT                    DEFAULT 'active'
                     CHECK (status IN ('active', 'expiring', 'expired')),
  notes            TEXT                    DEFAULT '',
  created_at       TIMESTAMP               NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP               NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_domains_status     ON public.domains(status);
CREATE INDEX IF NOT EXISTS idx_domains_domainname ON public.domains(domainname);

-- ---------------------------------------------------------------------------
-- 5.3  hardware
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hardware (
  id             TEXT           PRIMARY KEY,
  name           TEXT           NOT NULL,
  type           TEXT           NOT NULL,
  serialnumber   TEXT           NOT NULL UNIQUE,
  manufacturer   TEXT                    DEFAULT '',
  model          TEXT                    DEFAULT '',
  purchasedate   TEXT                    DEFAULT '',
  cost           DECIMAL(15, 2)          DEFAULT 0,
  warrantyexpiry TEXT                    DEFAULT '',
  assignedto     TEXT                    DEFAULT '',
  status         TEXT                    DEFAULT 'active'
                   CHECK (status IN ('active', 'maintenance', 'decommissioned')),
  notes          TEXT                    DEFAULT '',
  created_at     TIMESTAMP               NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMP               NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hardware_status       ON public.hardware(status);
CREATE INDEX IF NOT EXISTS idx_hardware_type         ON public.hardware(type);
CREATE INDEX IF NOT EXISTS idx_hardware_serialnumber ON public.hardware(serialnumber);

-- ---------------------------------------------------------------------------
-- 5.4  email_accounts
--      Column names match emailAccountsService.ts toDatabaseFormat exactly
--      (all lowercase). Legacy camelCase columns removed.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_accounts (
  id                  TEXT          PRIMARY KEY,
  emailaddress        TEXT          NOT NULL UNIQUE DEFAULT '',
  emailprovider       TEXT          NOT NULL DEFAULT '',
  initialpassword     TEXT                   DEFAULT 'changeme123',
  currentpassword     TEXT                   DEFAULT '',
  passwordchangeddate TEXT                   DEFAULT '',
  assigneduser        TEXT                   DEFAULT '',
  nguoisudung         TEXT                   DEFAULT '',
  userfullname        TEXT                   DEFAULT '',
  userposition        TEXT                   DEFAULT '',
  congtydonvi         TEXT                   DEFAULT '',
  company             TEXT                   DEFAULT '',
  phongban            TEXT                   DEFAULT '',
  department          TEXT                   DEFAULT '',
  assigneddate        TEXT                   DEFAULT '',
  createddate         TEXT                   DEFAULT '',
  lastlogin           TEXT                   DEFAULT '',
  storagequota        DECIMAL(10, 2)         DEFAULT 0,
  storageused         DECIMAL(10, 2)         DEFAULT 0,
  forwarding          TEXT                   DEFAULT '',
  recoveryemail       TEXT                   DEFAULT '',
  recoveryphone       TEXT                   DEFAULT '',
  twofaenabled        BOOLEAN                DEFAULT FALSE,
  contactphone        TEXT                   DEFAULT '',
  contactemail        TEXT                   DEFAULT '',
  assigned_user       TEXT                   DEFAULT '',
  status              TEXT                   DEFAULT 'active'
                        CHECK (status IN ('active', 'locked', 'archived', 'inactive', 'expired')),
  notes               TEXT                   DEFAULT '',
  created_at          TIMESTAMP              NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP              NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_accounts_status       ON public.email_accounts(status);
CREATE INDEX IF NOT EXISTS idx_email_accounts_emailaddress ON public.email_accounts(emailaddress);
CREATE INDEX IF NOT EXISTS idx_email_accounts_emailprovider ON public.email_accounts(emailprovider);
CREATE INDEX IF NOT EXISTS idx_email_accounts_nguoisudung  ON public.email_accounts(nguoisudung);
CREATE INDEX IF NOT EXISTS idx_email_accounts_congtydonvi  ON public.email_accounts(congtydonvi);
CREATE INDEX IF NOT EXISTS idx_email_accounts_phongban     ON public.email_accounts(phongban);

-- =============================================================================
-- SECTION 6: TICKETS
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.tickets (
  id               UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  code             TEXT  NOT NULL UNIQUE,
  title            TEXT  NOT NULL,
  description      TEXT,
  asset_code       TEXT,
  asset_name       TEXT,
  priority         TEXT  NOT NULL DEFAULT 'medium',
  status           TEXT  NOT NULL DEFAULT 'open',
  created_by       TEXT  NOT NULL,
  created_by_name  TEXT,
  assigned_to      TEXT,
  assigned_to_name TEXT,
  support_category TEXT,
  created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
  -- No FK on created_by — assigned_to may hold a support category name
  -- (see migration 009_fix_assigned_to_constraint.sql)
);

CREATE INDEX IF NOT EXISTS idx_tickets_created_by       ON public.tickets(created_by);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to      ON public.tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tickets_status           ON public.tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_support_category ON public.tickets(support_category);
CREATE INDEX IF NOT EXISTS idx_tickets_code             ON public.tickets(code);

-- ---------------------------------------------------------------------------
-- 6.1  ticket_status_history
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ticket_status_history (
  id              UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id       UUID  NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  old_status      TEXT,
  new_status      TEXT  NOT NULL,
  changed_by      TEXT  NOT NULL,
  changed_by_name TEXT,
  reason          TEXT,
  created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_status_history_ticket_id  ON public.ticket_status_history(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_status_history_created_at ON public.ticket_status_history(created_at);

-- =============================================================================
-- SECTION 7: NOTIFICATIONS
-- =============================================================================

-- notifications.user_id is TEXT (matches users.id TEXT PK).
-- domain_id is TEXT (loosely linked to domains; no strict FK needed because
-- the app also stores non-domain domain_id values).
CREATE TABLE IF NOT EXISTS public.notifications (
  id         UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT  NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type       TEXT  NOT NULL,
  title      TEXT  NOT NULL,
  message    TEXT  NOT NULL,
  domain_id  TEXT,
  icon       TEXT  NOT NULL DEFAULT 'bell',
  read       BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id   ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read      ON public.notifications(read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read  ON public.notifications(user_id, read);

-- notification_history — tracks which domain notifications have been sent
CREATE TABLE IF NOT EXISTS public.notification_history (
  id                UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id         TEXT  NOT NULL,
  notification_type TEXT  NOT NULL,
  created_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_history_domain_id         ON public.notification_history(domain_id);
CREATE INDEX IF NOT EXISTS idx_notification_history_notification_type  ON public.notification_history(notification_type);
CREATE INDEX IF NOT EXISTS idx_notification_history_domain_type        ON public.notification_history(domain_id, notification_type);
CREATE INDEX IF NOT EXISTS idx_notification_history_created            ON public.notification_history(created_at);

-- =============================================================================
-- SECTION 8: TASKS
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.tasks (
  id               TEXT  PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  code             TEXT,
  task_code        VARCHAR(20) UNIQUE,
  title            TEXT  NOT NULL,
  description      TEXT,
  priority         TEXT  NOT NULL DEFAULT 'medium',
  status           TEXT  NOT NULL DEFAULT 'open',
  assigned_to      TEXT,
  assigned_to_name TEXT,
  created_by       TEXT,
  due_date         TEXT,
  related_asset    TEXT,
  archived_at      TIMESTAMP,
  created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_task_code   ON public.tasks(task_code);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at  ON public.tasks(created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_status      ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON public.tasks(assigned_to);
CREATE INDEX IF NOT EXISTS tasks_archived_at_idx
  ON public.tasks(archived_at) WHERE archived_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS tasks_archived_status_updated_idx
  ON public.tasks(status, updated_at) WHERE archived_at IS NULL AND status = 'done';

-- ---------------------------------------------------------------------------
-- 8.1  task_activities  (activity log / history for tasks)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.task_activities (
  id                    BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  task_id               TEXT   NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id               TEXT,
  action                TEXT   NOT NULL,
  old_value             TEXT,
  new_value             TEXT,
  description           TEXT,
  created_by_user_id    TEXT,
  created_by_user_name  TEXT,
  created_at            TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT valid_task_action CHECK (
    action IN ('created', 'status_changed', 'archived', 'restored',
               'commented', 'assigned', 'title_changed', 'description_changed')
  )
);

CREATE INDEX IF NOT EXISTS idx_task_activities_task_id    ON public.task_activities(task_id);
CREATE INDEX IF NOT EXISTS idx_task_activities_created_at ON public.task_activities(created_at);
CREATE INDEX IF NOT EXISTS idx_task_activities_action     ON public.task_activities(action);

-- View: daily task-code counter (used by code-generation logic)
CREATE OR REPLACE VIEW public.task_code_counter AS
SELECT
  DATE(created_at) AS task_date,
  COUNT(*)         AS count_today
FROM public.tasks
WHERE task_code IS NOT NULL
GROUP BY DATE(created_at);

-- =============================================================================
-- SECTION 9: ROOM MANAGEMENT
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 9.1  rooms
--      Column set inferred from API routes + UI components:
--      name, capacity, location (all required by UI).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rooms (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT         NOT NULL UNIQUE,
  capacity    INTEGER      NOT NULL DEFAULT 0,
  location    TEXT                  DEFAULT '',
  description TEXT,
  is_active   BOOLEAN      NOT NULL DEFAULT true,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rooms_name      ON public.rooms(name);
CREATE INDEX IF NOT EXISTS idx_rooms_is_active ON public.rooms(is_active);

-- ---------------------------------------------------------------------------
-- 9.2  room_bookings
--      Columns from: mockData MOCK_ROOM_BOOKINGS + route.ts field usage
--      + migration 011_add_confirmation_to_room_bookings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.room_bookings (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  room_name         TEXT         NOT NULL,
  booking_date      TEXT         NOT NULL,
  start_time        TEXT         NOT NULL,
  end_time          TEXT         NOT NULL,
  purpose           TEXT,
  requested_by      TEXT,
  requested_by_name TEXT,
  status            VARCHAR(50)  NOT NULL DEFAULT 'pending',
  approved_by       TEXT,
  approved_at       TEXT,
  -- confirmation / check-in fields (from migration 011)
  confirmed_at      TIMESTAMP WITH TIME ZONE,
  confirmed_by      UUID,
  confirmation_note TEXT,
  created_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_room_bookings_room_name   ON public.room_bookings(room_name);
CREATE INDEX IF NOT EXISTS idx_room_bookings_booking_date ON public.room_bookings(booking_date);
CREATE INDEX IF NOT EXISTS idx_room_bookings_status       ON public.room_bookings(status);
CREATE INDEX IF NOT EXISTS idx_room_bookings_requested_by ON public.room_bookings(requested_by);
CREATE INDEX IF NOT EXISTS idx_room_bookings_confirmed_at ON public.room_bookings(confirmed_at DESC);

-- =============================================================================
-- SECTION 10: PHASE 2 — CHECK-IN MANAGEMENT TABLES
-- (from src/lib/database/phase2-migration.sql + route.ts)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 10.1  check_in_history  (audit trail for room check-ins)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.check_in_history (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id           VARCHAR      NOT NULL,
  room_id              VARCHAR      NOT NULL,
  room_name            VARCHAR      NOT NULL,
  checked_in_by        VARCHAR      NOT NULL,
  checked_in_by_name   VARCHAR      NOT NULL,
  check_in_time        VARCHAR      NOT NULL,
  check_in_date        VARCHAR      NOT NULL,
  check_out_time       VARCHAR,
  check_out_date       VARCHAR,
  status               VARCHAR      NOT NULL DEFAULT 'checked-in'
                         CHECK (status IN ('checked-in', 'checked-out', 'cancelled')),
  notes                TEXT,
  created_at           TIMESTAMP    NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_check_in_history_booking_id     ON public.check_in_history(booking_id);
CREATE INDEX IF NOT EXISTS idx_check_in_history_room_id        ON public.check_in_history(room_id);
CREATE INDEX IF NOT EXISTS idx_check_in_history_checked_in_by  ON public.check_in_history(checked_in_by);
CREATE INDEX IF NOT EXISTS idx_check_in_history_check_in_date  ON public.check_in_history(check_in_date);

-- ---------------------------------------------------------------------------
-- 10.2  admin_audit_logs  (room-booking admin actions — distinct from audit_logs)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id          UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  VARCHAR   NOT NULL,
  action      VARCHAR   NOT NULL,
  admin_id    VARCHAR   NOT NULL,
  admin_name  VARCHAR   NOT NULL,
  reason      TEXT,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_booking_id ON public.admin_audit_logs(booking_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_admin_id   ON public.admin_audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action     ON public.admin_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON public.admin_audit_logs(created_at);

-- ---------------------------------------------------------------------------
-- 10.3  attendee_check_ins
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.attendee_check_ins (
  id             UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id     VARCHAR   NOT NULL,
  attendee_id    VARCHAR   NOT NULL,
  attendee_name  VARCHAR   NOT NULL,
  check_in_date  VARCHAR   NOT NULL,
  check_in_time  VARCHAR   NOT NULL,
  check_out_date VARCHAR,
  check_out_time VARCHAR,
  notes          TEXT,
  created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(booking_id, attendee_id, check_in_date)
);

CREATE INDEX IF NOT EXISTS idx_attendee_check_ins_booking_id    ON public.attendee_check_ins(booking_id);
CREATE INDEX IF NOT EXISTS idx_attendee_check_ins_attendee_id   ON public.attendee_check_ins(attendee_id);
CREATE INDEX IF NOT EXISTS idx_attendee_check_ins_check_in_date ON public.attendee_check_ins(check_in_date);

-- ---------------------------------------------------------------------------
-- 10.4  attendee_check_in_logs  (immutable event log)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.attendee_check_in_logs (
  id             UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id     VARCHAR   NOT NULL,
  attendee_id    VARCHAR   NOT NULL,
  attendee_name  VARCHAR   NOT NULL,
  check_in_date  VARCHAR   NOT NULL,
  check_in_time  VARCHAR   NOT NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attendee_check_in_logs_booking_id ON public.attendee_check_in_logs(booking_id);
CREATE INDEX IF NOT EXISTS idx_attendee_check_in_logs_created_at ON public.attendee_check_in_logs(created_at);

-- =============================================================================
-- SECTION 11: PHASE 2 — REPORTING VIEWS (optional, safe to re-run)
-- =============================================================================

CREATE OR REPLACE VIEW public.today_check_ins AS
SELECT
  c.booking_id,
  c.room_name,
  c.checked_in_by_name,
  c.check_in_time,
  c.check_out_time,
  c.status,
  COUNT(DISTINCT a.id) AS attendee_count
FROM public.check_in_history c
LEFT JOIN public.attendee_check_ins a
  ON c.booking_id = a.booking_id AND a.check_in_date = c.check_in_date
WHERE c.check_in_date = CURRENT_DATE::TEXT
GROUP BY c.id, c.booking_id, c.room_name, c.checked_in_by_name,
         c.check_in_time, c.check_out_time, c.status
ORDER BY c.check_in_time DESC;

CREATE OR REPLACE VIEW public.admin_actions_summary AS
SELECT
  action,
  COUNT(*)               AS action_count,
  COUNT(DISTINCT admin_id) AS unique_admins,
  MAX(created_at)        AS last_action_time
FROM public.admin_audit_logs
GROUP BY action
ORDER BY action_count DESC;

CREATE OR REPLACE VIEW public.attendee_statistics AS
SELECT
  booking_id,
  COUNT(*)                                                   AS total_attendees,
  COUNT(CASE WHEN check_out_time IS NOT NULL THEN 1 END)     AS checked_out_count,
  COUNT(CASE WHEN check_out_time IS NULL     THEN 1 END)     AS still_checked_in_count
FROM public.attendee_check_ins
GROUP BY booking_id;

-- -----------------------------------------------------------------------------
-- password_reset_tokens — backs the forgot/reset-password flow.
-- (App also creates this lazily; declared here so it exists on first boot.)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    TEXT NOT NULL,
  email      TEXT NOT NULL,
  token      TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_email ON public.password_reset_tokens (email);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON public.password_reset_tokens (token);

-- ---------------------------------------------------------------------------
-- user_sessions — tracks active login sessions across devices/browsers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_name VARCHAR(255) DEFAULT 'Unknown Device',
  browser VARCHAR(100),
  os VARCHAR(100),
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  last_activity TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP WITH TIME ZONE,

  CONSTRAINT valid_session CHECK (expires_at > created_at OR expires_at IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON public.user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON public.user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_user_sessions_created_at ON public.user_sessions(created_at DESC);

-- ---------------------------------------------------------------------------
-- user_login_history — audit trail of all login/logout events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_login_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES user_sessions(id) ON DELETE SET NULL,
  ip_address INET,
  browser VARCHAR(100),
  os VARCHAR(100),
  login_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  logout_at TIMESTAMP WITH TIME ZONE,
  success BOOLEAN DEFAULT true,
  failure_reason VARCHAR(255),

  CONSTRAINT valid_logout CHECK (logout_at > login_at OR logout_at IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_login_history_user_id ON public.user_login_history(user_id);
CREATE INDEX IF NOT EXISTS idx_login_history_login_at ON public.user_login_history(login_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_history_session_id ON public.user_login_history(session_id);

-- =============================================================================
-- Helper Function: Auto-update updated_at timestamp on row modification
-- =============================================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- MIGRATION 029: Ticket Attachments Table (prerequisite for migration 048)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.ticket_attachments (
  id TEXT PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100),
  size_bytes INTEGER,
  content BYTEA NOT NULL,
  uploaded_by TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_attachments_ticket_id ON public.ticket_attachments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_attachments_uploaded_by ON public.ticket_attachments(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_ticket_attachments_created_at ON public.ticket_attachments(created_at);

-- =============================================================================
-- MIGRATION 046: Ticket Comments Table
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.ticket_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  user_name VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE,
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket_id
  ON public.ticket_comments(ticket_id);

CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket_created
  ON public.ticket_comments(ticket_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ticket_comments_user_id
  ON public.ticket_comments(user_id);

CREATE INDEX IF NOT EXISTS idx_ticket_comments_created_at
  ON public.ticket_comments(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ticket_comments_not_deleted
  ON public.ticket_comments(ticket_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ticket_comments_internal
  ON public.ticket_comments(is_internal) WHERE is_internal = true;

-- =============================================================================
-- MIGRATION 047: Ticket Comment Mentions Table
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.ticket_comment_mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID NOT NULL REFERENCES ticket_comments(id) ON DELETE CASCADE,
  mentioned_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(comment_id, mentioned_user_id)
);

CREATE INDEX IF NOT EXISTS idx_ticket_comment_mentions_mentioned_user
  ON public.ticket_comment_mentions(mentioned_user_id);

CREATE INDEX IF NOT EXISTS idx_ticket_comment_mentions_comment
  ON public.ticket_comment_mentions(comment_id);

CREATE INDEX IF NOT EXISTS idx_ticket_comment_mentions_unread
  ON public.ticket_comment_mentions(mentioned_user_id, read_at) WHERE read_at IS NULL;

-- =============================================================================
-- MIGRATION 048: Enhance Ticket Attachments with Metadata
-- =============================================================================
ALTER TABLE IF EXISTS public.ticket_attachments
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS is_internal BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS file_type VARCHAR(50),
ADD COLUMN IF NOT EXISTS download_count INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_ticket_attachments_created_at_desc
  ON public.ticket_attachments(ticket_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ticket_attachments_internal
  ON public.ticket_attachments(is_internal) WHERE is_internal = true;

-- =============================================================================
-- MIGRATION 049: Ticket Watchers Table
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.ticket_watchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  watch_type VARCHAR(50) DEFAULT 'all',
  muted BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(ticket_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_ticket_watchers_ticket_id
  ON public.ticket_watchers(ticket_id);

CREATE INDEX IF NOT EXISTS idx_ticket_watchers_user_id
  ON public.ticket_watchers(user_id);

CREATE INDEX IF NOT EXISTS idx_ticket_watchers_unmuted
  ON public.ticket_watchers(ticket_id) WHERE NOT muted;

-- =============================================================================
-- MIGRATION 050: Ticket Audit Events Table
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.ticket_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_name VARCHAR(255),
  old_value JSONB,
  new_value JSONB,
  related_entity_id UUID,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_audit_events_ticket_id
  ON public.ticket_audit_events(ticket_id);

CREATE INDEX IF NOT EXISTS idx_ticket_audit_events_ticket_created
  ON public.ticket_audit_events(ticket_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ticket_audit_events_event_type
  ON public.ticket_audit_events(event_type);

CREATE INDEX IF NOT EXISTS idx_ticket_audit_events_actor_id
  ON public.ticket_audit_events(actor_id);

CREATE INDEX IF NOT EXISTS idx_ticket_audit_events_created_at
  ON public.ticket_audit_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ticket_audit_events_related_entity
  ON public.ticket_audit_events(related_entity_id) WHERE related_entity_id IS NOT NULL;

-- =============================================================================
-- END OF SCHEMA
-- =============================================================================
