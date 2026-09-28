-- =============================================================================
-- reconcile.sql — idempotent schema reconciliation, runs on EVERY app boot.
-- =============================================================================

-- Đảm bảo PostgreSQL session và database mặc định dùng timezone Việt Nam
SET timezone = 'Asia/Ho_Chi_Minh';
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET timezone = ''Asia/Ho_Chi_Minh''', current_database());
END $$;
-- Muc dich: dua DB dang ton tai (volume cu tren server) "duoi kip" code, ma
-- KHONG can chay migration tay. File nay chay moi lan container app khoi dong
-- (xem scripts/migrate.mjs + Dockerfile CMD).
--
-- QUY TAC BAT BUOC: moi statement phai IDEMPOTENT (chay 1 hay 100 lan deu an
-- toan). Chi dung:
--   - ALTER TABLE ... ADD COLUMN IF NOT EXISTS
--   - CREATE TABLE IF NOT EXISTS
--   - CREATE INDEX IF NOT EXISTS
-- KHONG dung CREATE POLICY (khong co IF NOT EXISTS -> fail lan 2) hay auth.uid()
-- (ham cua Supabase, khong ton tai tren Postgres thuan).
--
-- Khi them thay doi schema sau nay: viet idempotent va bo vao day.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- audit_logs: bu du cac cot ma MOI writer trong code can.
--   admin_id      -> auditService + companies/departments/subDepartments/
--                    positions/jobTitles + assets routes
--   "userId"/"performedBy" -> usersService.addAuditLog / getAuditLogs
--   target_user_id -> writer cu (de tuong thich)
-- DB tao tu schema cu thieu nhung cot nay -> INSERT bao loi "column does not
-- exist". Bu lai o day, nullable/default rong nen khong pha du lieu cu.
-- -----------------------------------------------------------------------------
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS admin_id       TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS target_user_id TEXT,
  ADD COLUMN IF NOT EXISTS "userId"       TEXT,
  ADD COLUMN IF NOT EXISTS "performedBy"  TEXT;

-- Create indexes, safely handling columns that might not exist yet.
DO $$
BEGIN
  IF to_regclass('public.audit_logs') IS NOT NULL THEN
    BEGIN
      CREATE INDEX IF NOT EXISTS idx_audit_logs_admin_id ON public.audit_logs(admin_id);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    BEGIN
      CREATE INDEX IF NOT EXISTS idx_audit_logs_target_user_id ON public.audit_logs(target_user_id);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    BEGIN
      CREATE INDEX IF NOT EXISTS idx_audit_logs_userid ON public.audit_logs("userId");
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- org_tags + org_tag_assignments (Tags To Chuc — Phase 1).
-- De fresh deploy / DB server chua chay migration 024-025 van co bang nay.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.org_tags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  color       VARCHAR(7) DEFAULT '#6366f1',
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_tags_name   ON public.org_tags(name);
CREATE INDEX IF NOT EXISTS idx_org_tags_active ON public.org_tags(is_active);

-- -----------------------------------------------------------------------------
-- Dam bao moi bang CHA duoc FK tham chieu deu co PRIMARY KEY tren cot "id".
-- Mot so DB server cu duoc tao tu schema thieu PK -> CREATE ... REFERENCES bao
-- "no unique constraint matching given keys for referenced table <X>".
-- Idempotent: chi them PK khi bang ton tai, co cot "id", va chua co PK/UNIQUE
-- nao phu dung cot "id". Bang chua ton tai (fresh DB) se duoc bo qua roi tao
-- sau voi PK san trong reconcile/migration.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  t        TEXT;
  att      SMALLINT;
  n_null   BIGINT;
  n_dup    BIGINT;
  parents TEXT[] := ARRAY[
    'companies', 'departments', 'sub_departments', 'org_tags',
    'tickets', 'ticket_categories', 'ticket_request_types', 'job_titles',
    'tasks', 'task_subtasks', 'task_comments',
    'projects', 'milestones', 'users', 'user_sessions'
  ];
BEGIN
  FOREACH t IN ARRAY parents LOOP
    -- 1) Bang chua ton tai (fresh DB) -> bo qua, se tao sau voi PK san.
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;

    -- 2) Bang khong co cot "id" -> bo qua.
    SELECT attnum INTO att
    FROM pg_attribute
    WHERE attrelid = ('public.' || t)::regclass AND attname = 'id' AND attnum > 0;
    IF att IS NULL THEN
      CONTINUE;
    END IF;

    -- 3) Da co PK/UNIQUE tren dung cot "id" -> khong can lam gi.
    IF EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = ('public.' || t)::regclass
        AND contype IN ('p', 'u')
        AND conkey = ARRAY[att]
    ) THEN
      CONTINUE;
    END IF;

    -- 4) KIEM TRA AN TOAN truoc khi them PK: id khong duoc NULL hay trung.
    --    Neu ban -> KHONG them PK (tranh lam migrate fail va sap app),
    --    chi canh bao de IT don du lieu roi deploy lai.
    EXECUTE format('SELECT count(*) FILTER (WHERE id IS NULL) FROM public.%I', t) INTO n_null;
    EXECUTE format('SELECT count(*) - count(DISTINCT id) FROM public.%I', t) INTO n_dup;

    IF n_null > 0 OR n_dup > 0 THEN
      RAISE WARNING '[reconcile] BO QUA PK cho %: id co % NULL, % trung. Can don du lieu thu cong.', t, n_null, n_dup;
      CONTINUE;
    END IF;

    -- 5) Du lieu sach -> them PK. Bọc exception de bat ky su co nao cung
    --    khong lam abort transaction chinh (app van boot duoc).
    BEGIN
      EXECUTE format('ALTER TABLE public.%I ADD PRIMARY KEY (id)', t);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[reconcile] Khong the them PK cho %: %', t, SQLERRM;
    END;
  END LOOP;
END $$;

-- =============================================================================
-- ENSURE PRIMARY KEY cho departments, sub_departments TRUOC CREATE TABLE org_tag_assignments.
-- (org_tag_assignments co FK tro toi 2 bang nay, nen phai co PK truoc.)
-- =============================================================================
DO $$
BEGIN
  IF to_regclass('public.departments') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.departments'::regclass AND contype = 'p'
    ) THEN
      BEGIN
        ALTER TABLE public.departments ADD PRIMARY KEY (id);
        RAISE NOTICE '[reconcile] Added PRIMARY KEY to departments.id';
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '[reconcile] Khong the them PK cho departments: %', SQLERRM;
      END;
    END IF;
  END IF;

  IF to_regclass('public.sub_departments') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.sub_departments'::regclass AND contype = 'p'
    ) THEN
      BEGIN
        ALTER TABLE public.sub_departments ADD PRIMARY KEY (id);
        RAISE NOTICE '[reconcile] Added PRIMARY KEY to sub_departments.id';
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '[reconcile] Khong the them PK cho sub_departments: %', SQLERRM;
      END;
    END IF;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.org_tag_assignments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tag_id            UUID NOT NULL REFERENCES public.org_tags(id)        ON DELETE CASCADE,
  company_id        UUID          REFERENCES public.companies(id)       ON DELETE CASCADE,
  department_id     UUID          REFERENCES public.departments(id)     ON DELETE CASCADE,
  sub_department_id UUID          REFERENCES public.sub_departments(id) ON DELETE CASCADE,
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT org_tag_assignments_one_target CHECK (
    (CASE WHEN company_id        IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN department_id     IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN sub_department_id IS NOT NULL THEN 1 ELSE 0 END) = 1
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_org_tag_company
  ON public.org_tag_assignments(tag_id, company_id) WHERE company_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_org_tag_department
  ON public.org_tag_assignments(tag_id, department_id) WHERE department_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_org_tag_sub_department
  ON public.org_tag_assignments(tag_id, sub_department_id) WHERE sub_department_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_org_tag_assignments_company        ON public.org_tag_assignments(company_id);
CREATE INDEX IF NOT EXISTS idx_org_tag_assignments_department     ON public.org_tag_assignments(department_id);
CREATE INDEX IF NOT EXISTS idx_org_tag_assignments_sub_department ON public.org_tag_assignments(sub_department_id);

-- -----------------------------------------------------------------------------
-- users.department_id (TEXT, luu UUID dang chuoi giong company_id/sub_department_id).
-- Truoc day user chi gan company_id + sub_department_id; thieu cap phong ban
-- giua. Can de loc nhan su theo don vi (Tags To Chuc) khi giao ticket.
-- Backfill: doi chieu users.department (ten) + company_id sang departments.id.
-- -----------------------------------------------------------------------------
-- Cot department_id tren DB dang chay la UUID (giong company_id/sub_department_id),
-- du 01-schema.sql goc khai bao TEXT. Them dang UUID cho khop DB hien tai;
-- IF NOT EXISTS nen bo qua neu da co. So sanh backfill ep ve text de an toan
-- voi ca hai kieu (uuid hoac text).
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS department_id UUID;

-- Create indexes, safely handling columns that might not exist yet.
DO $$
BEGIN
  IF to_regclass('public.users') IS NOT NULL THEN
    BEGIN
      CREATE INDEX IF NOT EXISTS idx_users_department_id ON public.users(department_id);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
END $$;

-- Cot `department` (TEXT) tren DB thuc te luu UUID cua phong ban dang chuoi,
-- khong phai ten. Backfill chinh: copy thang khi department la 1 departments.id.
UPDATE public.users u
SET department_id = d.id
FROM public.departments d
WHERE u.department = d.id::text
  AND u.department_id IS NULL;

-- Du phong: vai dong cu luu department la TEN -> doi chieu name + company_id.
UPDATE public.users u
SET department_id = d.id
FROM public.departments d
WHERE u.company_id::text = d.company_id::text
  AND u.department = d.name
  AND u.department_id IS NULL;

-- -----------------------------------------------------------------------------
-- tickets: don vi xu ly (Tags To Chuc) duoc chon khi tao ticket.
--   assigned_unit_tag_id -> id cua org_tag (don vi chuyen trach)
--   assigned_unit_name   -> ten tag, luu de hien thi nhanh khong can join
-- -----------------------------------------------------------------------------
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS assigned_unit_tag_id TEXT,
  ADD COLUMN IF NOT EXISTS assigned_unit_name   TEXT;

-- Create indexes, safely handling columns that might not exist yet.
DO $$
BEGIN
  IF to_regclass('public.tickets') IS NOT NULL THEN
    BEGIN
      CREATE INDEX IF NOT EXISTS idx_tickets_assigned_unit_tag_id ON public.tickets(assigned_unit_tag_id);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- Tickets ERP: khung truong data-driven (khong asset-centric).
--   request_type   -> incident | service_request | change | question
--   category_id    -> ticket_categories.id (phan cap, driver truong dong & don vi)
--   category_name  -> luu de hien thi nhanh
--   custom_fields  -> JSONB { key: value } render theo schema cua danh muc
--   requester_*    -> nguoi YEU CAU (co the khac created_by khi tao ho/on-behalf)
--   attachments    -> JSONB [] metadata file (noi dung luu o ticket_attachments)
-- -----------------------------------------------------------------------------
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS request_type         TEXT,
  ADD COLUMN IF NOT EXISTS category_id          TEXT,
  ADD COLUMN IF NOT EXISTS category_name        TEXT,
  ADD COLUMN IF NOT EXISTS custom_fields        JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS requester_id         TEXT,
  ADD COLUMN IF NOT EXISTS requester_name       TEXT,
  ADD COLUMN IF NOT EXISTS requester_department TEXT,
  ADD COLUMN IF NOT EXISTS requester_position   TEXT,
  ADD COLUMN IF NOT EXISTS attachments          JSONB DEFAULT '[]'::jsonb;

-- Create indexes, safely handling columns that might not exist yet.
DO $$
BEGIN
  IF to_regclass('public.tickets') IS NOT NULL THEN
    BEGIN
      CREATE INDEX IF NOT EXISTS idx_tickets_request_type ON public.tickets(request_type);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    BEGIN
      CREATE INDEX IF NOT EXISTS idx_tickets_category_id ON public.tickets(category_id);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- ticket_categories: taxonomy phan cap cho MOI loai tac vu (huong ERP).
--   parent_id            -> danh muc cha (NULL = goc)
--   request_type         -> rang buoc loai yeu cau mac dinh (tuy chon)
--   default_unit_tag_id  -> org_tag don vi xu ly mac dinh (Phase 2 auto-route)
--   custom_fields        -> schema JSONB: [{key,label,type,required,options?,placeholder?}]
--                           type: text | textarea | number | date | select
--   sort_order           -> thu tu hien thi
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ticket_categories (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id           UUID REFERENCES public.ticket_categories(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  request_type        TEXT,
  default_unit_tag_id TEXT,
  custom_fields       JSONB NOT NULL DEFAULT '[]'::jsonb,
  sort_order          INT  NOT NULL DEFAULT 0,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_categories_parent ON public.ticket_categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_ticket_categories_active ON public.ticket_categories(is_active);

-- Ensure PK cho ticket_categories truoc INSERT ON CONFLICT.
DO $$
BEGIN
  IF to_regclass('public.ticket_categories') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.ticket_categories'::regclass AND contype = 'p'
    ) THEN
      BEGIN
        ALTER TABLE public.ticket_categories ADD PRIMARY KEY (id);
        RAISE NOTICE '[reconcile] Added PRIMARY KEY to ticket_categories.id';
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '[reconcile] Khong the them PK cho ticket_categories: %', SQLERRM;
      END;
    END IF;
  END IF;
END $$;

-- Seed danh muc mac dinh (id co dinh -> idempotent qua ON CONFLICT DO NOTHING).
-- Cha truoc, con sau. Asset chi la custom_fields cua danh muc thiet bi.
INSERT INTO public.ticket_categories (id, parent_id, name, request_type, custom_fields, sort_order) VALUES
  ('11111111-0000-0000-0000-000000000001', NULL, 'Thiết bị & Tài sản', NULL, '[]'::jsonb, 10),
  ('11111111-0000-0000-0000-000000000002', NULL, 'Phần mềm & Tài khoản', NULL, '[]'::jsonb, 20),
  ('11111111-0000-0000-0000-000000000003', NULL, 'Hành chính & Pháp lý', NULL, '[]'::jsonb, 30),
  ('11111111-0000-0000-0000-000000000004', NULL, 'Nhân sự', NULL, '[]'::jsonb, 40)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.ticket_categories (id, parent_id, name, request_type, custom_fields, sort_order) VALUES
  ('22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'Sự cố thiết bị', 'incident',
    '[{"key":"asset_code","label":"Mã Tài Sản","type":"text","required":false,"placeholder":"AF-IT-2026-001"},{"key":"asset_name","label":"Tên Tài Sản","type":"text","required":false,"placeholder":"Dell Latitude"},{"key":"symptom","label":"Hiện tượng lỗi","type":"textarea","required":true}]'::jsonb, 10),
  ('22222222-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', 'Yêu cầu cấp thiết bị', 'service_request',
    '[{"key":"device_type","label":"Loại thiết bị","type":"select","required":true,"options":["Laptop","Màn hình","Điện thoại","Phụ kiện","Khác"]},{"key":"quantity","label":"Số lượng","type":"number","required":true},{"key":"reason","label":"Lý do","type":"textarea","required":false}]'::jsonb, 20),
  ('22222222-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000002', 'Cấp tài khoản / Email', 'service_request',
    '[{"key":"account_type","label":"Loại tài khoản","type":"select","required":true,"options":["Email","Phần mềm nội bộ","VPN","Khác"]},{"key":"note","label":"Ghi chú","type":"textarea","required":false}]'::jsonb, 10),
  ('22222222-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000002', 'Lỗi phần mềm', 'incident',
    '[{"key":"software","label":"Phần mềm","type":"text","required":true},{"key":"symptom","label":"Hiện tượng lỗi","type":"textarea","required":true}]'::jsonb, 20),
  ('22222222-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000003', 'Hỗ trợ pháp lý', 'question',
    '[{"key":"contract_no","label":"Số hợp đồng / hồ sơ","type":"text","required":false},{"key":"detail","label":"Nội dung cần hỗ trợ","type":"textarea","required":true}]'::jsonb, 10),
  ('22222222-0000-0000-0000-000000000006', '11111111-0000-0000-0000-000000000004', 'Tuyển dụng', 'service_request',
    '[{"key":"position","label":"Vị trí cần tuyển","type":"text","required":true},{"key":"quantity","label":"Số lượng","type":"number","required":true}]'::jsonb, 10)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- ticket_attachments: noi dung file luu thang trong DB (BYTEA) -> theo db-data
-- volume, khong can them volume/S3. Metadata cung luu o tickets.attachments.
-- ENSURE PK cho tickets truoc CREATE TABLE (ticket_attachments co FK tro toi).
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.tickets') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.tickets'::regclass AND contype = 'p'
    ) THEN
      BEGIN
        ALTER TABLE public.tickets ADD PRIMARY KEY (id);
        RAISE NOTICE '[reconcile] Added PRIMARY KEY to tickets.id';
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '[reconcile] Khong the them PK cho tickets: %', SQLERRM;
      END;
    END IF;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.ticket_attachments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id    UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  file_name    TEXT NOT NULL,
  mime_type    TEXT,
  size_bytes   BIGINT,
  content      BYTEA NOT NULL,
  uploaded_by  TEXT,
  created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_attachments_ticket ON public.ticket_attachments(ticket_id);

-- -----------------------------------------------------------------------------
-- ticket_request_types: loai yeu cau (incident/service_request/...) quan ly DB.
--   code        -> ma dinh danh on dinh, dung lam value khi tao ticket
--   name        -> nhan hien thi tieng Viet
--   sort_order  -> thu tu hien thi
-- Chuyen tu hardcode sang DB de admin tu them/sua loai yeu cau.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ticket_request_types (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  sort_order  INT  NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_request_types_active ON public.ticket_request_types(is_active);

-- Ensure PK cho ticket_request_types truoc INSERT ON CONFLICT.
DO $$
BEGIN
  IF to_regclass('public.ticket_request_types') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.ticket_request_types'::regclass AND contype = 'p'
    ) THEN
      BEGIN
        ALTER TABLE public.ticket_request_types ADD PRIMARY KEY (id);
        RAISE NOTICE '[reconcile] Added PRIMARY KEY to ticket_request_types.id';
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '[reconcile] Khong the them PK cho ticket_request_types: %', SQLERRM;
      END;
    END IF;
  END IF;
END $$;

INSERT INTO public.ticket_request_types (id, code, name, sort_order) VALUES
  ('33333333-0000-0000-0000-000000000001', 'incident',        'Sự cố',          10),
  ('33333333-0000-0000-0000-000000000002', 'service_request', 'Yêu cầu dịch vụ', 20),
  ('33333333-0000-0000-0000-000000000003', 'change',          'Thay đổi',        30),
  ('33333333-0000-0000-0000-000000000004', 'question',        'Câu hỏi',         40)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- job_titles: Chức danh công việc (dùng để display trong Assignee dropdown)
-- Idempotent: INSERT ON CONFLICT DO NOTHING, UPDATE khi job_title_id IS NULL
-- Note: Tạo default company nếu chưa có để tránh NULL constraint error.
-- =============================================================================

-- Ensure PK cho companies truoc INSERT ON CONFLICT.
DO $$
BEGIN
  IF to_regclass('public.companies') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.companies'::regclass AND contype = 'p'
    ) THEN
      BEGIN
        ALTER TABLE public.companies ADD PRIMARY KEY (id);
        RAISE NOTICE '[reconcile] Added PRIMARY KEY to companies.id';
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '[reconcile] Khong the them PK cho companies: %', SQLERRM;
      END;
    END IF;
  END IF;
END $$;

-- Đảm bảo các cột cần thiết tồn tại trước khi INSERT
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS code        VARCHAR(50);
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS slug        VARCHAR(255);
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS address     TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS invoice_address TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS phone       VARCHAR(20);
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS email       VARCHAR(255);
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS website     VARCHAR(255);
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS tax_code    VARCHAR(50);
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS business_name        TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS legal_representative TEXT;
CREATE INDEX IF NOT EXISTS idx_companies_code ON public.companies(code);
CREATE INDEX IF NOT EXISTS idx_companies_slug ON public.companies(slug);

INSERT INTO public.companies (id, name, code, slug, is_active)
VALUES ('99999999-0000-0000-0000-000000000001', 'Default Company', 'DEFAULT', 'default-company', true)
ON CONFLICT (id) DO NOTHING;

-- Ensure PK cho job_titles truoc INSERT ON CONFLICT.
DO $$
BEGIN
  IF to_regclass('public.job_titles') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.job_titles'::regclass AND contype = 'p'
    ) THEN
      BEGIN
        ALTER TABLE public.job_titles ADD PRIMARY KEY (id);
        RAISE NOTICE '[reconcile] Added PRIMARY KEY to job_titles.id';
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '[reconcile] Khong the them PK cho job_titles: %', SQLERRM;
      END;
    END IF;
  END IF;
END $$;

INSERT INTO public.job_titles (id, company_id, title, description, is_active) VALUES
  ('44444444-0000-0000-0000-000000000001',
   '99999999-0000-0000-0000-000000000001',
   'Kỹ Sư Hệ Thống', 'Quản lý hạ tầng IT và hệ thống', true),
  ('44444444-0000-0000-0000-000000000002',
   '99999999-0000-0000-0000-000000000001',
   'Nhân Viên Hỗ Trợ', 'Hỗ trợ kỹ thuật cho người dùng', true),
  ('44444444-0000-0000-0000-000000000003',
   '99999999-0000-0000-0000-000000000001',
   'Trưởng Phòng', 'Quản lý phòng ban', true),
  ('44444444-0000-0000-0000-000000000004',
   '99999999-0000-0000-0000-000000000001',
   'Quản Lý Dự Án', 'Quản lý và điều phối dự án', true),
  ('44444444-0000-0000-0000-000000000005',
   '99999999-0000-0000-0000-000000000001',
   'Nhân Viên Kỹ Thuật', 'Thực hiện công việc kỹ thuật', true)
ON CONFLICT (id) DO NOTHING;

-- DB cu co the thieu cot job_title_id tren users -> bu truoc khi UPDATE.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS job_title_id UUID;

-- Assign job titles to test users (idempotent - only if job_title_id IS NULL)
UPDATE public.users
SET job_title_id = '44444444-0000-0000-0000-000000000001'
WHERE name = 'Trần Minh Trí' AND job_title_id IS NULL;

UPDATE public.users
SET job_title_id = '44444444-0000-0000-0000-000000000004'
WHERE name = 'Trà Phương Nam' AND job_title_id IS NULL;

UPDATE public.users
SET job_title_id = '44444444-0000-0000-0000-000000000003'
WHERE name = 'Hồ Mai Thy' AND job_title_id IS NULL;

-- ===========================================================================
-- TASKS MODULE — PHASE 1 (Subtasks, Time Tracking, Followers, Comments)
-- Gop tu migrations 035, 038-042 vao co che migrate-on-boot idempotent.
-- Bang `tasks` goc da co o init/01-schema.sql; phan duoi chi THEM cot/bang/index.
-- (init chi chay khi DB trong, nen phai tai tao o day cho server dang chay.)
-- ===========================================================================

-- --- Bao dam cot `tasks` co ban (DB cu co the thieu so voi init schema) ---
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP;

-- --- 035: rank cho job_titles + department_id cho users -------------------
ALTER TABLE public.job_titles ADD COLUMN IF NOT EXISTS rank INT DEFAULT 4;
CREATE INDEX IF NOT EXISTS idx_job_titles_rank ON public.job_titles(rank);

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL;

-- --- 035: ngu canh to chuc cho tasks --------------------------------------
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sub_department_id UUID REFERENCES public.sub_departments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_company_id
  ON public.tasks(company_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_department_id
  ON public.tasks(department_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_sub_department_id
  ON public.tasks(sub_department_id) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_org_context
  ON public.tasks(company_id, department_id, sub_department_id, status)
  WHERE archived_at IS NULL;

-- --- 038: subtasks + cot gio cho tasks ------------------------------------
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS estimated_hours DECIMAL(10,2) NULL;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS actual_hours DECIMAL(10,2) DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_tasks_actual_hours
  ON public.tasks(actual_hours DESC) WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS public.task_subtasks (
  id                    TEXT PRIMARY KEY,
  task_id               UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  title                 VARCHAR(255) NOT NULL,
  description           TEXT,
  status                VARCHAR(20) DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done', 'cancelled')),
  assigned_to           UUID REFERENCES public.users(id) ON DELETE SET NULL,
  assigned_to_name      VARCHAR(255),
  due_date              DATE,
  completion_percentage SMALLINT DEFAULT 0 CHECK (completion_percentage >= 0 AND completion_percentage <= 100),
  "order_index"         SMALLINT DEFAULT 0,
  created_by            VARCHAR(255),
  created_at            TIMESTAMP DEFAULT NOW(),
  updated_at            TIMESTAMP DEFAULT NOW(),
  archived_at           TIMESTAMP NULL,
  CONSTRAINT task_subtasks_order_unique UNIQUE (task_id, "order_index")
);
CREATE INDEX IF NOT EXISTS idx_subtasks_task_id ON public.task_subtasks(task_id);
CREATE INDEX IF NOT EXISTS idx_subtasks_task_id_status ON public.task_subtasks(task_id, status);
CREATE INDEX IF NOT EXISTS idx_subtasks_assigned_to ON public.task_subtasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_subtasks_status ON public.task_subtasks(status);
CREATE INDEX IF NOT EXISTS idx_subtasks_created_at ON public.task_subtasks(created_at DESC);

-- --- 039: time tracking + follower_count cho tasks ------------------------
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS follower_count INTEGER DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_tasks_follower_count
  ON public.tasks(follower_count DESC) WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS public.task_time_entries (
  id               TEXT PRIMARY KEY,
  task_id          UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  subtask_id       TEXT REFERENCES public.task_subtasks(id) ON DELETE SET NULL,
  user_id          UUID REFERENCES public.users(id) ON DELETE SET NULL,
  user_name        VARCHAR(255),
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  date_worked      DATE NOT NULL,
  description      VARCHAR(255),
  is_billable      BOOLEAN DEFAULT true,
  created_at       TIMESTAMP DEFAULT NOW(),
  updated_at       TIMESTAMP DEFAULT NOW(),
  deleted_at       TIMESTAMP NULL
);
CREATE INDEX IF NOT EXISTS idx_time_entries_task_id ON public.task_time_entries(task_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_task_subtask ON public.task_time_entries(task_id, subtask_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_user_id ON public.task_time_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_user_date ON public.task_time_entries(user_id, date_worked DESC);
CREATE INDEX IF NOT EXISTS idx_time_entries_billable ON public.task_time_entries(is_billable) WHERE is_billable = true;
CREATE INDEX IF NOT EXISTS idx_time_entries_created_at ON public.task_time_entries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_time_entries_not_deleted ON public.task_time_entries(task_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_task_time_entries_date_worked ON public.task_time_entries(date_worked);
CREATE INDEX IF NOT EXISTS idx_task_time_entries_task_date ON public.task_time_entries(task_id, date_worked DESC);

-- --- 040: followers -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.task_followers (
  task_id    UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (task_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_task_followers_user_id ON public.task_followers(user_id);
CREATE INDEX IF NOT EXISTS idx_task_followers_task_id ON public.task_followers(task_id);
CREATE INDEX IF NOT EXISTS idx_task_followers_created_at ON public.task_followers(created_at DESC);

-- --- 041: comments + mentions (sua loi cu phap COMMENT cua MySQL) ----------
CREATE TABLE IF NOT EXISTS public.task_comments (
  id          TEXT PRIMARY KEY,
  task_id     UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  user_name   VARCHAR(255),
  user_avatar TEXT,
  content     TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT false,
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP,
  deleted_at  TIMESTAMP NULL
);
COMMENT ON COLUMN public.task_comments.is_internal IS 'Only visible to assignee, creator, and managers';
COMMENT ON COLUMN public.task_comments.deleted_at IS 'Soft delete for audit trail';
CREATE INDEX IF NOT EXISTS idx_comments_task_id ON public.task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_comments_task_created ON public.task_comments(task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON public.task_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_created_at ON public.task_comments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_not_deleted ON public.task_comments(task_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_comments_internal ON public.task_comments(is_internal) WHERE is_internal = true;
CREATE INDEX IF NOT EXISTS idx_task_comments_task_deleted ON public.task_comments(task_id, deleted_at DESC);

CREATE TABLE IF NOT EXISTS public.task_comment_mentions (
  comment_id        TEXT NOT NULL REFERENCES public.task_comments(id) ON DELETE CASCADE,
  mentioned_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  PRIMARY KEY (comment_id, mentioned_user_id)
);
CREATE INDEX IF NOT EXISTS idx_comment_mentions_user ON public.task_comment_mentions(mentioned_user_id);
CREATE INDEX IF NOT EXISTS idx_comment_mentions_comment ON public.task_comment_mentions(comment_id);

-- ===========================================================================
-- TASKS MODULE — PHASE 2.1: Comment Threads / Replies
-- Cho phep tra loi long nhau: parent_id tro toi comment cha (NULL = goc).
-- ===========================================================================
ALTER TABLE public.task_comments
  ADD COLUMN IF NOT EXISTS parent_id TEXT REFERENCES public.task_comments(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON public.task_comments(parent_id);

-- ===========================================================================
-- TASKS MODULE — PHASE 2.2: File Attachments (luu tren dia/volume server)
-- Cot `stored_name` = ten file tren dia; noi dung KHONG luu trong DB.
-- comment_id NULL = dinh kem cap task; co gia tri = dinh kem cap binh luan.
-- ===========================================================================
CREATE TABLE IF NOT EXISTS public.task_attachments (
  id          TEXT PRIMARY KEY,
  task_id     UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  comment_id  TEXT REFERENCES public.task_comments(id) ON DELETE CASCADE,
  file_name   VARCHAR(255) NOT NULL,
  stored_name TEXT NOT NULL,
  mime_type   VARCHAR(100),
  size_bytes  INTEGER,
  uploaded_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  uploaded_by_name VARCHAR(255),
  created_at  TIMESTAMP DEFAULT NOW(),
  deleted_at  TIMESTAMP NULL
);
CREATE INDEX IF NOT EXISTS idx_task_attachments_task_id ON public.task_attachments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_attachments_comment_id ON public.task_attachments(comment_id);
CREATE INDEX IF NOT EXISTS idx_task_attachments_uploaded_by ON public.task_attachments(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_task_attachments_not_deleted ON public.task_attachments(task_id) WHERE deleted_at IS NULL;

-- ===========================================================================
-- TASKS MODULE — PHASE 3: World-Standard Task Form (Projects, Milestones, Dependencies)
-- Them cac bang + cot cho form task nang cao (ERP-style, 25 fields across 3 tabs).
-- NOTE: projects table already exists with UUID id; we add milestone support here.
-- ===========================================================================

-- --- milestones: Cac cot moc trong du an (references existing projects table) ---
CREATE TABLE IF NOT EXISTS public.milestones (
  id TEXT PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  target_date DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_milestones_project_id ON public.milestones(project_id);
CREATE INDEX IF NOT EXISTS idx_milestones_status ON public.milestones(status);

-- --- task_dependencies: Quan he "blocks/blocked_by" giua cac task (UUID ids) ------
CREATE TABLE IF NOT EXISTS public.task_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  depends_on_task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  dependency_type VARCHAR(20) DEFAULT 'blocks',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT ux_task_dependencies UNIQUE (task_id, depends_on_task_id),
  CONSTRAINT check_task_dependencies_not_self CHECK (task_id != depends_on_task_id)
);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_task_id ON public.task_dependencies(task_id);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_depends_on ON public.task_dependencies(depends_on_task_id);

-- --- task_assignees: Them nhieu nguoi phu trach ngoai assigned_to chinh ----
CREATE TABLE IF NOT EXISTS public.task_assignees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role VARCHAR(20) DEFAULT 'assignee',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT ux_task_assignees UNIQUE (task_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_task_assignees_task_id ON public.task_assignees(task_id);
CREATE INDEX IF NOT EXISTS idx_task_assignees_user_id ON public.task_assignees(user_id);

-- --- tasks: Them cot cho form world-standard (task_type, complexity, ...) --
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS task_type VARCHAR(20) DEFAULT 'Task',
  ADD COLUMN IF NOT EXISTS complexity VARCHAR(20) DEFAULT 'Medium',
  ADD COLUMN IF NOT EXISTS parent_task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS milestone_id TEXT REFERENCES public.milestones(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS start_date DATE,
  ADD COLUMN IF NOT EXISTS budget_amount DECIMAL(14,2) DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_tasks_task_type ON public.tasks(task_type);
CREATE INDEX IF NOT EXISTS idx_tasks_complexity ON public.tasks(complexity);
CREATE INDEX IF NOT EXISTS idx_tasks_parent_task_id ON public.tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON public.tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_milestone_id ON public.tasks(milestone_id);
CREATE INDEX IF NOT EXISTS idx_tasks_start_date ON public.tasks(start_date);

-- ===========================================================================
-- USER SESSIONS & LOGIN HISTORY — Session Management & Device Tracking
-- Idempotent: Tracks active login sessions per device (international standards).
-- ===========================================================================

-- --- user_sessions: Track active login sessions across devices/browsers ----
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  device_name VARCHAR(255) DEFAULT 'Unknown Device',
  browser VARCHAR(100),
  os VARCHAR(100),
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  last_activity TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP WITH TIME ZONE
);

-- DB cu co the da co user_sessions phien ban thieu cot -> CREATE IF NOT EXISTS
-- bo qua, khong them cot. Bu day du cot truoc khi tao index tren chung.
-- Dac biet: neu user_id la TEXT (phien ban cu), phai doi thanh UUID.
DO $$
BEGIN
  IF to_regclass('public.user_sessions') IS NOT NULL THEN
    -- Drop FK cu neu co (TYPE: TEXT -> UUID conflict).
    BEGIN
      ALTER TABLE public.user_sessions
      DROP CONSTRAINT IF EXISTS user_sessions_user_id_fkey;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    -- ALTER TYPE neu user_id la TEXT.
    IF (SELECT data_type FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'user_sessions'
        AND column_name = 'user_id') = 'text' THEN
      BEGIN
        ALTER TABLE public.user_sessions ALTER COLUMN user_id TYPE UUID USING user_id::uuid;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '[reconcile] Khong the convert user_sessions.user_id TEXT->UUID: %', SQLERRM;
      END;
    END IF;
  END IF;
END $$;

-- Neu company_id co NOT NULL constraint -> bu NULL de khop schema moi.
DO $$
BEGIN
  IF to_regclass('public.user_sessions') IS NOT NULL THEN
    -- Neu company_id ton tai va NOT NULL -> ALTER DROP NOT NULL.
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'user_sessions'
      AND column_name = 'company_id' AND is_nullable = 'NO'
    ) THEN
      BEGIN
        ALTER TABLE public.user_sessions ALTER COLUMN company_id DROP NOT NULL;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '[reconcile] Khong the DROP NOT NULL company_id: %', SQLERRM;
      END;
    END IF;
  END IF;
END $$;

ALTER TABLE public.user_sessions
  ADD COLUMN IF NOT EXISTS company_id    UUID,
  ADD COLUMN IF NOT EXISTS device_name   VARCHAR(255) DEFAULT 'Unknown Device',
  ADD COLUMN IF NOT EXISTS browser       VARCHAR(100),
  ADD COLUMN IF NOT EXISTS os            VARCHAR(100),
  ADD COLUMN IF NOT EXISTS ip_address    INET,
  ADD COLUMN IF NOT EXISTS user_agent    TEXT,
  ADD COLUMN IF NOT EXISTS created_at    TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS last_activity TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS expires_at    TIMESTAMP WITH TIME ZONE;

-- Create indexes, safely handling columns that might not exist yet.
DO $$
BEGIN
  IF to_regclass('public.user_sessions') IS NOT NULL THEN
    BEGIN
      CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON public.user_sessions(user_id);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    BEGIN
      CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON public.user_sessions(expires_at);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    BEGIN
      CREATE INDEX IF NOT EXISTS idx_user_sessions_created_at ON public.user_sessions(created_at DESC);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
END $$;

COMMENT ON TABLE public.user_sessions IS 'Tracks active login sessions per device/browser. Follows OAuth/OpenID session tracking standards.';

-- --- user_login_history: Audit trail of login/logout events ---------------
CREATE TABLE IF NOT EXISTS public.user_login_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.user_sessions(id) ON DELETE SET NULL,
  ip_address INET,
  browser VARCHAR(100),
  os VARCHAR(100),
  login_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  logout_at TIMESTAMP WITH TIME ZONE,
  success BOOLEAN DEFAULT true,
  failure_reason VARCHAR(255)
);

-- Tuong tu user_sessions: bu cot cho DB cu thieu truoc khi tao index.
-- Dac biet: neu DB cu co user_login_history voi user_id TEXT (phien ban cu),
-- phai doi thanh UUID de khop voi users.id (UUID). DROP FK + ALTER TYPE + ADD FK.
DO $$
BEGIN
  IF to_regclass('public.user_login_history') IS NOT NULL THEN
    -- Drop FK cu neu co (TYPE: TEXT -> UUID conflict).
    BEGIN
      ALTER TABLE public.user_login_history
      DROP CONSTRAINT IF EXISTS user_login_history_user_id_fkey;
    EXCEPTION WHEN OTHERS THEN
      NULL;  -- bo qua neu drop fail
    END;

    -- ALTER TYPE neu user_id la TEXT.
    IF (SELECT data_type FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'user_login_history'
        AND column_name = 'user_id') = 'text' THEN
      BEGIN
        ALTER TABLE public.user_login_history ALTER COLUMN user_id TYPE UUID USING user_id::uuid;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '[reconcile] Khong the convert user_login_history.user_id TEXT->UUID: %', SQLERRM;
      END;
    END IF;
  END IF;
END $$;

ALTER TABLE public.user_login_history
  ADD COLUMN IF NOT EXISTS session_id     UUID,
  ADD COLUMN IF NOT EXISTS ip_address     INET,
  ADD COLUMN IF NOT EXISTS browser        VARCHAR(100),
  ADD COLUMN IF NOT EXISTS os             VARCHAR(100),
  ADD COLUMN IF NOT EXISTS login_at       TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS logout_at      TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS success        BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS failure_reason VARCHAR(255);

-- Create indexes, safely handling columns that might not exist yet.
DO $$
BEGIN
  IF to_regclass('public.user_login_history') IS NOT NULL THEN
    BEGIN
      CREATE INDEX IF NOT EXISTS idx_login_history_user_id ON public.user_login_history(user_id);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    BEGIN
      CREATE INDEX IF NOT EXISTS idx_login_history_login_at ON public.user_login_history(login_at DESC);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    BEGIN
      CREATE INDEX IF NOT EXISTS idx_login_history_session_id ON public.user_login_history(session_id);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
END $$;

-- ENSURE PRIMARY KEY cho users truoc ADD FK (user_login_history tro toi users.id).
DO $$
BEGIN
  IF to_regclass('public.users') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.users'::regclass AND contype = 'p'
    ) THEN
      BEGIN
        ALTER TABLE public.users ADD PRIMARY KEY (id);
        RAISE NOTICE '[reconcile] Added PRIMARY KEY to users.id';
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '[reconcile] Khong the them PK cho users: %', SQLERRM;
      END;
    END IF;
  END IF;
END $$;

-- Them FK user_id -> users.id neu chua co (sau khi ALTER TYPE).
DO $$
BEGIN
  IF to_regclass('public.user_login_history') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE table_schema = 'public' AND table_name = 'user_login_history'
      AND constraint_name = 'user_login_history_user_id_fkey'
    ) THEN
      BEGIN
        ALTER TABLE public.user_login_history
        ADD CONSTRAINT user_login_history_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '[reconcile] Khong the them FK user_login_history.user_id: %', SQLERRM;
      END;
    END IF;
  END IF;
END $$;

-- ENSURE PRIMARY KEY cho users truoc ADD FK (user_sessions tro toi users.id).
DO $$
BEGIN
  IF to_regclass('public.users') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.users'::regclass AND contype = 'p'
    ) THEN
      BEGIN
        ALTER TABLE public.users ADD PRIMARY KEY (id);
        RAISE NOTICE '[reconcile] Added PRIMARY KEY to users.id';
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '[reconcile] Khong the them PK cho users: %', SQLERRM;
      END;
    END IF;
  END IF;
END $$;

-- Them FK user_id -> users.id tren user_sessions neu chua co.
DO $$
BEGIN
  IF to_regclass('public.user_sessions') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE table_schema = 'public' AND table_name = 'user_sessions'
      AND constraint_name = 'user_sessions_user_id_fkey'
    ) THEN
      BEGIN
        ALTER TABLE public.user_sessions
        ADD CONSTRAINT user_sessions_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '[reconcile] Khong the them FK user_sessions.user_id: %', SQLERRM;
      END;
    END IF;
  END IF;
END $$;

-- =============================================================================
-- USERS: Ensure all columns exist that code expects to SELECT.
-- DB cu co the thieu cac cot khi tao tu schema lau -> SELECT * fail.
-- =============================================================================
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS department_id UUID,
  ADD COLUMN IF NOT EXISTS position_id UUID,
  ADD COLUMN IF NOT EXISTS sub_department_id UUID,
  ADD COLUMN IF NOT EXISTS job_title_id UUID,
  ADD COLUMN IF NOT EXISTS manager_id UUID,
  ADD COLUMN IF NOT EXISTS telegram_chat_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS telegram_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS module_permissions JSONB DEFAULT '{}'::jsonb;

-- =============================================================================
-- USER_TAGS: Junction table (users <-> tags many-to-many).
-- Migration 017 tao bang nay, nhung reconcile.sql chua co.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.user_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, tag_id)
);

-- Create indexes, safely handling table/columns that might not exist yet.
DO $$
BEGIN
  IF to_regclass('public.user_tags') IS NOT NULL THEN
    BEGIN
      CREATE INDEX IF NOT EXISTS idx_user_tags_user_id ON public.user_tags(user_id);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    BEGIN
      CREATE INDEX IF NOT EXISTS idx_user_tags_tag_id ON public.user_tags(tag_id);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
END $$;

-- =============================================================================
-- ROOM_BOOKINGS: Ensure all columns exist that code expects to INSERT.
-- migrations 011, 012 them nhieu cot — dam bao tat ca ton tai truoc INSERT
-- =============================================================================
ALTER TABLE public.room_bookings
  ADD COLUMN IF NOT EXISTS status             VARCHAR(50) DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS num_participants   INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS has_online_meeting BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS needs_room_setup   BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS confirmed_at       TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS confirmed_by       UUID,
  ADD COLUMN IF NOT EXISTS confirmation_note  TEXT,
  ADD COLUMN IF NOT EXISTS updated_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_by       UUID,
  ADD COLUMN IF NOT EXISTS cancelled_at       TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS rejection_note     TEXT,
  ADD COLUMN IF NOT EXISTS rejection_reason   TEXT,
  ADD COLUMN IF NOT EXISTS approval_timestamp TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS approval_by_name   TEXT;
CREATE INDEX IF NOT EXISTS idx_room_bookings_status            ON public.room_bookings(status);
CREATE INDEX IF NOT EXISTS idx_room_bookings_confirmed_at      ON public.room_bookings(confirmed_at DESC);
CREATE INDEX IF NOT EXISTS idx_room_bookings_cancelled_by      ON public.room_bookings(cancelled_by);
CREATE INDEX IF NOT EXISTS idx_room_bookings_approval_timestamp ON public.room_bookings(approval_timestamp);

-- Ensure PK on room_bookings.id before INSERT ON CONFLICT (id)
DO $$
BEGIN
  IF to_regclass('public.room_bookings') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.room_bookings'::regclass AND contype = 'p'
    ) THEN
      BEGIN
        ALTER TABLE public.room_bookings ADD PRIMARY KEY (id);
        RAISE NOTICE '[reconcile] Added PRIMARY KEY to room_bookings.id';
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '[reconcile] Khong the them PK cho room_bookings: %', SQLERRM;
      END;
    END IF;
  END IF;
END $$;

-- =============================================================================
-- ROOM_BOOKINGS: GỠ dữ liệu demo cũ (Phòng A101/B202/C303).
-- Trước đây block này INSERT lại mỗi lần deploy với id cố định → xoá booking xong
-- deploy lại là "phòng ma" hiện trong dropdown. Nay xoá hẳn theo id demo cố định
-- (chỉ ảnh hưởng đúng các booking demo, KHÔNG đụng booking thật của người dùng).
-- =============================================================================
DELETE FROM public.room_bookings
WHERE id IN (
  'booking-user3-old-001',
  'booking-user1-old-001', 'booking-user1-old-002',
  'booking-user2-old-001', 'booking-user2-old-002'
);

-- =============================================================================
-- TICKETS: Ensure all columns exist that code expects to INSERT.
-- API route.ts inserts: assigned_unit_tag_id, assigned_unit_name, request_type,
--   category_id, category_name, custom_fields, requester_id, requester_name,
--   requester_department, requester_position
-- =============================================================================
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS assigned_unit_tag_id TEXT,
  ADD COLUMN IF NOT EXISTS assigned_unit_name TEXT,
  ADD COLUMN IF NOT EXISTS request_type TEXT,
  ADD COLUMN IF NOT EXISTS category_id TEXT,
  ADD COLUMN IF NOT EXISTS category_name TEXT,
  ADD COLUMN IF NOT EXISTS custom_fields JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS requester_id TEXT,
  ADD COLUMN IF NOT EXISTS requester_name TEXT,
  ADD COLUMN IF NOT EXISTS requester_department TEXT,
  ADD COLUMN IF NOT EXISTS requester_position TEXT;

COMMENT ON TABLE public.user_login_history IS 'Audit trail of all login/logout events. Used for security analysis and user activity tracking.';

-- =============================================================================
-- TICKETS: sequence + code_number (migration 034)
-- Moi POST /api/tickets goi nextval('ticket_code_seq') — neu sequence khong ton
-- tai se crash ngay. Phai dam bao truoc khi bat ky ticket nao duoc tao.
-- =============================================================================
CREATE SEQUENCE IF NOT EXISTS ticket_code_seq START WITH 1;
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS code_number BIGINT;
CREATE INDEX IF NOT EXISTS idx_tickets_code_number ON public.tickets(code_number);

-- =============================================================================
-- TICKETS: cac cot bo sung (migrations 037, 051)
-- =============================================================================
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS followers      JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS rejected_by    TEXT,
  ADD COLUMN IF NOT EXISTS rejected_at    TIMESTAMP WITH TIME ZONE;

-- Cap nhat CHECK constraint de chap nhan day du gia tri status
ALTER TABLE public.tickets DROP CONSTRAINT IF EXISTS tickets_status_check;
ALTER TABLE public.tickets ADD CONSTRAINT tickets_status_check
  CHECK (status = ANY (ARRAY[
    'open'::text, 'in_progress'::text, 'resolved'::text, 'closed'::text,
    'submitted'::text, 'completed'::text, 'rejected'::text, 'pending'::text
  ]));

-- =============================================================================
-- TICKET_ATTACHMENTS: cac cot bo sung (migration 048)
-- =============================================================================
ALTER TABLE public.ticket_attachments
  ADD COLUMN IF NOT EXISTS description   TEXT,
  ADD COLUMN IF NOT EXISTS is_internal   BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS file_type     TEXT,
  ADD COLUMN IF NOT EXISTS download_count INTEGER DEFAULT 0;

-- =============================================================================
-- NOTIFICATIONS: cac cot navigation (migration 025)
-- Dung boi notificationsService.ts buildInsert('notifications', { related_id, related_url })
-- =============================================================================
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS related_id  TEXT,
  ADD COLUMN IF NOT EXISTS related_url TEXT;
CREATE INDEX IF NOT EXISTS idx_notifications_related_id  ON public.notifications(related_id);
CREATE INDEX IF NOT EXISTS idx_notifications_related_url ON public.notifications(related_url);

-- =============================================================================
-- TICKET_STATUS_HISTORY (migration 008)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.ticket_status_history (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id      UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  old_status     TEXT,
  new_status     TEXT NOT NULL,
  changed_by     TEXT NOT NULL,
  changed_by_name TEXT,
  reason         TEXT,
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ticket_status_history_ticket_id  ON public.ticket_status_history(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_status_history_created_at ON public.ticket_status_history(created_at);

-- =============================================================================
-- TICKET_WATCHERS (migration 049)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.ticket_watchers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id  UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  watch_type TEXT DEFAULT 'all' CHECK (watch_type IN ('all', 'comments', 'status')),
  muted      BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT ticket_watchers_unique UNIQUE (ticket_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_ticket_watchers_ticket_id ON public.ticket_watchers(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_watchers_user_id   ON public.ticket_watchers(user_id);
CREATE INDEX IF NOT EXISTS idx_ticket_watchers_unmuted   ON public.ticket_watchers(ticket_id) WHERE muted = false;

-- =============================================================================
-- TICKET_AUDIT_EVENTS (migration 050)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.ticket_audit_events (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id          UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  event_type         TEXT NOT NULL,
  actor_id           UUID REFERENCES public.users(id) ON DELETE SET NULL,
  actor_name         TEXT,
  old_value          JSONB,
  new_value          JSONB,
  related_entity_id  UUID,
  metadata           JSONB,
  created_at         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ticket_audit_events_ticket_created ON public.ticket_audit_events(ticket_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ticket_audit_events_event_type     ON public.ticket_audit_events(event_type);
CREATE INDEX IF NOT EXISTS idx_ticket_audit_events_actor_id       ON public.ticket_audit_events(actor_id);

-- =============================================================================
-- TICKET_COMMENTS + TICKET_COMMENT_MENTIONS (migrations 052, 053)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.ticket_comments (
  id           TEXT PRIMARY KEY,
  ticket_id    UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES public.users(id) ON DELETE SET NULL,
  user_name    VARCHAR(255),
  user_avatar  TEXT,
  content      TEXT NOT NULL,
  is_internal  BOOLEAN DEFAULT false,
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at   TIMESTAMP WITH TIME ZONE,
  deleted_at   TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket_id      ON public.ticket_comments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket_created ON public.ticket_comments(ticket_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ticket_comments_user_id        ON public.ticket_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_ticket_comments_not_deleted    ON public.ticket_comments(ticket_id) WHERE deleted_at IS NULL;
-- patch: dam bao user_avatar ton tai (migration 053)
ALTER TABLE public.ticket_comments ADD COLUMN IF NOT EXISTS user_avatar TEXT;

CREATE TABLE IF NOT EXISTS public.ticket_comment_mentions (
  comment_id        TEXT NOT NULL REFERENCES public.ticket_comments(id) ON DELETE CASCADE,
  mentioned_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  PRIMARY KEY (comment_id, mentioned_user_id)
);
CREATE INDEX IF NOT EXISTS idx_ticket_comment_mentions_user    ON public.ticket_comment_mentions(mentioned_user_id);
CREATE INDEX IF NOT EXISTS idx_ticket_comment_mentions_comment ON public.ticket_comment_mentions(comment_id);

-- =============================================================================
-- NOTIFICATION_HISTORY (migration 007)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.notification_history (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id         TEXT NOT NULL,
  notification_type TEXT NOT NULL,
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notification_history_domain_id         ON public.notification_history(domain_id);
CREATE INDEX IF NOT EXISTS idx_notification_history_notification_type ON public.notification_history(notification_type);

-- =============================================================================
-- MODULE TRA CỨU — migrations 054-059 (idempotent)
-- =============================================================================

-- 054: documents (Văn Bản - Quyết Định)
CREATE TABLE IF NOT EXISTS public.documents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT NOT NULL,
  doc_number   TEXT,
  doc_type     TEXT NOT NULL DEFAULT 'document',
  issued_by    TEXT,
  issued_date  DATE,
  description  TEXT,
  status       TEXT NOT NULL DEFAULT 'active',
  created_by   UUID,
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_documents_status      ON public.documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_doc_type    ON public.documents(doc_type);
CREATE INDEX IF NOT EXISTS idx_documents_issued_date ON public.documents(issued_date DESC);
CREATE INDEX IF NOT EXISTS idx_documents_created_at  ON public.documents(created_at DESC);

-- 055: document_attachments
CREATE TABLE IF NOT EXISTS public.document_attachments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  file_name    TEXT NOT NULL,
  stored_name  TEXT NOT NULL,
  mime_type    TEXT,
  file_size    BIGINT DEFAULT 0,
  content      BYTEA,
  uploaded_by  UUID,
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_document_attachments_document_id ON public.document_attachments(document_id);

-- 056: announcements (Thông Báo - Truyền Thông)
CREATE TABLE IF NOT EXISTS public.announcements (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title          TEXT NOT NULL,
  content        TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'draft',
  pinned         BOOLEAN NOT NULL DEFAULT false,
  telegram_sent  BOOLEAN DEFAULT false,
  published_at   TIMESTAMP WITH TIME ZONE,
  published_by   UUID,
  created_by     UUID,
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- Bù cột pinned cho DB cũ đã tạo bảng trước migration 070
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_announcements_status       ON public.announcements(status);
CREATE INDEX IF NOT EXISTS idx_announcements_pinned       ON public.announcements(pinned);
CREATE INDEX IF NOT EXISTS idx_announcements_published_at ON public.announcements(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcements_created_at   ON public.announcements(created_at DESC);

-- 057: announcement_attachments
CREATE TABLE IF NOT EXISTS public.announcement_attachments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id  UUID NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  file_name        TEXT NOT NULL,
  stored_name      TEXT NOT NULL,
  mime_type        TEXT,
  file_size        BIGINT DEFAULT 0,
  content          BYTEA,
  is_image         BOOLEAN DEFAULT false,
  uploaded_by      UUID,
  created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_announcement_attachments_announcement_id ON public.announcement_attachments(announcement_id);
CREATE INDEX IF NOT EXISTS idx_announcement_attachments_is_image        ON public.announcement_attachments(is_image);

-- 058: contacts (Đầu Mối Liên Hệ)
-- Thiết kế: mỗi liên hệ chỉ lưu responsibility + user_id,
-- thông tin chi tiết (name/phone/email/department/position) đọc từ users table.
CREATE TABLE IF NOT EXISTS public.contacts (
  id             TEXT PRIMARY KEY,
  user_id        TEXT,                                        -- FK → users.id (người đại diện)
  responsibility TEXT NOT NULL,                              -- "Bảo Trì Bảo Dưỡng Toà Nhà"
  note           TEXT,                                       -- ghi chú thêm tự do
  is_active      BOOLEAN NOT NULL DEFAULT true,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_by     TEXT,                                       -- FK → users.id
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contacts_is_active   ON public.contacts(is_active);
CREATE INDEX IF NOT EXISTS idx_contacts_sort_order  ON public.contacts(sort_order ASC);
CREATE INDEX IF NOT EXISTS idx_contacts_user_id     ON public.contacts(user_id);

-- Migrate dữ liệu cũ: chuyển UUID id → TEXT, giữ nguyên các cột mới thêm
-- (idempotent: các cột cũ name/title/department/... sẽ bị xóa ở migration sau nếu cần,
--  hiện tại chỉ add cột mới để không mất dữ liệu đang chạy)
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS responsibility TEXT;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS note           TEXT;
-- Backfill responsibility: dùng DO block để tránh lỗi nếu cột title/name không tồn tại
DO $$
BEGIN
  -- Nếu cột title tồn tại (schema cũ) thì backfill từ đó
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name='contacts' AND column_name='title') THEN
    UPDATE public.contacts
    SET responsibility = COALESCE(title, 'Chưa phân loại')
    WHERE responsibility IS NULL;
  ELSE
    -- Schema mới: chỉ đặt default cho row nào thiếu
    UPDATE public.contacts
    SET responsibility = 'Chưa phân loại'
    WHERE responsibility IS NULL;
  END IF;
END $$;

-- 059: assets.assigned_to
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS assigned_to UUID;
CREATE INDEX IF NOT EXISTS idx_assets_assigned_to ON public.assets(assigned_to);

-- 060: attendance_records (Chấm Công)
CREATE TABLE IF NOT EXISTS public.attendance_records (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL,
  type         TEXT NOT NULL DEFAULT 'app',
  event_type   TEXT NOT NULL DEFAULT 'check_in',
  recorded_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  lat          DECIMAL(10,8),
  lng          DECIMAL(11,8),
  photo        BYTEA,
  photo_mime   TEXT,
  notes        TEXT,
  machine_id   TEXT,
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_attendance_records_user_id     ON public.attendance_records(user_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_recorded_at ON public.attendance_records(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_records_user_date   ON public.attendance_records(user_id, recorded_at DESC);

-- 061: attendance_sheets (Bảng Công)
CREATE TABLE IF NOT EXISTS public.attendance_sheets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL,
  month         INTEGER NOT NULL,
  year          INTEGER NOT NULL,
  status        TEXT NOT NULL DEFAULT 'draft',
  total_days    INTEGER DEFAULT 0,
  present_days  INTEGER DEFAULT 0,
  late_days     INTEGER DEFAULT 0,
  absent_days   INTEGER DEFAULT 0,
  comment       TEXT,
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

-- 062: total_hours
ALTER TABLE public.attendance_sheets
  ADD COLUMN IF NOT EXISTS total_hours DECIMAL(6,2) DEFAULT 0;

-- 063: machine mappings
CREATE TABLE IF NOT EXISTS public.attendance_machine_mappings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id     TEXT NOT NULL DEFAULT 'default',
  employee_code  TEXT NOT NULL,
  user_id        UUID NOT NULL,
  created_by     UUID,
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(machine_id, employee_code)
);
CREATE INDEX IF NOT EXISTS idx_machine_mappings_machine_code ON public.attendance_machine_mappings(machine_id, employee_code);
CREATE INDEX IF NOT EXISTS idx_machine_mappings_user_id      ON public.attendance_machine_mappings(user_id);

CREATE TABLE IF NOT EXISTS public.attendance_unmatched (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id     TEXT NOT NULL,
  employee_code  TEXT NOT NULL,
  event_type     TEXT NOT NULL,
  recorded_at    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  resolved       BOOLEAN DEFAULT false,
  resolved_to    UUID,
  resolved_at    TIMESTAMP WITH TIME ZONE,
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_attendance_unmatched_resolved ON public.attendance_unmatched(resolved);
CREATE INDEX IF NOT EXISTS idx_attendance_unmatched_machine  ON public.attendance_unmatched(machine_id, employee_code);

-- -----------------------------------------------------------------------------
-- Propagate company xuong cap duoi: neu user co company=null nhung manager co
-- company, ke thua company tu manager (de quy). Chay idempotent — chi UPDATE
-- row co company IS NULL nen khong bao gio ghi de du lieu cu.
-- -----------------------------------------------------------------------------
WITH RECURSIVE org_company AS (
  SELECT id, company
  FROM public.users
  WHERE company IS NOT NULL
  UNION ALL
  SELECT u.id, oc.company
  FROM public.users u
  JOIN org_company oc ON u.manager_id::text = oc.id::text
  WHERE u.company IS NULL
)
UPDATE public.users u
SET company = oc.company
FROM org_company oc
WHERE u.id::text = oc.id::text
  AND u.company IS NULL;

-- -----------------------------------------------------------------------------
-- attendance_sheets: sent_to_hr flow (manager -> HCNS)
-- -----------------------------------------------------------------------------
ALTER TABLE public.attendance_sheets
  ADD COLUMN IF NOT EXISTS sent_to_hr_at       TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS sent_by_manager_id  UUID;

-- -----------------------------------------------------------------------------
-- attendance_sheets: hr_note + lock fields
-- -----------------------------------------------------------------------------
ALTER TABLE public.attendance_sheets
  ADD COLUMN IF NOT EXISTS hr_note   TEXT,
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS locked_by UUID;

-- -----------------------------------------------------------------------------
-- users: Hồ Sơ Nhân Sự — thông tin lao động & tài chính
-- -----------------------------------------------------------------------------
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS hire_date         DATE,
  ADD COLUMN IF NOT EXISTS employment_type   TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_no   TEXT,
  ADD COLUMN IF NOT EXISTS bank_name         TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_name TEXT,
  ADD COLUMN IF NOT EXISTS home_address      TEXT,
  ADD COLUMN IF NOT EXISTS work_location     TEXT;

-- -----------------------------------------------------------------------------
-- public_holidays — ngày lễ, nghỉ chính thức (dùng bởi attendanceAdjustmentService)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.public_holidays (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  date        DATE        NOT NULL UNIQUE,
  name        TEXT        NOT NULL,
  description TEXT,
  created_by  TEXT,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_public_holidays_date ON public.public_holidays(date);

-- -----------------------------------------------------------------------------
-- attendance_adjustments — đề xuất bù công / bù checkin / bù checkout
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.attendance_adjustments (
  id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id             TEXT        NOT NULL,
  adjustment_type     TEXT        NOT NULL, -- hợp lệ kiểm ở tầng ứng dụng theo catalog (không CHECK cứng, cho loại work-mode mới)
  work_date           DATE        NOT NULL,
  requested_checkin   TIMESTAMP WITH TIME ZONE,
  requested_checkout  TIMESTAMP WITH TIME ZONE,
  reason              TEXT        NOT NULL,
  status              TEXT        NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','approved','rejected','cancelled')),
  reviewed_by         TEXT,
  reviewed_at         TIMESTAMP WITH TIME ZONE,
  review_note         TEXT,
  created_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (user_id, work_date, adjustment_type)
);
CREATE INDEX IF NOT EXISTS idx_attendance_adjustments_user    ON public.attendance_adjustments(user_id);
CREATE INDEX IF NOT EXISTS idx_attendance_adjustments_date    ON public.attendance_adjustments(work_date);
CREATE INDEX IF NOT EXISTS idx_attendance_adjustments_status  ON public.attendance_adjustments(status);

-- -----------------------------------------------------------------------------
-- announcement_reactions — emoji reactions cho thông báo nội bộ
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.announcement_reactions (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  announcement_id TEXT        NOT NULL,
  user_id         TEXT        NOT NULL,
  reaction        TEXT        NOT NULL,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (announcement_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_announcement_reactions_ann  ON public.announcement_reactions(announcement_id);
CREATE INDEX IF NOT EXISTS idx_announcement_reactions_user ON public.announcement_reactions(user_id);

-- -----------------------------------------------------------------------------
-- attendance_machines — cấu hình máy chấm công ZKTeco
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.attendance_machines (
  id              TEXT PRIMARY KEY,
  name            TEXT        NOT NULL,
  host            TEXT        NOT NULL,
  port            INTEGER     NOT NULL DEFAULT 4370,
  machine_type    TEXT        NOT NULL DEFAULT 'zkteco',
  location        TEXT,
  status          TEXT        NOT NULL DEFAULT 'active',
  last_sync       TIMESTAMP WITH TIME ZONE,
  last_error      TEXT,
  polling_enabled BOOLEAN     NOT NULL DEFAULT true,
  notes           TEXT,
  created_by      TEXT,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- room_booking_participants — danh sách người tham gia cuộc họp
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.room_booking_participants (
  id                TEXT PRIMARY KEY,
  booking_id        TEXT        NOT NULL,
  participant_id    TEXT,
  participant_email TEXT,
  participant_name  TEXT,
  status            TEXT        NOT NULL DEFAULT 'pending',
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rbp_booking ON public.room_booking_participants(booking_id);
CREATE INDEX IF NOT EXISTS idx_rbp_participant ON public.room_booking_participants(participant_id);

-- -----------------------------------------------------------------------------
-- archived_room_bookings — lưu trữ đặt phòng cũ (cron job archive)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.archived_room_bookings (
  id                  TEXT PRIMARY KEY,
  room_id             TEXT,
  room_name           TEXT,
  booking_date        DATE,
  start_time          TEXT,
  end_time            TEXT,
  duration_minutes    INTEGER,
  requested_by        TEXT,
  requested_by_name   TEXT,
  participants        JSONB,
  purpose             TEXT,
  status              TEXT,
  created_at          TIMESTAMP WITH TIME ZONE,
  updated_at          TIMESTAMP WITH TIME ZONE,
  approval_timestamp  TIMESTAMP WITH TIME ZONE,
  approval_by_name    TEXT,
  rejection_reason    TEXT,
  archived_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_arb_room        ON public.archived_room_bookings(room_id);
CREATE INDEX IF NOT EXISTS idx_arb_archived_at ON public.archived_room_bookings(archived_at);

-- -----------------------------------------------------------------------------
-- projects — dự án (dùng bởi projectService, milestones)
-- Bảng có thể đã tồn tại từ migration cũ với schema khác (manager_id, budget).
-- CREATE TABLE IF NOT EXISTS chỉ tạo khi chưa có; sau đó ALTER TABLE bù cột mới.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.projects (
  id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  company_id     TEXT,
  name           TEXT        NOT NULL,
  description    TEXT,
  owner_id       TEXT,
  start_date     DATE,
  end_date       DATE,
  budget_amount  NUMERIC(15,2) NOT NULL DEFAULT 0,
  status         TEXT        NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active','completed','archived','cancelled')),
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- Bù cột cho DB cũ đã có bảng projects nhưng thiếu các cột mới
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS owner_id      TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS budget_amount NUMERIC(15,2) NOT NULL DEFAULT 0;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS start_date    DATE;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS end_date      DATE;
CREATE INDEX IF NOT EXISTS idx_projects_company ON public.projects(company_id);
CREATE INDEX IF NOT EXISTS idx_projects_status  ON public.projects(status);
-- Index owner_id chỉ tạo sau khi cột đã chắc chắn tồn tại
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE tablename='projects' AND indexname='idx_projects_owner'
  ) THEN
    CREATE INDEX idx_projects_owner ON public.projects(owner_id);
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- attendance_overtime — khai báo tăng ca (migration 071)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.attendance_overtime (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       TEXT        NOT NULL,
  work_date     DATE        NOT NULL,
  start_time    TEXT        NOT NULL,
  end_time      TEXT        NOT NULL,
  evening_hours DECIMAL(5,2) NOT NULL DEFAULT 0,
  night_hours   DECIMAL(5,2) NOT NULL DEFAULT 0,
  reason        TEXT,
  status        TEXT        NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','rejected','cancelled')),
  reviewed_by   TEXT,
  reviewed_at   TIMESTAMP WITH TIME ZONE,
  review_note   TEXT,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (user_id, work_date)
);
CREATE INDEX IF NOT EXISTS idx_attendance_overtime_user_id   ON public.attendance_overtime(user_id);
CREATE INDEX IF NOT EXISTS idx_attendance_overtime_work_date ON public.attendance_overtime(work_date);
CREATE INDEX IF NOT EXISTS idx_attendance_overtime_status    ON public.attendance_overtime(status);

-- -----------------------------------------------------------------------------
-- users: employee_code (migration 084) — dùng cho auto-map ADMS
-- -----------------------------------------------------------------------------
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS employee_code TEXT;
CREATE INDEX IF NOT EXISTS idx_users_employee_code ON public.users(employee_code);

-- -----------------------------------------------------------------------------
-- attendance_records: employee_code (migration 072)
-- -----------------------------------------------------------------------------
ALTER TABLE public.attendance_records
  ADD COLUMN IF NOT EXISTS employee_code TEXT;
CREATE INDEX IF NOT EXISTS idx_attendance_records_employee_code ON public.attendance_records(employee_code);

-- -----------------------------------------------------------------------------
-- device_punches — nguồn sự thật punch thô từ máy ZKTeco (migration 073)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.device_punches (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id    TEXT NOT NULL,
  employee_code TEXT NOT NULL,
  punch_time    TIMESTAMPTZ NOT NULL,
  raw_status    INTEGER,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (machine_id, employee_code, punch_time)
);
CREATE INDEX IF NOT EXISTS idx_device_punches_lookup ON public.device_punches(machine_id, employee_code, punch_time);
CREATE INDEX IF NOT EXISTS idx_device_punches_time   ON public.device_punches(punch_time);

-- -----------------------------------------------------------------------------
-- Backfill device_punches từ attendance_unmatched (migration 074, idempotent)
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.attendance_unmatched') IS NOT NULL
     AND to_regclass('public.device_punches') IS NOT NULL THEN
    INSERT INTO public.device_punches (machine_id, employee_code, punch_time)
    SELECT machine_id, employee_code, recorded_at
    FROM public.attendance_unmatched
    WHERE employee_code IS NOT NULL
    ON CONFLICT (machine_id, employee_code, punch_time) DO NOTHING;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- attendance_machine_mappings: temporal mapping (migration 075)
-- -----------------------------------------------------------------------------
ALTER TABLE public.attendance_machine_mappings
  ADD COLUMN IF NOT EXISTS effective_from TIMESTAMPTZ NOT NULL DEFAULT '1970-01-01 00:00:00+00',
  ADD COLUMN IF NOT EXISTS effective_to   TIMESTAMPTZ;

-- Bỏ UNIQUE cũ (machine_id, employee_code) — giờ cho phép nhiều dòng theo thời gian
ALTER TABLE public.attendance_machine_mappings
  DROP CONSTRAINT IF EXISTS attendance_machine_mappings_machine_id_employee_code_key;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_open_machine_mapping
  ON public.attendance_machine_mappings (machine_id, employee_code)
  WHERE effective_to IS NULL;

CREATE INDEX IF NOT EXISTS idx_mapping_temporal
  ON public.attendance_machine_mappings (machine_id, employee_code, effective_from, effective_to);

-- -----------------------------------------------------------------------------
-- attendance_machines: connection_mode, comm_key, poll_interval_seconds (migration 076)
-- -----------------------------------------------------------------------------
ALTER TABLE public.attendance_machines
  ADD COLUMN IF NOT EXISTS connection_mode       TEXT NOT NULL DEFAULT 'pull',
  ADD COLUMN IF NOT EXISTS comm_key              TEXT,
  ADD COLUMN IF NOT EXISTS poll_interval_seconds INTEGER NOT NULL DEFAULT 30;

-- =============================================================================
-- room_bookings: Create table with all columns (migrations 011, 012, 031)
-- Ensures table exists even if init script doesn't run (e.g., fresh DB, CI/CD)
-- Idempotent: CREATE TABLE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS
-- =============================================================================
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
  confirmed_at      TIMESTAMP WITH TIME ZONE,
  confirmed_by      UUID,
  confirmation_note TEXT,
  cancellation_reason TEXT,
  cancelled_by      UUID,
  cancelled_at      TIMESTAMP WITH TIME ZONE,
  approval_timestamp TIMESTAMP,
  approval_by_name  TEXT,
  rejection_reason  TEXT,
  created_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_room_bookings_room_name   ON public.room_bookings(room_name);
CREATE INDEX IF NOT EXISTS idx_room_bookings_booking_date ON public.room_bookings(booking_date);
CREATE INDEX IF NOT EXISTS idx_room_bookings_status       ON public.room_bookings(status);
CREATE INDEX IF NOT EXISTS idx_room_bookings_requested_by ON public.room_bookings(requested_by);
CREATE INDEX IF NOT EXISTS idx_room_bookings_confirmed_at ON public.room_bookings(confirmed_at DESC);
CREATE INDEX IF NOT EXISTS idx_room_bookings_cancelled_at ON public.room_bookings(cancelled_at DESC);
CREATE INDEX IF NOT EXISTS idx_room_bookings_cancelled_by ON public.room_bookings(cancelled_by);
CREATE INDEX IF NOT EXISTS idx_room_bookings_approval_timestamp ON public.room_bookings(approval_timestamp);
CREATE INDEX IF NOT EXISTS idx_room_bookings_approval_by_name ON public.room_bookings(approval_by_name);

-- =============================================================================
-- MODULE NHÂN SỰ (C&B) — Hợp đồng & Hồ sơ (migrations 077–083)
-- Mirror idempotent để DB server đang chạy tự có bảng lúc boot.
-- =============================================================================
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
-- 176: mã ngắn + template sinh mã hợp đồng
ALTER TABLE public.contract_types
  ADD COLUMN IF NOT EXISTS code          TEXT,
  ADD COLUMN IF NOT EXISTS code_template TEXT;
INSERT INTO public.contract_types (id, name, sort_order) VALUES
  ('ctype_indefinite', 'Không xác định thời hạn', 1),
  ('ctype_fixed_term', 'Xác định thời hạn',       2),
  ('ctype_probation',  'Thử việc',                3),
  ('ctype_cooperation','Thỏa thuận hợp tác',      4)
ON CONFLICT (id) DO NOTHING;
-- 176: seed mã + template mặc định (chỉ set khi NULL)
UPDATE public.contract_types SET code = 'TTHT'  WHERE id = 'ctype_cooperation' AND code IS NULL;
UPDATE public.contract_types SET code = 'NDA'   WHERE id = 'ctype_nda'         AND code IS NULL;
UPDATE public.contract_types SET code = 'HDLD'  WHERE id IN ('ctype_indefinite', 'ctype_fixed_term') AND code IS NULL;
UPDATE public.contract_types SET code = 'TV'    WHERE id = 'ctype_probation'   AND code IS NULL;
UPDATE public.contract_types SET code = 'TVIEC' WHERE id = 'ctype_termination' AND code IS NULL;
UPDATE public.contract_types
   SET code_template = '{DD}{MM}.{SEQ}/{YYYY}/{TYPE}-{COMPANY}'
 WHERE code_template IS NULL;

-- 177: gắn Hình thức làm việc ↔ Loại hợp đồng (many-to-many)
CREATE TABLE IF NOT EXISTS public.employment_type_contract_types (
  employment_type_id TEXT NOT NULL REFERENCES public.employment_types(id) ON DELETE CASCADE,
  contract_type_id   TEXT NOT NULL REFERENCES public.contract_types(id)   ON DELETE CASCADE,
  sort_order         INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (employment_type_id, contract_type_id)
);
CREATE INDEX IF NOT EXISTS idx_etct_employment_type
  ON public.employment_type_contract_types(employment_type_id);

-- 178: bộ đếm STT sinh mã hợp đồng (nguyên tử, reset theo ngày)
CREATE TABLE IF NOT EXISTS public.contract_code_counters (
  scope      TEXT PRIMARY KEY,
  last_seq   INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.contracts (
  id                   TEXT PRIMARY KEY,
  employee_id          TEXT NOT NULL,
  contract_type_id     TEXT REFERENCES public.contract_types(id) ON DELETE SET NULL,
  contract_number      VARCHAR(100) NOT NULL UNIQUE,
  sign_date            DATE,
  start_date           DATE,
  end_date             DATE,
  salary_info          TEXT,
  notes                TEXT,
  status               TEXT NOT NULL DEFAULT 'active',
  previous_contract_id TEXT REFERENCES public.contracts(id) ON DELETE SET NULL,
  created_by           TEXT,
  created_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contracts_employee_id ON public.contracts(employee_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status      ON public.contracts(status);
CREATE INDEX IF NOT EXISTS idx_contracts_end_date    ON public.contracts(end_date);
CREATE INDEX IF NOT EXISTS idx_contracts_type        ON public.contracts(contract_type_id);

CREATE TABLE IF NOT EXISTS public.contract_attachments (
  id          TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  file_name   VARCHAR(255) NOT NULL,
  mime_type   VARCHAR(150),
  size_bytes  INTEGER,
  content     BYTEA NOT NULL,
  uploaded_by TEXT,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deleted_at  TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS idx_contract_attachments_contract_id ON public.contract_attachments(contract_id);

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
  ('hdoc_cv',      'Sơ yếu lý lịch / CV',  1),
  ('hdoc_id_card', 'CMND / CCCD',          2),
  ('hdoc_degree',  'Bằng cấp / Chứng chỉ', 3),
  ('hdoc_health',  'Giấy khám sức khỏe',   4),
  ('hdoc_other',   'Giấy tờ khác',         5)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.hr_documents (
  id           TEXT PRIMARY KEY,
  employee_id  TEXT NOT NULL,
  doc_type_id  TEXT REFERENCES public.hr_document_types(id) ON DELETE SET NULL,
  title        TEXT,
  file_name    VARCHAR(255) NOT NULL,
  mime_type    VARCHAR(150),
  size_bytes   INTEGER,
  content      BYTEA NOT NULL,
  uploaded_by  TEXT,
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deleted_at   TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS idx_hr_documents_employee_id ON public.hr_documents(employee_id);

CREATE TABLE IF NOT EXISTS public.contract_reminder_log (
  id          TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  milestone   TEXT NOT NULL,
  slot        TEXT NOT NULL,
  sent_date   DATE NOT NULL,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (contract_id, sent_date, slot)
);
CREATE INDEX IF NOT EXISTS idx_contract_reminder_log_contract ON public.contract_reminder_log(contract_id);

CREATE TABLE IF NOT EXISTS public.contract_watchers (
  id           TEXT PRIMARY KEY,
  contract_id  TEXT NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL,
  added_by     TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_contract_watchers ON public.contract_watchers(contract_id, user_id);
CREATE INDEX IF NOT EXISTS idx_contract_watchers_contract_id ON public.contract_watchers(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_watchers_user_id ON public.contract_watchers(user_id);

CREATE TABLE IF NOT EXISTS public.hr_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL DEFAULT '[]'::JSONB,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.hr_document_replace_requests (
  id              TEXT PRIMARY KEY,
  original_doc_id TEXT NOT NULL REFERENCES public.hr_documents(id) ON DELETE CASCADE,
  new_file_name   TEXT NOT NULL,
  new_title       TEXT,
  new_mime_type   TEXT,
  new_size_bytes  BIGINT,
  new_content     BYTEA NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',
  requested_by    TEXT NOT NULL,
  reviewed_by     TEXT,
  review_note     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hdrr_original_doc ON public.hr_document_replace_requests(original_doc_id);
CREATE INDEX IF NOT EXISTS idx_hdrr_status       ON public.hr_document_replace_requests(status);
CREATE INDEX IF NOT EXISTS idx_hdrr_requested_by ON public.hr_document_replace_requests(requested_by);

-- Foreign Key constraints for user references (ensures referential integrity).
-- Mỗi FK bọc exception riêng: nếu lệch kiểu user_id (TEXT) vs users.id (UUID) trên DB
-- có schema-drift thì BỎ QUA (warning) thay vì abort cả reconcile.
DO $$
BEGIN
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_contract_watchers_user_id') THEN
      ALTER TABLE public.contract_watchers
        ADD CONSTRAINT fk_contract_watchers_user_id
          FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
    END IF;
  EXCEPTION WHEN others THEN RAISE WARNING '[reconcile] Bo qua fk_contract_watchers_user_id: %', SQLERRM;
  END;

  BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_hdrr_requested_by') THEN
      ALTER TABLE public.hr_document_replace_requests
        ADD CONSTRAINT fk_hdrr_requested_by
          FOREIGN KEY (requested_by) REFERENCES public.users(id) ON DELETE CASCADE;
    END IF;
  EXCEPTION WHEN others THEN RAISE WARNING '[reconcile] Bo qua fk_hdrr_requested_by: %', SQLERRM;
  END;

  BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'fk_hdrr_reviewed_by') THEN
      ALTER TABLE public.hr_document_replace_requests
        ADD CONSTRAINT fk_hdrr_reviewed_by
          FOREIGN KEY (reviewed_by) REFERENCES public.users(id) ON DELETE SET NULL;
    END IF;
  EXCEPTION WHEN others THEN RAISE WARNING '[reconcile] Bo qua fk_hdrr_reviewed_by: %', SQLERRM;
  END;
END $$;

-- =============================================================================
-- Module Đánh Giá Thử Việc / Học Việc (migrations 088-093)
-- =============================================================================

-- 088: employment_types lookup
CREATE TABLE IF NOT EXISTS public.employment_types (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  description           TEXT,
  default_duration_days INTEGER,
  requires_evaluation   BOOLEAN NOT NULL DEFAULT false,
  sort_order            INTEGER NOT NULL DEFAULT 0,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO public.employment_types (id, name, description, default_duration_days, requires_evaluation, sort_order)
VALUES
  ('etype_probation',  'Thử việc',          'Nhân viên trong thời gian thử việc',  60,   true,  1),
  ('etype_apprentice', 'Học việc',           'Nhân viên trong thời gian học việc',  90,   true,  2),
  ('etype_intern',     'Thực tập',           'Sinh viên thực tập tại công ty',      90,   true,  3),
  ('etype_full_time',  'Toàn thời gian',     'Nhân viên chính thức toàn thời gian', NULL, false, 4),
  ('etype_part_time',  'Bán thời gian',      'Nhân viên bán thời gian',             NULL, false, 5),
  ('etype_contract',   'Hợp đồng ngắn hạn',  'Hợp đồng lao động có thời hạn',      NULL, false, 6)
ON CONFLICT (id) DO NOTHING;
CREATE INDEX IF NOT EXISTS idx_employment_types_is_active ON public.employment_types(is_active);

-- 089: probation fields on users
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS employment_type_id      TEXT,
  ADD COLUMN IF NOT EXISTS probation_duration_days INTEGER,
  ADD COLUMN IF NOT EXISTS probation_end_date      DATE;
CREATE INDEX IF NOT EXISTS idx_users_employment_type_id ON public.users(employment_type_id);
CREATE INDEX IF NOT EXISTS idx_users_probation_end_date ON public.users(probation_end_date);

-- 090: evaluations
CREATE TABLE IF NOT EXISTS public.evaluations (
  id                    TEXT PRIMARY KEY,
  employee_id           TEXT NOT NULL,
  employment_type_id    TEXT,
  employment_type_name  TEXT,
  hire_date             DATE,
  probation_end_date    DATE,
  status                TEXT NOT NULL DEFAULT 'draft',
  result                TEXT,
  result_note           TEXT,
  evaluated_by          TEXT,
  concluded_by          TEXT,
  concluded_at          TIMESTAMPTZ,
  resulting_contract_id TEXT,
  auto_generated        BOOLEAN NOT NULL DEFAULT false,
  created_by            TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_evaluations_employee_id     ON public.evaluations(employee_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_status          ON public.evaluations(status);
CREATE INDEX IF NOT EXISTS idx_evaluations_probation_end   ON public.evaluations(probation_end_date);
CREATE INDEX IF NOT EXISTS idx_evaluations_employment_type ON public.evaluations(employment_type_id);

-- 091: evaluation_attachments
CREATE TABLE IF NOT EXISTS public.evaluation_attachments (
  id             TEXT PRIMARY KEY,
  evaluation_id  TEXT NOT NULL REFERENCES public.evaluations(id) ON DELETE CASCADE,
  file_name      TEXT NOT NULL,
  mime_type      TEXT,
  size_bytes     BIGINT,
  content        BYTEA NOT NULL,
  uploaded_by    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_eval_attachments_evaluation ON public.evaluation_attachments(evaluation_id);

-- 092: evaluation_watchers (user_id UUID để khớp users.id)
CREATE TABLE IF NOT EXISTS public.evaluation_watchers (
  id            TEXT PRIMARY KEY,
  evaluation_id TEXT NOT NULL REFERENCES public.evaluations(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  added_by      TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_evaluation_watchers ON public.evaluation_watchers(evaluation_id, user_id);
CREATE INDEX IF NOT EXISTS idx_eval_watchers_evaluation ON public.evaluation_watchers(evaluation_id);
CREATE INDEX IF NOT EXISTS idx_eval_watchers_user       ON public.evaluation_watchers(user_id);

-- 093: evaluation_reminder_log
CREATE TABLE IF NOT EXISTS public.evaluation_reminder_log (
  id            TEXT PRIMARY KEY,
  evaluation_id TEXT NOT NULL REFERENCES public.evaluations(id) ON DELETE CASCADE,
  milestone     TEXT NOT NULL,
  slot          TEXT NOT NULL,
  sent_date     DATE NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (evaluation_id, sent_date, slot)
);
CREATE INDEX IF NOT EXISTS idx_eval_reminder_log_evaluation ON public.evaluation_reminder_log(evaluation_id);

-- 094: loại hợp đồng "Hồ sơ thôi việc"
INSERT INTO public.contract_types (id, name, description, sort_order, is_active)
VALUES ('ctype_termination', 'Hồ sơ thôi việc', 'Hồ sơ chấm dứt hợp đồng / thôi việc', 10, true)
ON CONFLICT (id) DO NOTHING;

-- 095: loại tài liệu Hồ Sơ "Hợp đồng"
INSERT INTO public.hr_document_types (id, name, description, sort_order, is_active)
VALUES ('hdoc_contract', 'Hợp đồng', 'Hợp đồng lao động đã lưu trữ tự động khi hoàn tất', 6, true)
ON CONFLICT (id) DO NOTHING;

-- 175: loại tài liệu Hồ Sơ tương ứng từng loại hợp đồng
INSERT INTO public.hr_document_types (id, name, sort_order) VALUES
  ('hdoc_probation',    'Thử việc',                       7),
  ('hdoc_cooperation',  'Thỏa thuận hợp tác',             8),
  ('hdoc_nda',          'Thỏa thuận bảo mật thông tin',   9),
  ('hdoc_termination',  'Hồ sơ thôi việc',               10)
ON CONFLICT (id) DO NOTHING;

-- 096: cột lưu trữ hợp đồng vào kho Hồ Sơ
ALTER TABLE public.hr_documents
  ADD COLUMN IF NOT EXISTS source_contract_id TEXT;
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS archived_to_docs_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_hr_documents_source_contract ON public.hr_documents(source_contract_id);

-- 172: hồ sơ nghỉ việc đính kèm trong offboarding → lưu vào kho Hồ Sơ khi hoàn tất
INSERT INTO public.hr_document_types (id, name, description, sort_order, is_active)
VALUES ('hdoc_termination', 'Hồ sơ nghỉ việc', 'Quyết định thôi việc / biên bản thanh lý / đơn xin nghỉ — lưu tự động khi hoàn tất offboarding', 7, true)
ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.hr_documents
  ADD COLUMN IF NOT EXISTS source_offboarding_id TEXT;
CREATE INDEX IF NOT EXISTS idx_hr_documents_source_offboarding ON public.hr_documents(source_offboarding_id);

-- 173/233: bù công đặc thù + BỎ ràng buộc CHECK cứng để cho phép loại work-mode mới
-- (tự tạo qua danh mục Loại nghỉ). Hợp lệ kiểm ở tầng ứng dụng theo catalog.
ALTER TABLE public.attendance_adjustments
  DROP CONSTRAINT IF EXISTS attendance_adjustments_adjustment_type_check;

-- 174: tính năng Chúc Mừng Sinh Nhật
CREATE TABLE IF NOT EXISTS public.birthday_wishes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id TEXT NOT NULL,
  to_user_id   TEXT NOT NULL,
  message      TEXT NOT NULL,
  wish_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (from_user_id, to_user_id, wish_date)
);
CREATE INDEX IF NOT EXISTS idx_birthday_wishes_to ON public.birthday_wishes(to_user_id, wish_date);
CREATE TABLE IF NOT EXISTS public.birthday_reminder_log (
  log_key    TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO public.tags (name, description, color, is_active)
SELECT 'BOD & Leader', 'Ban lãnh đạo & quản lý — nhắc sinh nhật riêng', '#f59e0b', true
WHERE NOT EXISTS (SELECT 1 FROM public.tags WHERE lower(name) = lower('BOD & Leader'));

-- 097: parser ZKTeco per-machine (legacy | v6.60)
ALTER TABLE public.attendance_machines
  ADD COLUMN IF NOT EXISTS attendance_parser TEXT NOT NULL DEFAULT 'legacy';
-- Bổ sung CHECK constraint nếu chưa có (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attendance_machines_attendance_parser_check'
  ) THEN
    ALTER TABLE public.attendance_machines
      ADD CONSTRAINT attendance_machines_attendance_parser_check
      CHECK (attendance_parser IN ('legacy', 'v6.60'));
  END IF;
END $$;

-- 100: Kho Biểu Mẫu (form_templates) — tạo trước để onboarding_form_fields/submissions tham chiếu form_id
CREATE TABLE IF NOT EXISTS public.form_templates (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT,
  form_type   TEXT NOT NULL DEFAULT 'general' CHECK (form_type IN ('onboarding', 'general')),
  token       TEXT NOT NULL UNIQUE,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'closed')),
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);
INSERT INTO public.form_templates (id, title, description, form_type, token, status)
VALUES (
  'form_onboarding_default',
  'Biểu Mẫu Thông Tin Nhận Việc',
  'Dành cho nhân sự mới điền thông tin khi nhận việc tại FADO Group',
  'onboarding',
  'nhanvien-moi-fado-7f3a9c2e51b8d4a6e0f2c81b',
  'active'
)
ON CONFLICT (id) DO NOTHING;

-- 098 + 100: cấu hình field landing page (đã gồm form_id của 100, unique theo (form_id, field_key))
CREATE TABLE IF NOT EXISTS public.onboarding_form_fields (
  id          TEXT PRIMARY KEY,
  form_id     TEXT,
  field_key   TEXT NOT NULL,
  label       TEXT NOT NULL,
  field_type  TEXT NOT NULL DEFAULT 'text',
  section     TEXT NOT NULL DEFAULT 'personal',
  required    BOOLEAN NOT NULL DEFAULT false,
  enabled     BOOLEAN NOT NULL DEFAULT true,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  help_text   TEXT,
  options     JSONB,
  is_system   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Nếu DB cũ từng tạo bảng với UNIQUE(field_key) đơn cột (migration 098 thuần) → gỡ để dùng unique kép
ALTER TABLE public.onboarding_form_fields ADD COLUMN IF NOT EXISTS form_id TEXT;
ALTER TABLE public.onboarding_form_fields DROP CONSTRAINT IF EXISTS onboarding_form_fields_field_key_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_form_fields_form_key ON public.onboarding_form_fields(form_id, field_key);
CREATE INDEX IF NOT EXISTS idx_onboarding_form_fields_form ON public.onboarding_form_fields(form_id);

-- Seed 36 field mặc định cho biểu mẫu onboarding (gắn form_onboarding_default)
INSERT INTO public.onboarding_form_fields (id, form_id, field_key, label, field_type, section, required, enabled, sort_order, help_text, options, is_system) VALUES
  ('obf_full_name',        'form_onboarding_default', 'full_name',        'Họ và Tên',                'text',     'personal', true,  true, 10,  NULL, NULL, true),
  ('obf_personal_email',   'form_onboarding_default', 'personal_email',   'Email Cá Nhân',            'email',    'personal', true,  true, 20,  NULL, NULL, true),
  ('obf_date_of_birth',    'form_onboarding_default', 'date_of_birth',    'Ngày Tháng Năm Sinh',      'date',     'personal', true,  true, 30,  NULL, NULL, true),
  ('obf_gender',           'form_onboarding_default', 'gender',           'Giới Tính',                'select',   'personal', true,  true, 40,  NULL, '["Nam","Nữ","Khác"]', true),
  ('obf_phone',            'form_onboarding_default', 'phone',            'Số Điện Thoại Di Động',    'tel',      'personal', true,  true, 50,  NULL, NULL, true),
  ('obf_nationality',      'form_onboarding_default', 'nationality',      'Quốc Tịch',                'text',     'personal', false, true, 60,  NULL, NULL, true),
  ('obf_ethnicity',        'form_onboarding_default', 'ethnicity',        'Dân Tộc',                  'text',     'personal', false, true, 70,  NULL, NULL, true),
  ('obf_religion',         'form_onboarding_default', 'religion',         'Tôn Giáo',                 'text',     'personal', false, true, 80,  NULL, NULL, true),
  ('obf_marital_status',   'form_onboarding_default', 'marital_status',   'Tình Trạng Hôn Nhân',      'select',   'personal', false, true, 90,  NULL, '["Độc thân","Đã kết hôn","Ly hôn","Khác"]', true),
  ('obf_children_count',   'form_onboarding_default', 'children_count',   'Số Con (nếu có)',          'number',   'personal', false, true, 100, NULL, NULL, true),
  ('obf_education_level',  'form_onboarding_default', 'education_level',  'Trình Độ Học Vấn',         'select',   'personal', false, true, 110, NULL, '["Trung học phổ thông","Trung cấp","Cao đẳng","Đại học","Thạc sĩ","Tiến sĩ","Khác"]', true),
  ('obf_major',            'form_onboarding_default', 'major',            'Chuyên Ngành',             'text',     'personal', false, true, 120, NULL, NULL, true),
  ('obf_telegram_id',      'form_onboarding_default', 'telegram_id',      'ID Telegram',              'text',     'personal', false, true, 130, 'Mở Telegram, tìm bot @userinfobot, bấm Start — bot sẽ trả về số ID của bạn (ví dụ: 5195958362)', NULL, true),
  ('obf_company',          'form_onboarding_default', 'company_id',       'Công Ty',                  'org',      'work', true,  true, 10, NULL, NULL, true),
  ('obf_department',       'form_onboarding_default', 'department_id',    'Phòng Ban',                'org',      'work', true,  true, 20, NULL, NULL, true),
  ('obf_sub_department',   'form_onboarding_default', 'sub_department_id','Bộ Phận',                  'org',      'work', false, true, 30, NULL, NULL, true),
  ('obf_position',         'form_onboarding_default', 'position_id',      'Chức Vụ',                  'org',      'work', true,  true, 40, NULL, NULL, true),
  ('obf_job_title',        'form_onboarding_default', 'job_title',        'Chức Danh',                'text',     'work', false, true, 50, 'Tự tính: Chức Vụ + Bộ Phận (nếu không có Bộ Phận thì dùng Phòng Ban)', NULL, true),
  ('obf_hire_date',        'form_onboarding_default', 'hire_date',        'Ngày Vào Làm',             'date',     'work', true,  true, 60, NULL, NULL, true),
  ('obf_working_email',    'form_onboarding_default', 'working_email',    'Working Email',            'email',    'work', false, true, 70, 'Để trống nếu chưa được cấp — Quản trị viên sẽ cấp khi duyệt', NULL, true),
  ('obf_national_id',      'form_onboarding_default', 'national_id',      'Số Căn Cước Công Dân',     'text',     'identity', true,  true, 10, NULL, NULL, true),
  ('obf_nid_issue_date',   'form_onboarding_default', 'national_id_issue_date',  'Ngày Cấp',          'date',     'identity', true,  true, 20, NULL, NULL, true),
  ('obf_nid_issue_place',  'form_onboarding_default', 'national_id_issue_place', 'Nơi Cấp',           'text',     'identity', true,  true, 30, NULL, NULL, true),
  ('obf_home_address',     'form_onboarding_default', 'home_address',     'Địa Chỉ Thường Trú',       'textarea', 'identity', true,  true, 40, NULL, NULL, true),
  ('obf_temp_address',     'form_onboarding_default', 'temporary_address','Địa Chỉ Tạm Trú',          'textarea', 'identity', false, true, 50, NULL, NULL, true),
  ('obf_bank_account_no',  'form_onboarding_default', 'bank_account_no',  'Số Tài Khoản',             'text', 'bank', false, true, 10, NULL, NULL, true),
  ('obf_bank_name',        'form_onboarding_default', 'bank_name',        'Ngân Hàng',                'text', 'bank', false, true, 20, NULL, NULL, true),
  ('obf_bank_account_name','form_onboarding_default', 'bank_account_name','Chủ Tài Khoản',            'text', 'bank', false, true, 30, NULL, NULL, true),
  ('obf_vehicle_type',     'form_onboarding_default', 'vehicle_type',     'Phương Tiện Di Chuyển',    'select', 'other', false, true, 10, NULL, '["Không có","Xe máy","Ô tô","Xe đạp","Khác"]', true),
  ('obf_vehicle_plate',    'form_onboarding_default', 'vehicle_plate',    'Biển Số Xe',               'text',   'other', false, true, 20, 'Chỉ hiện khi có phương tiện', NULL, true),
  ('obf_vehicle_model',    'form_onboarding_default', 'vehicle_model',    'Hiệu Xe',                  'text',   'other', false, true, 30, 'Chỉ hiện khi có phương tiện', NULL, true),
  ('obf_ec_name',          'form_onboarding_default', 'emergency_contact_name',         'Tên Người Thân',   'text',     'emergency', true,  true, 10, NULL, NULL, true),
  ('obf_ec_relationship',  'form_onboarding_default', 'emergency_contact_relationship', 'Mối Quan Hệ',      'text',     'emergency', true,  true, 20, NULL, NULL, true),
  ('obf_ec_phone',         'form_onboarding_default', 'emergency_contact_phone',        'Số Điện Thoại',    'tel',      'emergency', true,  true, 30, NULL, NULL, true),
  ('obf_ec_address',       'form_onboarding_default', 'emergency_contact_address',      'Địa Chỉ',          'textarea', 'emergency', false, true, 40, NULL, NULL, true),
  ('obf_attachments',      'form_onboarding_default', 'attachments',      'Đính Kèm Hồ Sơ',           'file', 'attachments', false, true, 10, 'CCCD, bằng cấp, sơ yếu lý lịch... (tối đa 10MB/tệp). Hồ sơ sẽ ở trạng thái nháp cho đến khi được duyệt.', NULL, true)
ON CONFLICT (form_id, field_key) DO NOTHING;
-- Backfill form_id cho dữ liệu cũ (nếu DB từng chạy migration 098 thuần)
UPDATE public.onboarding_form_fields SET form_id = 'form_onboarding_default' WHERE form_id IS NULL;

-- 098 + 100: lời mời + bài nộp onboarding (đã gồm form_id của 100)
CREATE TABLE IF NOT EXISTS public.onboarding_submissions (
  id               TEXT PRIMARY KEY,
  form_id          TEXT,
  token            TEXT NOT NULL UNIQUE,
  candidate_name   TEXT NOT NULL,
  candidate_email  TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','submitted','confirmed','sent_to_admin','approved','rejected')),
  data             JSONB NOT NULL DEFAULT '{}',
  invited_by       TEXT,
  invited_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  email_sent       BOOLEAN NOT NULL DEFAULT false,
  email_error      TEXT,
  submitted_at     TIMESTAMPTZ,
  confirmed_by     TEXT,
  confirmed_at     TIMESTAMPTZ,
  sent_to_admin_at TIMESTAMPTZ,
  approved_by      TEXT,
  approved_at      TIMESTAMPTZ,
  rejected_by      TEXT,
  rejected_at      TIMESTAMPTZ,
  reject_reason    TEXT,
  user_id          TEXT,
  expires_at       TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '14 days'),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.onboarding_submissions ADD COLUMN IF NOT EXISTS form_id TEXT;
CREATE INDEX IF NOT EXISTS idx_onboarding_submissions_status ON public.onboarding_submissions(status);
CREATE INDEX IF NOT EXISTS idx_onboarding_submissions_token  ON public.onboarding_submissions(token);
CREATE INDEX IF NOT EXISTS idx_onboarding_submissions_form   ON public.onboarding_submissions(form_id);
UPDATE public.onboarding_submissions SET form_id = 'form_onboarding_default' WHERE form_id IS NULL;

-- 098: hồ sơ nháp upload từ landing page
ALTER TABLE public.hr_documents
  ADD COLUMN IF NOT EXISTS is_draft BOOLEAN NOT NULL DEFAULT false;

-- 098: Kho CV (Nguồn Nhân Lực)
CREATE TABLE IF NOT EXISTS public.hr_cv_pool (
  id                TEXT PRIMARY KEY,
  candidate_name    TEXT NOT NULL,
  candidate_email   TEXT,
  candidate_phone   TEXT,
  position_applied  TEXT,
  source            TEXT,
  status            TEXT NOT NULL DEFAULT 'new'
                    CHECK (status IN ('new','screening','interviewed','offered','hired','rejected','pool')),
  note              TEXT,
  file_name         TEXT,
  mime_type         TEXT,
  size_bytes        INTEGER,
  content           BYTEA,
  uploaded_by       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_hr_cv_pool_status ON public.hr_cv_pool(status) WHERE deleted_at IS NULL;

-- 098: Kho JD (Nguồn Nhân Lực)
CREATE TABLE IF NOT EXISTS public.hr_jd_pool (
  id               TEXT PRIMARY KEY,
  title            TEXT NOT NULL,
  department_name  TEXT,
  description      TEXT,
  status           TEXT NOT NULL DEFAULT 'active'
                   CHECK (status IN ('draft','active','archived')),
  file_name        TEXT,
  mime_type        TEXT,
  size_bytes       INTEGER,
  content          BYTEA,
  created_by       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at       TIMESTAMPTZ
);

-- 099: trường thông tin cá nhân vào users (map từ form onboarding khi duyệt)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS date_of_birth                   DATE,
  ADD COLUMN IF NOT EXISTS gender                          TEXT,
  ADD COLUMN IF NOT EXISTS personal_email                  TEXT,
  ADD COLUMN IF NOT EXISTS national_id                     TEXT,
  ADD COLUMN IF NOT EXISTS national_id_issue_date          DATE,
  ADD COLUMN IF NOT EXISTS national_id_issue_place         TEXT,
  ADD COLUMN IF NOT EXISTS temporary_address               TEXT,
  ADD COLUMN IF NOT EXISTS nationality                     TEXT,
  ADD COLUMN IF NOT EXISTS education_level                 TEXT,
  ADD COLUMN IF NOT EXISTS major                           TEXT,
  ADD COLUMN IF NOT EXISTS marital_status                  TEXT,
  ADD COLUMN IF NOT EXISTS children_count                  INTEGER,
  ADD COLUMN IF NOT EXISTS ethnicity                       TEXT,
  ADD COLUMN IF NOT EXISTS religion                        TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_type                    TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_plate                   TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_model                   TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_name          TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_relationship  TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone         TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_address       TEXT;

-- 101: loại hợp đồng "Thỏa thuận bảo mật thông tin" (NDA) — dùng cho tự động tạo bản nháp
-- onboarding (cùng "Thỏa thuận hợp tác" ctype_cooperation đã có sẵn).
INSERT INTO public.contract_types (id, name, sort_order)
VALUES ('ctype_nda', 'Thỏa thuận bảo mật thông tin', 5)
ON CONFLICT (id) DO NOTHING;

-- 102: Người thân liên hệ thứ 2 (form Onboarding section 'emergency2' + cột users)
INSERT INTO public.onboarding_form_fields
  (id, form_id, field_key, label, field_type, section, required, enabled, sort_order, help_text, options, is_system)
VALUES
  ('obf_ec2_name',         'form_onboarding_default', 'emergency_contact_2_name',         'Họ Tên Người Thân', 'text',     'emergency2', false, true, 10, NULL, NULL, true),
  ('obf_ec2_relationship', 'form_onboarding_default', 'emergency_contact_2_relationship', 'Mối Quan Hệ',       'text',     'emergency2', false, true, 20, NULL, NULL, true),
  ('obf_ec2_phone',        'form_onboarding_default', 'emergency_contact_2_phone',        'Số Điện Thoại',     'tel',      'emergency2', false, true, 30, NULL, NULL, true),
  ('obf_ec2_address',      'form_onboarding_default', 'emergency_contact_2_address',      'Địa Chỉ',           'textarea', 'emergency2', false, true, 40, NULL, NULL, true)
ON CONFLICT (form_id, field_key) DO NOTHING;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS emergency_contact_2_name          TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_2_relationship  TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_2_phone         TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_2_address       TEXT;

-- 103: Yêu cầu tuyển dụng (requisitions)
CREATE TABLE IF NOT EXISTS public.requisitions (
  id                TEXT PRIMARY KEY,
  title             TEXT NOT NULL,
  company_id        TEXT,
  department_id     TEXT,
  position_id       TEXT,
  jd_id             TEXT,
  target_headcount  INTEGER NOT NULL DEFAULT 1,
  filled_count      INTEGER NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'open'   CHECK (status IN ('pending_approval','pending','open','on_hold','filled','cancelled','rejected')),
  priority          TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  owner_id          TEXT,
  open_date         DATE NOT NULL DEFAULT CURRENT_DATE,
  target_close_date DATE,
  filled_at         DATE,
  note              TEXT,
  created_by        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_requisitions_status ON public.requisitions(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_requisitions_owner  ON public.requisitions(owner_id);
CREATE INDEX IF NOT EXISTS idx_requisitions_open   ON public.requisitions(open_date);

-- 104: ngày nghỉ việc (turnover) — set khi deactivate user
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS left_date DATE;

-- 105: log chống trùng nhắc Yêu Cầu Tuyển Dụng sắp hết hạn
CREATE TABLE IF NOT EXISTS public.requisition_reminder_log (
  id             TEXT PRIMARY KEY,
  requisition_id TEXT NOT NULL,
  milestone      TEXT NOT NULL,
  sent_date      DATE NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (requisition_id, milestone, sent_date)
);
CREATE INDEX IF NOT EXISTS idx_req_reminder_log_req ON public.requisition_reminder_log(requisition_id);

-- 106: workflow tiếp nhận/từ chối Yêu Cầu Tuyển Dụng
ALTER TABLE public.requisitions
  ADD COLUMN IF NOT EXISTS reject_reason TEXT,
  ADD COLUMN IF NOT EXISTS accepted_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS accepted_by   TEXT,
  ADD COLUMN IF NOT EXISTS rejected_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_by   TEXT;
-- Mở rộng CHECK status để gồm 'pending_approval'/'pending'/'rejected' (idempotent: drop + add lại).
-- pending_approval BẮT BUỘC có: service tạo yêu cầu mới luôn set status='pending_approval'
-- (requisitionService.ts). Thiếu nó reconcile.sql sẽ ghi đè migration 120 → lỗi
-- "violates check constraint requisitions_status_check" khi tạo yêu cầu tuyển dụng.
ALTER TABLE public.requisitions DROP CONSTRAINT IF EXISTS requisitions_status_check;
ALTER TABLE public.requisitions ADD CONSTRAINT requisitions_status_check
  CHECK (status IN ('pending_approval','pending','open','on_hold','filled','cancelled','rejected'));

-- 107: Thêm 'manager' vào users_role_check (UI đã có option manager nhưng DB thiếu).
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check
  CHECK (role IN ('super_admin', 'admin', 'manager', 'user'));

-- 108: Đính kèm tài liệu cho Yêu Cầu Tuyển Dụng
CREATE TABLE IF NOT EXISTS public.requisition_attachments (
  id             TEXT PRIMARY KEY,
  requisition_id TEXT NOT NULL REFERENCES public.requisitions(id) ON DELETE CASCADE,
  file_name      TEXT NOT NULL,
  mime_type      TEXT,
  size_bytes     BIGINT,
  content        BYTEA NOT NULL,
  uploaded_by    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_req_attachments_req ON public.requisition_attachments(requisition_id) WHERE deleted_at IS NULL;

-- -----------------------------------------------------------------------------
-- user_avatars (migration 135): ảnh đại diện lưu BYTEA trong DB thay vì file đĩa.
-- Idempotent — lưới an toàn cho boot (đề phòng migration 135 đã đánh dấu chạy mà
-- bảng chưa có). user_id TEXT, không FK (tránh lệch kiểu TEXT/UUID).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_avatars (
  user_id    TEXT PRIMARY KEY,
  content    BYTEA NOT NULL,
  mime_type  TEXT NOT NULL DEFAULT 'image/jpeg',
  size_bytes INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- 153: Thêm 2 trường BHXH vào onboarding_form_fields (section 'other')
INSERT INTO public.onboarding_form_fields
  (id, field_key, label, field_type, section, required, enabled, sort_order, help_text, options, is_system)
VALUES
  ('obf_has_social_ins',    'has_social_insurance',    'Đã tham gia BHXH ở công ty cũ?', 'checkbox', 'other', false, true, 40, 'Tích vào nếu bạn đã từng đóng bảo hiểm xã hội tại đơn vị trước', NULL, false),
  ('obf_social_ins_number', 'social_insurance_number', 'Mã Số Bảo Hiểm Xã Hội',          'text',     'other', false, true, 50, 'Chỉ hiện khi đã tham gia BHXH — bỏ trống nếu chưa có', NULL, false)
ON CONFLICT (id) DO NOTHING;


-- 154: Chữ ký email — chữ ký cá nhân mỗi người dùng (1 user = 1 chữ ký).
CREATE TABLE IF NOT EXISTS public.user_signatures (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  company_id  TEXT,
  template_id TEXT NOT NULL DEFAULT 'modern',
  data        JSONB NOT NULL DEFAULT '{}'::jsonb,
  html        TEXT,
  text_plain  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_signatures_user ON public.user_signatures(user_id);


-- 155: Ảnh chữ ký email phục vụ PUBLIC (avatar/logo hiển thị được khi dán sang email).
CREATE TABLE IF NOT EXISTS public.signature_images (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  mime_type  TEXT NOT NULL DEFAULT 'image/png',
  content    BYTEA NOT NULL,
  size_bytes INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_signature_images_user ON public.signature_images(user_id);


-- 157: Người phụ trách cho từng checklist item offboarding (UUID — khớp với users.id)
ALTER TABLE public.offboarding_checklist_templates
  ADD COLUMN IF NOT EXISTS assignee_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE public.offboarding_checklist_items
  ADD COLUMN IF NOT EXISTS assignee_id UUID REFERENCES public.users(id) ON DELETE SET NULL;


-- 158: Danh sách người nhận thông báo khi tạo quy trình offboarding
CREATE TABLE IF NOT EXISTS public.offboarding_notify_recipients (
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id)
);


-- 159: Lưu trữ quy trình offboarding
ALTER TABLE public.offboarding_processes
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS archived_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by  UUID REFERENCES public.users(id) ON DELETE SET NULL;


-- 160: Cấu hình chấm công theo công ty + hiệu lực theo ngày (company_id NULL = mặc định hệ thống)
CREATE TABLE IF NOT EXISTS public.attendance_settings (
  id              TEXT PRIMARY KEY,
  company_id      UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  effective_from  DATE NOT NULL,
  config          JSONB NOT NULL,
  note            TEXT,
  created_by      UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_settings_company
  ON public.attendance_settings (company_id, effective_from) WHERE company_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_settings_default
  ON public.attendance_settings (effective_from) WHERE company_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_attendance_settings_lookup
  ON public.attendance_settings (company_id, effective_from DESC);


-- 161: Cấu hình hệ thống key/value (Nhắc nhở + Bảo mật). Seed rỗng = dùng DEFAULT trong code.
CREATE TABLE IF NOT EXISTS public.system_settings (
  key         TEXT PRIMARY KEY,
  category    TEXT NOT NULL,
  value       JSONB NOT NULL,
  updated_by  UUID REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_system_settings_category ON public.system_settings(category);


-- 162: Mẫu nội dung thông báo chỉnh được qua UI (seed rỗng = dùng DEFAULT trong code)
CREATE TABLE IF NOT EXISTS public.notification_templates (
  template_key TEXT PRIMARY KEY,
  title        TEXT,
  message      TEXT,
  icon         TEXT,
  updated_by   UUID REFERENCES public.users(id) ON DELETE SET NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 163: biến thể Telegram cho mẫu thông báo (NULL = fallback in-app)
ALTER TABLE public.notification_templates
  ADD COLUMN IF NOT EXISTS telegram TEXT;


-- 164: hộp thư đi Telegram (đảm bảo gửi + retry + theo dõi trạng thái)
CREATE TABLE IF NOT EXISTS public.notification_outbox (
  id              TEXT PRIMARY KEY,
  user_id         TEXT,
  channel         TEXT NOT NULL DEFAULT 'telegram',
  chat_id         TEXT NOT NULL,
  text            TEXT NOT NULL,
  button_label    TEXT,
  button_url      TEXT,
  status          TEXT NOT NULL DEFAULT 'pending',
  attempts        INT  NOT NULL DEFAULT 0,
  max_attempts    INT  NOT NULL DEFAULT 5,
  last_error      TEXT,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at         TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_notif_outbox_due
  ON public.notification_outbox (next_attempt_at) WHERE status = 'pending';

-- 165: gộp (digest) cho hộp thư đi
ALTER TABLE public.notification_outbox
  ADD COLUMN IF NOT EXISTS digest_group TEXT,
  ADD COLUMN IF NOT EXISTS digest_title TEXT,
  ADD COLUMN IF NOT EXISTS digest_line  TEXT,
  ADD COLUMN IF NOT EXISTS landing_url  TEXT;

-- 179: Partial unique index cho assets.serial_number
-- Cho phép nhiều thiết bị không có serial (NULL/'') nhưng chặn trùng khi có serial.
CREATE UNIQUE INDEX IF NOT EXISTS idx_assets_serial_number_unique
  ON public.assets(serial_number)
  WHERE serial_number IS NOT NULL AND serial_number <> '';

-- 188: Trạng thái hội thoại đặt phòng họp qua bot Telegram (FADO Notification)
CREATE TABLE IF NOT EXISTS public.booking_tg_state (
  telegram_id TEXT PRIMARY KEY,
  data        JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 189: Bản tin Telegram theo chat của đơn Solace (đồng bộ trạng thái đa nhân viên)
CREATE TABLE IF NOT EXISTS public.solace_order_messages (
  order_id   TEXT NOT NULL,
  chat_id    TEXT NOT NULL,
  message_id BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (order_id, chat_id, message_id)
);
CREATE INDEX IF NOT EXISTS idx_solace_order_messages_order
  ON public.solace_order_messages (order_id);

-- 190: Lý do huỷ đơn Solace
ALTER TABLE public.solace_orders
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

-- 198: Danh bạ subscriber bot Solace (Marketing broadcast) — mọi người từng /start
CREATE TABLE IF NOT EXISTS public.solace_subscribers (
  chat_id      TEXT PRIMARY KEY,
  user_id      TEXT,
  name         TEXT,
  username     TEXT,
  opted_out    BOOLEAN NOT NULL DEFAULT false,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_solace_subscribers_active
  ON public.solace_subscribers (opted_out) WHERE opted_out = false;
INSERT INTO public.solace_subscribers (chat_id, user_id, name, started_at, last_seen_at)
SELECT telegram_chat_id, id::text, name, NOW(), NOW()
  FROM public.users WHERE telegram_chat_id IS NOT NULL
ON CONFLICT (chat_id) DO NOTHING;

-- 199: Bài Marketing broadcast gửi qua bot Solace
CREATE TABLE IF NOT EXISTS public.marketing_broadcasts (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  content       TEXT NOT NULL,
  image_url     TEXT,
  button_label  TEXT,
  button_url    TEXT,
  status        TEXT NOT NULL DEFAULT 'draft',
  scheduled_at  TIMESTAMPTZ,
  total_count   INTEGER NOT NULL DEFAULT 0,
  sent_count    INTEGER NOT NULL DEFAULT 0,
  failed_count  INTEGER NOT NULL DEFAULT 0,
  created_by    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_marketing_broadcasts_sched
  ON public.marketing_broadcasts (status, scheduled_at);

-- 200: vai trò người gắn hợp đồng (watcher | co_handler = Người Đồng Phụ Trách)
ALTER TABLE public.contract_watchers
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'watcher';

-- 201: đếm số lần nhắc ký HĐ + mốc báo cáo cấp trên (escalation)
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS reminder_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS escalated_at   TIMESTAMPTZ;

-- 202: hợp nhất trạng thái nhận phòng — booking đã "xác nhận sử dụng" (confirmed_at)
-- theo luồng cũ nhưng chưa check-in → coi như ĐÃ NHẬN PHÒNG (checked_in) để dù xác
-- nhận qua webapp hay quét QR đều hiển thị CÙNG một trạng thái. Idempotent: sau khi
-- chạy, status không còn approved/confirmed nên lần sau không khớp lại.
UPDATE public.room_bookings
   SET status = 'checked_in',
       checked_in_at = COALESCE(checked_in_at, confirmed_at)
 WHERE status IN ('approved', 'confirmed')
   AND confirmed_at IS NOT NULL
   AND checked_in_at IS NULL;

-- 229: đăng ký Web Push (thông báo đẩy desktop/điện thoại). Rỗng ⇒ không gửi push nào.
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id          TEXT PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  endpoint    TEXT NOT NULL UNIQUE,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
  ON public.push_subscriptions (user_id);

-- 231: tùy chọn nhận thông báo theo loại × kênh (telegram/webpush). Rỗng = bật hết.
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id    UUID    NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_key  TEXT    NOT NULL,
  channel    TEXT    NOT NULL,
  enabled    BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, event_key, channel)
);
CREATE INDEX IF NOT EXISTS idx_notif_prefs_user ON public.notification_preferences (user_id);

-- 232: hợp nhất loại nghỉ + bù công (cờ applies_to_adjustment, allow_half_day) + seed 3 work-mode
ALTER TABLE public.leave_types
  ADD COLUMN IF NOT EXISTS applies_to_adjustment BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_half_day        BOOLEAN NOT NULL DEFAULT false;
INSERT INTO public.leave_types
  (code, name, paid_by, deducts_balance, allow_hourly, applies_to_adjustment, allow_half_day, color, is_system, active, sort_order)
VALUES
  ('cong_tac',    'Công tác',         'company', false, false, true, false, '#0ea5e9', true, true, 90),
  ('wfh',         'Làm việc tại nhà', 'company', false, false, true, false, '#8b5cf6', true, true, 91),
  ('lam_theo_ca', 'Làm theo ca',      'company', false, false, true, false, '#14b8a6', true, true, 92)
ON CONFLICT (code) DO NOTHING;

-- 234: nghỉ/bù công theo buổi cho work-mode (day_part morning/afternoon/null = cả ngày)
ALTER TABLE public.attendance_adjustments
  ADD COLUMN IF NOT EXISTS day_part TEXT;

-- 237: hồ sơ năng lực public + e-card (1 dòng / user), dữ liệu năng lực JSONB
CREATE TABLE IF NOT EXISTS public.user_ecards (
  user_id        UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  slug           TEXT UNIQUE NOT NULL,
  qr_mode        TEXT NOT NULL DEFAULT 'contact',
  is_public      BOOLEAN NOT NULL DEFAULT true,
  headline       TEXT,
  bio            TEXT,
  theme          TEXT DEFAULT 'indigo',
  skills         JSONB NOT NULL DEFAULT '[]'::jsonb,
  experiences    JSONB NOT NULL DEFAULT '[]'::jsonb,
  education      JSONB NOT NULL DEFAULT '[]'::jsonb,
  certifications JSONB NOT NULL DEFAULT '[]'::jsonb,
  projects       JSONB NOT NULL DEFAULT '[]'::jsonb,
  socials        JSONB NOT NULL DEFAULT '{}'::jsonb,
  visibility     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_ecards_slug ON public.user_ecards(slug);

-- 238: P2 hồ sơ — ảnh bìa, thứ tự section, lượt xem + kho ảnh
ALTER TABLE public.user_ecards
  ADD COLUMN IF NOT EXISTS cover_url     TEXT,
  ADD COLUMN IF NOT EXISTS section_order JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS view_count    INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS public.ecard_images (
  id         TEXT PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content    BYTEA NOT NULL,
  mime_type  TEXT NOT NULL DEFAULT 'image/jpeg',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ecard_images_user ON public.ecard_images(user_id);

-- 239: hồ sơ hướng khách hàng — mục pitch + template landing
ALTER TABLE public.user_ecards
  ADD COLUMN IF NOT EXISTS template     TEXT NOT NULL DEFAULT 'aurora',
  ADD COLUMN IF NOT EXISTS highlights   JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS expertise    JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS clients      JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS testimonials JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 240: vị trí căn chỉnh ảnh bìa (object-position dọc, 0-100%)
ALTER TABLE public.user_ecards
  ADD COLUMN IF NOT EXISTS cover_position INTEGER NOT NULL DEFAULT 50;

-- 278: mục "Trụ sở & Chi nhánh" (locations) — mảng [{label,address,phone}]
ALTER TABLE public.user_ecards
  ADD COLUMN IF NOT EXISTS locations JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 241: Hồ sơ năng lực đa biến thể (Cá Nhân + N Công Ty).
CREATE TABLE IF NOT EXISTS public.user_ecard_variants (
  id             TEXT PRIMARY KEY,
  user_id        UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  scope          TEXT NOT NULL CHECK (scope IN ('personal', 'company')),
  company_id     UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  slug           TEXT UNIQUE NOT NULL,
  title          TEXT,
  qr_mode        TEXT NOT NULL DEFAULT 'profile',
  is_public      BOOLEAN NOT NULL DEFAULT true,
  headline       TEXT,
  bio            TEXT,
  theme          TEXT DEFAULT 'indigo',
  template       TEXT NOT NULL DEFAULT 'aurora',
  cover_url      TEXT,
  cover_position INTEGER NOT NULL DEFAULT 50,
  skills         JSONB NOT NULL DEFAULT '[]'::jsonb,
  experiences    JSONB NOT NULL DEFAULT '[]'::jsonb,
  education      JSONB NOT NULL DEFAULT '[]'::jsonb,
  certifications JSONB NOT NULL DEFAULT '[]'::jsonb,
  projects       JSONB NOT NULL DEFAULT '[]'::jsonb,
  highlights     JSONB NOT NULL DEFAULT '[]'::jsonb,
  expertise      JSONB NOT NULL DEFAULT '[]'::jsonb,
  clients        JSONB NOT NULL DEFAULT '[]'::jsonb,
  testimonials   JSONB NOT NULL DEFAULT '[]'::jsonb,
  socials        JSONB NOT NULL DEFAULT '{}'::jsonb,
  visibility     JSONB NOT NULL DEFAULT '{}'::jsonb,
  section_order  JSONB NOT NULL DEFAULT '[]'::jsonb,
  view_count     INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_uev_personal ON public.user_ecard_variants(user_id) WHERE scope = 'personal';
CREATE UNIQUE INDEX IF NOT EXISTS uq_uev_company  ON public.user_ecard_variants(user_id, company_id) WHERE scope = 'company';
CREATE INDEX IF NOT EXISTS idx_uev_slug    ON public.user_ecard_variants(slug);
CREATE INDEX IF NOT EXISTS idx_uev_user    ON public.user_ecard_variants(user_id);
CREATE INDEX IF NOT EXISTS idx_uev_company ON public.user_ecard_variants(company_id) WHERE company_id IS NOT NULL;

-- 278: mục "Trụ sở & Chi nhánh" (locations)
ALTER TABLE public.user_ecard_variants
  ADD COLUMN IF NOT EXISTS locations JSONB NOT NULL DEFAULT '[]'::jsonb;

INSERT INTO public.user_ecard_variants (
  id, user_id, scope, company_id, slug, title, qr_mode, is_public, headline, bio, theme, template,
  cover_url, cover_position, skills, experiences, education, certifications, projects,
  highlights, expertise, clients, testimonials, socials, visibility, section_order, view_count,
  created_at, updated_at
)
SELECT
  'uev_' || substr(md5(random()::text || clock_timestamp()::text || e.user_id::text), 1, 20),
  e.user_id, 'personal', NULL, e.slug, 'Cá Nhân', e.qr_mode, e.is_public, e.headline, e.bio, e.theme, e.template,
  e.cover_url, e.cover_position, e.skills, e.experiences, e.education, e.certifications, e.projects,
  e.highlights, e.expertise, e.clients, e.testimonials, e.socials, e.visibility, e.section_order, e.view_count,
  e.created_at, e.updated_at
FROM public.user_ecards e
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_ecard_variants v WHERE v.user_id = e.user_id AND v.scope = 'personal'
);

-- 242: Trung Tâm Email
CREATE TABLE IF NOT EXISTS public.email_templates (
  id            TEXT PRIMARY KEY,
  category      TEXT NOT NULL CHECK (category IN ('payment','hr','account','internal','other')),
  key           TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  subject_tpl   TEXT NOT NULL,
  body_html_tpl TEXT NOT NULL,
  schema        JSONB NOT NULL DEFAULT '[]'::jsonb,
  engine        TEXT NOT NULL DEFAULT 'ses' CHECK (engine IN ('ses','smtp')),
  is_active     BOOLEAN NOT NULL DEFAULT true,
  is_system     BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_templates_category ON public.email_templates(category) WHERE is_active;

CREATE TABLE IF NOT EXISTS public.email_outbox (
  id          TEXT PRIMARY KEY,
  template_id TEXT REFERENCES public.email_templates(id) ON DELETE SET NULL,
  category    TEXT,
  engine      TEXT NOT NULL,
  from_addr   TEXT,
  to_addr     TEXT NOT NULL,
  cc          TEXT,
  bcc         TEXT,
  subject     TEXT NOT NULL,
  body_html   TEXT NOT NULL,
  variables   JSONB NOT NULL DEFAULT '{}'::jsonb,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  error       TEXT,
  sent_by     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  sent_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_outbox_created ON public.email_outbox(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_outbox_sent_by ON public.email_outbox(sent_by);
CREATE INDEX IF NOT EXISTS idx_email_outbox_category ON public.email_outbox(category);

CREATE TABLE IF NOT EXISTS public.email_attachments (
  id        TEXT PRIMARY KEY,
  outbox_id TEXT NOT NULL REFERENCES public.email_outbox(id) ON DELETE CASCADE,
  filename  TEXT NOT NULL,
  mime      TEXT NOT NULL DEFAULT 'application/octet-stream',
  size      INTEGER NOT NULL DEFAULT 0,
  content   BYTEA NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_email_attachments_outbox ON public.email_attachments(outbox_id);

-- 243: Email senders (nhiều địa chỉ gửi + default sender per template)
CREATE TABLE IF NOT EXISTS public.email_senders (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  from_addr          TEXT NOT NULL,
  from_name          TEXT,
  reply_to           TEXT,
  engine             TEXT NOT NULL DEFAULT 'ses' CHECK (engine IN ('ses','smtp')),
  ses_region         TEXT,
  ses_access_key     TEXT,
  ses_secret_key     TEXT,
  smtp_host          TEXT,
  smtp_port          INTEGER,
  smtp_secure        BOOLEAN DEFAULT false,
  smtp_user          TEXT,
  smtp_password      TEXT,
  smtp_reject_unauth BOOLEAN DEFAULT true,
  is_default         BOOLEAN NOT NULL DEFAULT false,
  is_active          BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_senders_active ON public.email_senders(is_active);
CREATE UNIQUE INDEX IF NOT EXISTS uq_email_senders_default ON public.email_senders(is_default) WHERE is_default;

ALTER TABLE public.email_templates ADD COLUMN IF NOT EXISTS default_sender_id TEXT REFERENCES public.email_senders(id) ON DELETE SET NULL;
ALTER TABLE public.email_outbox    ADD COLUMN IF NOT EXISTS sender_id         TEXT REFERENCES public.email_senders(id) ON DELETE SET NULL;

INSERT INTO public.email_senders (id, name, from_addr, from_name, engine, is_default, is_active)
SELECT 'es_default_ses', 'Mặc định (SES)', 'no-reply@fadogroup.com.au', 'FADO Group', 'ses', true, true
WHERE NOT EXISTS (SELECT 1 FROM public.email_senders);

-- 244: Update WOKA payment template to use rows-type field with formulas
UPDATE public.email_templates SET
  subject_tpl = 'Đề nghị thanh toán {{ky_thue}} - HĐ {{so_hd}}',
  updated_at = NOW()
WHERE key = 'payment_woka' AND schema::text NOT LIKE '%"rows"%';

-- 245: RSVP nội bộ qua Telegram
CREATE TABLE IF NOT EXISTS public.event_rsvp (
  id            TEXT PRIMARY KEY,
  event_key     TEXT NOT NULL,
  event_title   TEXT NOT NULL,
  template_id   TEXT,
  person_id     UUID REFERENCES public.users(id) ON DELETE SET NULL,
  person_name   TEXT NOT NULL,
  person_email  TEXT,
  chat_id       TEXT,
  message_id    BIGINT,
  response      TEXT NOT NULL DEFAULT 'pending' CHECK (response IN ('pending','yes','no')),
  responded_at  TIMESTAMPTZ,
  note          TEXT,
  sent_by       UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_event_rsvp_key ON public.event_rsvp(event_key);
CREATE INDEX IF NOT EXISTS idx_event_rsvp_person ON public.event_rsvp(person_id);
CREATE INDEX IF NOT EXISTS idx_event_rsvp_response ON public.event_rsvp(event_key, response);

-- 248: Bảo Mật Hồ Sơ (BMHS) — khóa hồ sơ nhân sự bằng mật khẩu
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS bmhs_enabled       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bmhs_password_hash TEXT,
  ADD COLUMN IF NOT EXISTS bmhs_set_by        TEXT,
  ADD COLUMN IF NOT EXISTS bmhs_set_at        TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS public.bmhs_reset_otp (
  id             TEXT PRIMARY KEY,
  target_user_id TEXT NOT NULL,
  requested_by   TEXT NOT NULL,
  otp_hash       TEXT NOT NULL,
  expires_at     TIMESTAMPTZ NOT NULL,
  used_at        TIMESTAMPTZ,
  attempts       INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bmhs_reset_otp_target ON public.bmhs_reset_otp(target_user_id);

-- 249: OTP challenge dùng chung (magic-link → lộ OTP → dùng OTP)
CREATE TABLE IF NOT EXISTS public.otp_challenges (
  id               TEXT PRIMARY KEY,
  purpose          TEXT NOT NULL,
  subject_id       TEXT,
  requested_by     TEXT,
  email            TEXT NOT NULL,
  link_token_hash  TEXT NOT NULL,
  link_expires_at  TIMESTAMPTZ NOT NULL,
  link_used_at     TIMESTAMPTZ,
  otp_hash         TEXT,
  otp_expires_at   TIMESTAMPTZ,
  otp_consumed_at  TIMESTAMPTZ,
  attempts         INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_otp_challenges_link ON public.otp_challenges(link_token_hash);
CREATE INDEX IF NOT EXISTS idx_otp_challenges_subject ON public.otp_challenges(purpose, subject_id);

-- 250: Xác thực hai yếu tố (2FA) qua OTP khi đăng nhập
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS twofa_enabled BOOLEAN NOT NULL DEFAULT false;

-- SSO (migration 297): trạng thái đồng bộ user sang sso.fadoai.com
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS sso_user_id     TEXT,
  ADD COLUMN IF NOT EXISTS sso_sync_status TEXT,
  ADD COLUMN IF NOT EXISTS sso_sync_error  TEXT,
  ADD COLUMN IF NOT EXISTS sso_synced_at   TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS users_sso_user_id_key
  ON users (sso_user_id) WHERE sso_user_id IS NOT NULL;

-- 251: cờ tính Chủ nhật cho loại phép/công (work-mode như Làm theo ca)
ALTER TABLE public.leave_types
  ADD COLUMN IF NOT EXISTS count_sunday BOOLEAN NOT NULL DEFAULT false;
UPDATE public.leave_types SET count_sunday = true WHERE code = 'lam_theo_ca';

-- 253: Hồ Sơ Năng Lực DOANH NGHIỆP — mỗi công ty NHIỀU biến thể (dùng chung)
CREATE TABLE IF NOT EXISTS public.company_ecards (
  id             TEXT PRIMARY KEY,
  company_id     UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  slug           TEXT UNIQUE NOT NULL,
  title          TEXT,
  is_public      BOOLEAN NOT NULL DEFAULT true,
  display_name   TEXT,
  logo_url       TEXT,
  headline       TEXT,
  bio            TEXT,
  theme          TEXT NOT NULL DEFAULT 'indigo',
  template       TEXT NOT NULL DEFAULT 'aurora',
  cover_url      TEXT,
  cover_position INTEGER NOT NULL DEFAULT 50,
  skills         JSONB NOT NULL DEFAULT '[]'::jsonb,
  experiences    JSONB NOT NULL DEFAULT '[]'::jsonb,
  education      JSONB NOT NULL DEFAULT '[]'::jsonb,
  certifications JSONB NOT NULL DEFAULT '[]'::jsonb,
  projects       JSONB NOT NULL DEFAULT '[]'::jsonb,
  highlights     JSONB NOT NULL DEFAULT '[]'::jsonb,
  expertise      JSONB NOT NULL DEFAULT '[]'::jsonb,
  clients        JSONB NOT NULL DEFAULT '[]'::jsonb,
  testimonials   JSONB NOT NULL DEFAULT '[]'::jsonb,
  socials        JSONB NOT NULL DEFAULT '{}'::jsonb,
  visibility     JSONB NOT NULL DEFAULT '{}'::jsonb,
  section_order  JSONB NOT NULL DEFAULT '[]'::jsonb,
  view_count     INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_company_ecards_slug ON public.company_ecards(slug);
CREATE INDEX IF NOT EXISTS idx_company_ecards_company ON public.company_ecards(company_id);
-- 278: mục "Trụ sở & Chi nhánh" (locations)
ALTER TABLE public.company_ecards
  ADD COLUMN IF NOT EXISTS locations JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS ecard_use_company BOOLEAN NOT NULL DEFAULT false;

-- 254: Định mức nguyên liệu theo TÙY CHỌN (option value) — trừ kho khi khách
-- chọn thêm (vd "thêm đường", "topping"). Độc lập với công thức gốc của món.
CREATE TABLE IF NOT EXISTS public.solace_option_recipe_items (
  id              TEXT PRIMARY KEY,
  option_value_id TEXT NOT NULL REFERENCES public.solace_option_values(id) ON DELETE CASCADE,
  ingredient_id   TEXT NOT NULL REFERENCES public.solace_ingredients(id)   ON DELETE CASCADE,
  qty             NUMERIC(14,3) NOT NULL DEFAULT 0,
  wastage_pct     NUMERIC(5,2)  NOT NULL DEFAULT 0,
  UNIQUE (option_value_id, ingredient_id)
);
CREATE INDEX IF NOT EXISTS idx_solace_option_recipe_value
  ON public.solace_option_recipe_items (option_value_id);

-- 255: trường tra cứu masothue.com cho công ty (thông tin pháp lý chi tiết)
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS tax_address         TEXT,
  ADD COLUMN IF NOT EXISTS status              TEXT,
  ADD COLUMN IF NOT EXISTS international_name   TEXT,
  ADD COLUMN IF NOT EXISTS short_name           TEXT,
  ADD COLUMN IF NOT EXISTS activation_date      TEXT,
  ADD COLUMN IF NOT EXISTS managing_tax_office  TEXT,
  ADD COLUMN IF NOT EXISTS business_type        TEXT,
  ADD COLUMN IF NOT EXISTS main_business_line   TEXT,
  ADD COLUMN IF NOT EXISTS business_lines       TEXT;

-- 256: nhãn nút RSVP tuỳ biến
ALTER TABLE public.event_rsvp
  ADD COLUMN IF NOT EXISTS yes_label TEXT,
  ADD COLUMN IF NOT EXISTS no_label  TEXT;

-- 257: Module CHI PHÍ — khung dữ liệu v1 (xem docs/technical/expense-module-roadmap.md)
-- ── Danh mục loại chi phí (flow_type = hành vi dòng chảy, cơ chế MỞ) ─────────
CREATE TABLE IF NOT EXISTS public.expense_categories (
  id          TEXT PRIMARY KEY,
  code        TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  flow_type   TEXT NOT NULL DEFAULT 'operational',  -- asset_purchase|operational|reimbursement|service|advance|...
  company_id  UUID REFERENCES public.companies(id) ON DELETE CASCADE,  -- null = mọi công ty
  color       TEXT NOT NULL DEFAULT '#6366f1',
  active      BOOLEAN NOT NULL DEFAULT true,
  sort_order  INT NOT NULL DEFAULT 99,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Quy tắc số phiếu — MỖI CÔNG TY TỰ QUY ĐỊNH ──────────────────────────────
-- pattern placeholder: {YYYY} {YY} {MM} {SEQ:n} {COMPANY}. Chưa cấu hình → CP-{YYYY}-{SEQ:5}.
CREATE TABLE IF NOT EXISTS public.expense_code_rules (
  company_id      UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  pattern         TEXT NOT NULL DEFAULT 'CP-{YYYY}-{SEQ:5}',
  next_seq        BIGINT NOT NULL DEFAULT 1,
  reset_yearly    BOOLEAN NOT NULL DEFAULT true,
  last_reset_year INT
);

-- ── Phiếu chi phí ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.expenses (
  id                TEXT PRIMARY KEY,               -- exp_xxx (app sinh)
  code              TEXT UNIQUE,                    -- số phiếu theo quy tắc công ty (sinh lúc submit)
  title             TEXT NOT NULL,
  expense_date      DATE,
  category_id       TEXT REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  -- Tiền (mig 258: NUMERIC nguyên tệ + quy đổi VND)
  amount            NUMERIC(18,2) NOT NULL DEFAULT 0,  -- TỔNG CỘNG (sau thuế, NGUYÊN TỆ)
  amount_before_tax NUMERIC(18,2),
  vat_enabled       BOOLEAN NOT NULL DEFAULT false,
  vat_rate          NUMERIC(5,2),
  vat_amount        NUMERIC(18,2),
  currency          TEXT NOT NULL DEFAULT 'VND',
  exchange_rate     NUMERIC(18,6) NOT NULL DEFAULT 1,  -- 1 nguyên tệ = ? VND (mig 258)
  amount_base       BIGINT,                            -- tổng cộng quy đổi VND — hạn mức duyệt/báo cáo (mig 258)
  -- Đa công ty: 1 danh tính người tạo + CÔNG TY CHỊU CHI (11.0)
  company_id        UUID NOT NULL REFERENCES public.companies(id),
  department_id     UUID,
  cost_center       TEXT,
  project_code      TEXT,
  requested_by      UUID NOT NULL,                  -- users.id (UUID) — MỘT danh tính duy nhất
  -- Hoá đơn / Nhà cung cấp
  invoice_number    TEXT,
  invoice_date      DATE,
  supplier_name     TEXT,
  supplier_tax_code TEXT,
  -- Thanh toán
  payee_name          TEXT,
  payment_method      TEXT NOT NULL DEFAULT 'bank_transfer',  -- bank_transfer | cash
  bank_account_name   TEXT,
  bank_account_number TEXT,
  bank_name           TEXT,
  -- Liên kết toàn trình (ticket/asset/contract/task…)
  related_type      TEXT,
  related_id        TEXT,
  -- Tạm ứng → quyết toán (v1.1 — schema chừa sẵn)
  advance_id        TEXT REFERENCES public.expenses(id) ON DELETE SET NULL,  -- phiếu QUYẾT TOÁN trỏ về phiếu tạm ứng
  settlement_status TEXT NOT NULL DEFAULT 'none',   -- none | pending | settled (chỉ có nghĩa với phiếu tạm ứng)
  refund_confirmed_at TIMESTAMPTZ,                  -- công ty xác nhận đã nhận hoàn ứng (mig 258)
  refund_confirmed_by TEXT,
  -- Vòng đời (§2 đặc tả + thu hồi/hủy 11.5)
  status            TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','pending_approval','approved','cancelled',
                                      'sent_to_accounting','posted','paid','rejected')),
  reject_reason     TEXT,
  cancel_reason     TEXT,
  cancelled_by      UUID,
  cancelled_at      TIMESTAMPTZ,
  -- Đồng bộ Kế toán (P2)
  accounting_ref    TEXT,
  external_status   TEXT,
  idempotency_key   TEXT UNIQUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_expenses_company   ON public.expenses(company_id, status);
CREATE INDEX IF NOT EXISTS idx_expenses_requester ON public.expenses(requested_by);
CREATE INDEX IF NOT EXISTS idx_expenses_related   ON public.expenses(related_type, related_id);
CREATE INDEX IF NOT EXISTS idx_expenses_advance   ON public.expenses(advance_id);
-- Cảnh báo nghi trùng (11.5): tra nhanh cùng NCC + số hoá đơn
CREATE INDEX IF NOT EXISTS idx_expenses_dup ON public.expenses(supplier_tax_code, invoice_number);

-- ── Dòng chi tiết (bảng động + công thức, tái dùng pattern Email Center) ────
CREATE TABLE IF NOT EXISTS public.expense_lines (
  id          TEXT PRIMARY KEY,
  expense_id  TEXT NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  noi_dung    TEXT NOT NULL DEFAULT '',
  sl          NUMERIC(12,2) NOT NULL DEFAULT 1,
  dvt         TEXT,
  don_gia     NUMERIC(18,2) NOT NULL DEFAULT 0,
  thanh_tien  NUMERIC(18,2) NOT NULL DEFAULT 0,
  sort_order  INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_expense_lines_expense ON public.expense_lines(expense_id);

-- Mig 258 (DB đã có bảng từ trước): đổi kiểu tiền + thêm cột đa tiền tệ / hoàn ứng
ALTER TABLE public.expenses
  ALTER COLUMN amount TYPE NUMERIC(18,2),
  ALTER COLUMN amount_before_tax TYPE NUMERIC(18,2),
  ALTER COLUMN vat_amount TYPE NUMERIC(18,2);
ALTER TABLE public.expense_lines
  ALTER COLUMN don_gia TYPE NUMERIC(18,2),
  ALTER COLUMN thanh_tien TYPE NUMERIC(18,2);
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS exchange_rate       NUMERIC(18,6) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS amount_base         BIGINT,
  ADD COLUMN IF NOT EXISTS refund_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refund_confirmed_by TEXT;
UPDATE public.expenses SET amount_base = ROUND(amount * exchange_rate) WHERE amount_base IS NULL;

-- ── Chứng từ đính kèm (BYTEA v1; signed-URL ở P2) ────────────────────────────
CREATE TABLE IF NOT EXISTS public.expense_attachments (
  id          TEXT PRIMARY KEY,
  expense_id  TEXT NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  file_name   TEXT NOT NULL,
  mime_type   TEXT NOT NULL DEFAULT 'application/octet-stream',
  size_bytes  BIGINT NOT NULL DEFAULT 0,
  content     BYTEA NOT NULL,
  uploaded_by UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_expense_attachments_expense ON public.expense_attachments(expense_id);

-- ── Thread trao đổi per-expense (immutable; P2 nhận cả tin từ Kế toán) ───────
CREATE TABLE IF NOT EXISTS public.expense_messages (
  id            TEXT PRIMARY KEY,
  expense_id    TEXT NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  source        TEXT NOT NULL DEFAULT 'assetflow',   -- assetflow | accounting
  author_ref    TEXT,                                -- id hệ nguồn (opaque, KHÔNG map user)
  author_name   TEXT NOT NULL,
  body          TEXT NOT NULL,
  attachments   JSONB NOT NULL DEFAULT '[]'::jsonb,
  client_msg_id TEXT,                                -- idempotency chống trùng khi retry
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (expense_id, client_msg_id)
);
CREATE INDEX IF NOT EXISTS idx_expense_messages_expense ON public.expense_messages(expense_id, created_at);

-- ── DUYỆT tầng 1: chuỗi ráp tay per-NGƯỜI-TẠO per-company (Tab "Quyền Chi Phí") ─
CREATE TABLE IF NOT EXISTS public.expense_approval_chains (
  id          TEXT PRIMARY KEY,
  user_id     UUID NOT NULL,                         -- NGƯỜI TẠO đơn
  company_id  UUID REFERENCES public.companies(id) ON DELETE CASCADE,  -- null = mọi công ty
  steps       JSONB NOT NULL DEFAULT '[]'::jsonb,    -- [{order, approver_user_id, label?}]
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- NULL company là distinct trong UNIQUE thường → dùng partial unique index (pattern user_ecard_variants)
CREATE UNIQUE INDEX IF NOT EXISTS uq_eac_global  ON public.expense_approval_chains(user_id) WHERE company_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_eac_company ON public.expense_approval_chains(user_id, company_id) WHERE company_id IS NOT NULL;

-- ── DUYỆT tầng 2: hạn mức thẩm quyền per-NGƯỜI-DUYỆT (Limit of Authority) ────
CREATE TABLE IF NOT EXISTS public.expense_approver_limits (
  id          TEXT PRIMARY KEY,
  user_id     UUID NOT NULL,                         -- NGƯỜI DUYỆT
  company_id  UUID REFERENCES public.companies(id) ON DELETE CASCADE,  -- null = mọi công ty
  max_amount  BIGINT,                                -- null = VÔ HẠN (chốt mọi đơn)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_eal_global  ON public.expense_approver_limits(user_id) WHERE company_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_eal_company ON public.expense_approver_limits(user_id, company_id) WHERE company_id IS NOT NULL;

-- ── DUYỆT tầng fallback: rule hạn mức per-CÔNG-TY (lưới an toàn) ─────────────
CREATE TABLE IF NOT EXISTS public.expense_approval_rules (
  id          TEXT PRIMARY KEY,
  company_id  UUID REFERENCES public.companies(id) ON DELETE CASCADE,  -- null = global
  min_amount  BIGINT NOT NULL DEFAULT 0,
  max_amount  BIGINT,                                -- null = không trần
  steps       JSONB NOT NULL DEFAULT '[]'::jsonb,    -- [{order, approver_type, approver_value, label}]
  active      BOOLEAN NOT NULL DEFAULT true,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Bước duyệt thực tế (đóng băng lúc submit) ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.expense_approvals (
  id                TEXT PRIMARY KEY,
  expense_id        TEXT NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  step_order        INT NOT NULL,
  approver_user_id  UUID NOT NULL,                   -- đã resolve cụ thể
  limit_amount      BIGINT,                          -- hạn mức của người duyệt tại thời điểm submit (đóng băng)
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected','skipped')),
  approved_by       UUID,
  approved_at       TIMESTAMPTZ,
  note              TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (expense_id, step_order)
);
CREATE INDEX IF NOT EXISTS idx_expense_approvals_approver ON public.expense_approvals(approver_user_id, status);

-- ── Assets: liên kết ngược từ dòng chảy mua tài sản (flow_type=asset_purchase) ─
ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS expense_id       TEXT,   -- phiếu chi sinh ra tài sản này
  ADD COLUMN IF NOT EXISTS source_ticket_id TEXT;   -- ticket khởi nguồn (nếu có)
CREATE INDEX IF NOT EXISTS idx_assets_expense ON public.assets(expense_id);

-- ── Seed danh mục mặc định (đổi/tắt được qua UI) ─────────────────────────────
INSERT INTO public.expense_categories (id, code, name, description, flow_type, color, sort_order) VALUES
  ('ecat_asset',   'mua_tai_san', 'Mua tài sản / thiết bị', 'Tự tạo tài sản trạng thái Chờ mua, nhận hàng thì đưa vào sử dụng', 'asset_purchase', '#10b981', 1),
  ('ecat_oper',    'van_hanh',    'Chi phí vận hành',        'Điện nước, thuê mặt bằng, văn phòng phẩm…',                        'operational',    '#6366f1', 2),
  ('ecat_service', 'dich_vu',     'Dịch vụ / thuê ngoài',    'Phần mềm, tư vấn, quảng cáo, vận chuyển…',                          'service',        '#0ea5e9', 3),
  ('ecat_reimb',   'hoan_ung',    'Hoàn ứng nhân viên',      'Nhân viên chi trước, công ty hoàn lại',                             'reimbursement',  '#f59e0b', 4),
  ('ecat_advance', 'tam_ung',     'Tạm ứng',                 'Ứng tiền trước, quyết toán sau (v1.1)',                             'advance',        '#8b5cf6', 5)
ON CONFLICT (code) DO NOTHING;


-- 261: ép cột assets về đúng kiểu nếu legacy là json/jsonb (fix lỗi CẤP PHÁT tài sản)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT column_name, data_type
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'assets'
       AND column_name IN ('assigned_to','assigned_to_name','company_id','department_id','sub_department_id')
       AND data_type IN ('json','jsonb')
  LOOP
    IF r.column_name IN ('assigned_to','assigned_to_name') THEN
      EXECUTE format('ALTER TABLE public.assets ALTER COLUMN %I TYPE TEXT USING (%I #>> ''{}'')', r.column_name, r.column_name);
    ELSE
      EXECUTE format('ALTER TABLE public.assets ALTER COLUMN %I TYPE UUID USING NULLIF(%I #>> ''{}'', '''')::uuid', r.column_name, r.column_name);
    END IF;
  END LOOP;
END $$;


-- 268: trọng số kỳ tháng trong kỳ tổng hợp KPI (NULL = chia đều)
ALTER TABLE public.kpi_cycle_rollups
  ADD COLUMN IF NOT EXISTS weight NUMERIC(6,2);

-- 269: làm giàu tiêu chí KPI (nhóm, Đạt/Không đạt, tổng kết + xếp loại)
ALTER TABLE public.kpi_template_items
  ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE public.kpi_assignment_items
  ADD COLUMN IF NOT EXISTS category         TEXT,
  ADD COLUMN IF NOT EXISTS self_achieved    BOOLEAN,
  ADD COLUMN IF NOT EXISTS manager_achieved BOOLEAN;
ALTER TABLE public.kpi_assignments
  ADD COLUMN IF NOT EXISTS strengths       TEXT,
  ADD COLUMN IF NOT EXISTS improvements    TEXT,
  ADD COLUMN IF NOT EXISTS next_goals      TEXT,
  ADD COLUMN IF NOT EXISTS training_needs  TEXT,
  ADD COLUMN IF NOT EXISTS grade           TEXT;

-- 270: template email "nhiều tài khoản" (rows accounts + loop {{#accounts}} {{@index}})
INSERT INTO email_templates (id, category, key, name, description, subject_tpl, body_html_tpl, schema, engine, is_system)
VALUES (
  'et_account_multi', 'account', 'account_multi',
  'Tài Khoản — Cấp nhiều tài khoản (tự đánh số)',
  'Gửi cho 1 nhân sự nhiều tài khoản (AssetFlow, Email, ERP…); thêm/bớt tài khoản tùy ý, email tự đánh số 1.2.3.',
  'Thông tin tài khoản đăng nhập của bạn',
  '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#111;"><h2 style="color:#1e40af;text-align:center;margin:0 0 16px;">THÔNG TIN TÀI KHOẢN ĐĂNG NHẬP</h2><p>Kính gửi <strong>{{name}}</strong>,</p><p>Phòng Nhân sự gửi thông tin các tài khoản để bạn truy cập các hệ thống nội bộ. Vui lòng bảo mật thông tin và đổi mật khẩu ngay lần đăng nhập đầu tiên.</p>{{#accounts}}<div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:14px 0;"><h3 style="color:#1e40af;margin:0 0 10px;">{{@index}}. {{he_thong}}</h3><table style="width:100%;background:#f5f7f9;border-radius:6px;border-collapse:collapse;"><tr><td style="padding:8px 12px;color:#666;width:110px;">Đường dẫn</td><td style="padding:8px 12px;font-family:monospace;"><a href="{{url}}" style="color:#1e40af;">{{url}}</a></td></tr><tr><td style="padding:8px 12px;color:#666;">Tài khoản</td><td style="padding:8px 12px;font-family:monospace;font-weight:bold;">{{tai_khoan}}</td></tr><tr><td style="padding:8px 12px;color:#666;">Mật khẩu</td><td style="padding:8px 12px;font-family:monospace;font-weight:bold;">{{mat_khau}}</td></tr></table></div>{{/accounts}}<p style="color:#b91c1c;font-size:13px;margin-top:16px;">⚠️ Vui lòng đổi mật khẩu ngay lần đăng nhập đầu tiên và không chia sẻ thông tin này cho người khác.</p><p style="margin-top:16px;">Trân trọng,<br>Phòng Nhân sự</p></div>',
  '[{"key":"name","label":"Tên nhân sự","type":"text","required":true},{"key":"accounts","label":"Danh sách tài khoản","type":"rows","required":true,"columns":[{"key":"he_thong","label":"Hệ thống","type":"text"},{"key":"tai_khoan","label":"Tài khoản","type":"text"},{"key":"mat_khau","label":"Mật khẩu","type":"text"},{"key":"url","label":"URL","type":"text"}],"defaultRows":[{"he_thong":"","tai_khoan":"","mat_khau":"","url":""}]}]'::jsonb,
  'ses', false
) ON CONFLICT (key) DO NOTHING;

-- 271: người YÊU CẦU của yêu cầu tuyển dụng (khác owner_id/created_by)
ALTER TABLE requisitions
  ADD COLUMN IF NOT EXISTS requested_by TEXT;
UPDATE requisitions SET requested_by = created_by WHERE requested_by IS NULL AND created_by IS NOT NULL;

-- 272: bộ phận (sub_department) cho yêu cầu tuyển dụng
ALTER TABLE requisitions
  ADD COLUMN IF NOT EXISTS sub_department_id TEXT;

-- 273: thời gian hết hạn biểu mẫu (NULL = không giới hạn)
ALTER TABLE form_templates
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- 274: template Nội Bộ "Nội dung tự do" (poster/thông báo thuần)
INSERT INTO email_templates (id, category, key, name, description, subject_tpl, body_html_tpl, schema, engine, is_system)
VALUES (
  'et_internal_content', 'internal', 'internal_content',
  'Nội Bộ — Nội dung tự do (poster/thông báo)',
  'Gửi nội dung thuần hoặc poster (đính kèm ảnh) cho nội bộ — không cần điền trường cấu trúc.',
  'Thông báo nội bộ',
  '<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#111;line-height:1.6;white-space:pre-wrap;">{{noi_dung}}</div>',
  '[{"key":"noi_dung","label":"Nội dung","type":"textarea","required":false}]'::jsonb,
  'ses', false
) ON CONFLICT (key) DO NOTHING;

-- 277: nhiều ảnh (album) cho tin Telegram nội bộ
ALTER TABLE internal_tg_broadcasts
  ADD COLUMN IF NOT EXISTS image_urls JSONB;

-- 289: sender mặc định cho template tuyển dụng cũ (hr_email_templates).
-- Trung Tâm Email gộp template cũ + mới; template cũ thiếu cột này nên bấm Lưu
-- báo "Không tìm thấy template". Guard IF EXISTS: DB nào chưa có bảng thì bỏ qua.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'hr_email_templates') THEN
    ALTER TABLE hr_email_templates ADD COLUMN IF NOT EXISTS default_sender_id TEXT;
  END IF;
END $$;

-- 293: ủy quyền duyệt phép vượt cây sơ đồ (leave_approver_delegations).
CREATE TABLE IF NOT EXISTS leave_approver_delegations (
  id                TEXT PRIMARY KEY,
  approver_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id        UUID REFERENCES companies(id) ON DELETE CASCADE,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  note              TEXT,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_leave_deleg_not_self CHECK (approver_user_id <> target_user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_leave_deleg_pair
  ON leave_approver_delegations (approver_user_id, target_user_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_leave_deleg_target
  ON leave_approver_delegations (target_user_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_leave_deleg_approver
  ON leave_approver_delegations (approver_user_id) WHERE is_active;

-- 294: chấm công kho nhiều đợt/ngày + sản lượng theo đợt (guard: chỉ chạy khi có bảng kho).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'warehouses') THEN
    ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS attendance_mode TEXT NOT NULL DEFAULT 'shift';
    ALTER TABLE warehouse_attendance DROP CONSTRAINT IF EXISTS warehouse_attendance_worker_id_work_date_key;
    ALTER TABLE warehouse_attendance
      ADD COLUMN IF NOT EXISTS session_no        INTEGER NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS declared_checkout BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS declared_status   TEXT;
    CREATE INDEX IF NOT EXISTS idx_wh_att_worker_date ON warehouse_attendance(worker_id, work_date);
    ALTER TABLE warehouse_output DROP CONSTRAINT IF EXISTS warehouse_output_worker_id_product_id_work_date_key;
    ALTER TABLE warehouse_output
      ADD COLUMN IF NOT EXISTS attendance_id TEXT REFERENCES warehouse_attendance(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manager',
      ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved';
    CREATE UNIQUE INDEX IF NOT EXISTS uq_wh_output_scope
      ON warehouse_output (worker_id, product_id, work_date, COALESCE(attendance_id, ''));
    CREATE INDEX IF NOT EXISTS idx_wh_output_attendance
      ON warehouse_output(attendance_id) WHERE attendance_id IS NOT NULL;
  END IF;
END $$;

-- 295: sản xuất & tồn kho kho/xưởng (items, sổ kho giá vốn, BOM, lô SX, đợt xuất quét mã).
-- Bản đầy đủ ở migrations/295_warehouse_production.sql — đây là guard idempotent cho DB
-- đã init trước migration này (bảng tạo bằng IF NOT EXISTS nên chạy lại vô hại).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'warehouses') THEN
    ALTER TABLE warehouse_supply_moves ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(18, 2);
  END IF;
END $$;

-- 297: lưu trữ thẻ đánh giá (archived_at). Chỉ thêm cột nullable — idempotent.
ALTER TABLE evaluations
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by UUID;
CREATE INDEX IF NOT EXISTS idx_evaluations_archived
  ON evaluations(archived_at) WHERE archived_at IS NULL;

-- 298: cấu trúc tổ chức nhiều tầng (org_units) + tầng cấu hình + cấp bậc chức vụ cấu hình.
-- GIAI ĐOẠN 1 chỉ-thêm, backfill 1:1 từ Cty/Phòng/Bộ phận. Idempotent. Bản đầy đủ ở
-- migrations/298_org_units_hierarchy.sql.
ALTER TABLE departments ADD COLUMN IF NOT EXISTS parent_department_id UUID;

CREATE TABLE IF NOT EXISTS org_unit_levels (
  id TEXT PRIMARY KEY, company_id UUID, rank INT NOT NULL, name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO org_unit_levels (id, company_id, rank, name) VALUES
  ('oul_g1', NULL, 1, 'Công ty'), ('oul_g2', NULL, 2, 'Phòng ban'), ('oul_g3', NULL, 3, 'Bộ phận')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS org_units (
  id TEXT PRIMARY KEY, company_id UUID NOT NULL, parent_id TEXT, level_rank INT NOT NULL DEFAULT 1,
  name TEXT NOT NULL, code TEXT, manager_id UUID, display_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true, legacy_kind TEXT, legacy_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_org_units_company ON org_units(company_id);
CREATE INDEX IF NOT EXISTS idx_org_units_parent  ON org_units(parent_id);
CREATE INDEX IF NOT EXISTS idx_org_units_legacy  ON org_units(legacy_kind, legacy_id);

ALTER TABLE users ADD COLUMN IF NOT EXISTS org_unit_id TEXT;

-- Backfill BỌC GUARD: lỗi schema drift chỉ cảnh báo, KHÔNG sập boot.
DO $$ BEGIN
  INSERT INTO org_units (id, company_id, parent_id, level_rank, name, code, manager_id, is_active, legacy_kind, legacy_id)
  SELECT 'ou_c_'||c.id, c.id, NULL, 1, c.name, c.code, NULL, COALESCE(c.is_active, true), 'company', c.id
    FROM companies c ON CONFLICT (id) DO NOTHING;
EXCEPTION WHEN OTHERS THEN RAISE WARNING '[298] backfill companies bỏ qua: %', SQLERRM; END $$;
DO $$ BEGIN
  INSERT INTO org_units (id, company_id, parent_id, level_rank, name, code, manager_id, is_active, legacy_kind, legacy_id)
  SELECT 'ou_d_'||d.id, d.company_id,
         COALESCE('ou_d_'||d.parent_department_id::text, 'ou_c_'||d.company_id::text),
         2, d.name, d.code, d.manager_id, COALESCE(d.is_active, true), 'department', d.id
    FROM departments d ON CONFLICT (id) DO NOTHING;
EXCEPTION WHEN OTHERS THEN RAISE WARNING '[298] backfill departments bỏ qua: %', SQLERRM; END $$;
DO $$ BEGIN
  INSERT INTO org_units (id, company_id, parent_id, level_rank, name, code, manager_id, is_active, legacy_kind, legacy_id)
  SELECT 'ou_s_'||s.id, d.company_id, 'ou_d_'||s.department_id::text, 3, s.name, s.code, s.manager_id,
         COALESCE(s.is_active, true), 'sub', s.id
    FROM sub_departments s JOIN departments d ON d.id = s.department_id ON CONFLICT (id) DO NOTHING;
EXCEPTION WHEN OTHERS THEN RAISE WARNING '[298] backfill sub_departments bỏ qua: %', SQLERRM; END $$;
DO $$ BEGIN
  UPDATE users SET org_unit_id = CASE
      WHEN sub_department_id IS NOT NULL THEN 'ou_s_'||sub_department_id::text
      WHEN department_id     IS NOT NULL THEN 'ou_d_'||department_id::text
      WHEN company_id        IS NOT NULL THEN 'ou_c_'||company_id::text
      ELSE NULL END
    WHERE org_unit_id IS NULL;
EXCEPTION WHEN OTHERS THEN RAISE WARNING '[298] backfill users.org_unit_id bỏ qua: %', SQLERRM; END $$;

CREATE TABLE IF NOT EXISTS position_ranks (
  id TEXT PRIMARY KEY, company_id UUID, rank INT NOT NULL, label TEXT NOT NULL, description TEXT,
  color TEXT, is_active BOOLEAN NOT NULL DEFAULT true, display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO position_ranks (id, company_id, rank, label, description, color, display_order) VALUES
  ('prk_g1', NULL, 1, 'Ban lãnh đạo',      'Giám đốc, Phó GĐ, Cố vấn...', 'indigo', 1),
  ('prk_g2', NULL, 2, 'Quản lý cấp phòng', 'Trưởng/Phó phòng',            'sky',    2),
  ('prk_g3', NULL, 3, 'Quản lý bộ phận',   'Trưởng/Phó bộ phận',          'amber',  3),
  ('prk_g4', NULL, 4, 'Nhân viên',         NULL,                          'muted',  4),
  ('prk_g5', NULL, 5, 'Thực tập sinh',     NULL,                          'muted',  5)
ON CONFLICT (id) DO NOTHING;

-- 299: tầng TRÊN công ty — Nhóm/Tập đoàn/HĐQT (company_groups). Thuần gom/hiển thị, không
-- chi phối vận hành. Chỉ-thêm, idempotent. Bản đầy đủ ở migrations/299_company_groups.sql.
CREATE TABLE IF NOT EXISTS company_groups (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, parent_id TEXT, description TEXT,
  display_order INT NOT NULL DEFAULT 0, is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_company_groups_parent ON company_groups(parent_id);
ALTER TABLE companies ADD COLUMN IF NOT EXISTS group_id TEXT;

-- 300: cờ "Hiện ở Nhân sự cấp công ty" cho cấp bậc; seed rank 1–3. Chỉ-thêm, idempotent.
ALTER TABLE position_ranks ADD COLUMN IF NOT EXISTS show_in_company BOOLEAN NOT NULL DEFAULT false;
UPDATE position_ranks SET show_in_company = true
  WHERE company_id IS NULL AND rank IN (1, 2, 3) AND show_in_company = false;

-- 301: logic điều kiện hiển thị trường biểu mẫu. Chỉ-thêm, idempotent.
ALTER TABLE onboarding_form_fields ADD COLUMN IF NOT EXISTS visible_if JSONB;
-- 308/309 (sso): cột đồng bộ SSO trên users + password cho phép NULL — Chỉ SSO, user thường
-- không giữ hash local nữa (super_admin vẫn giữ hash để break-glass). Cột password NOT NULL
-- từ migration 001. Chỉ-thêm, idempotent. Bản đầy đủ ở migrations/308_add_sso_columns_to_users.sql,
-- migrations/309_users_password_nullable.sql.
ALTER TABLE users
  ALTER COLUMN password DROP NOT NULL;

-- 306: "Mặc Định Đủ Công" cho vị trí không phải điểm danh. Chỉ-thêm, idempotent.
-- Bản đầy đủ ở migrations/306_default_full_attendance.sql.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS default_full_attendance      BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_full_attendance_from DATE;
UPDATE users SET default_full_attendance_from = CURRENT_DATE
  WHERE default_full_attendance = true AND default_full_attendance_from IS NULL;

-- 307: trích trừ BHXH chuyển từ SỐ TIỀN (đ) sang TỶ LỆ % (cho số lẻ, vd 10.5).
-- Chỉ-thêm, idempotent. Bản đầy đủ ở migrations/307_social_insurance_deduction_percent.sql.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS social_insurance_base      BIGINT,
  ADD COLUMN IF NOT EXISTS social_insurance_deduction NUMERIC(12,2);
ALTER TABLE users ALTER COLUMN social_insurance_deduction TYPE NUMERIC(12,2);
UPDATE users SET social_insurance_deduction =
       ROUND((social_insurance_deduction / social_insurance_base * 100)::numeric, 2)
 WHERE social_insurance_deduction > 100 AND COALESCE(social_insurance_base, 0) > 0;
UPDATE users SET social_insurance_deduction = NULL
 WHERE social_insurance_deduction > 100 AND COALESCE(social_insurance_base, 0) = 0;
