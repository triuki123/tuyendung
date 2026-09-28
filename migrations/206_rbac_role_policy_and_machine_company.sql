BEGIN;

-- Attendance machines were historically global. Attach them to a company so
-- delegated machine administrators cannot inspect another company's devices.
ALTER TABLE public.attendance_machines
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_machines_company
  ON public.attendance_machines(company_id);

-- Infer a machine's company only when all currently mapped employees resolve
-- to exactly one valid company. Ambiguous/unmapped machines remain NULL and
-- therefore stay visible to Super Admin only.
WITH inferred AS (
  SELECT m.machine_id, MIN(c.id::text)::uuid AS company_id
    FROM public.attendance_machine_mappings m
    JOIN public.users u ON u.id::text = m.user_id::text
    JOIN public.companies c ON c.id::text = u.company_id::text
   WHERE m.effective_to IS NULL
   GROUP BY m.machine_id
  HAVING COUNT(DISTINCT c.id) = 1
)
UPDATE public.attendance_machines am
   SET company_id = inferred.company_id
  FROM inferred
 WHERE am.id = inferred.machine_id
   AND am.company_id IS NULL;

-- Role templates are deliberately conservative. Admin receives employee
-- self-service capabilities only; operational modules must be granted
-- explicitly. Manager additionally receives team workflow capabilities.
INSERT INTO public.role_permission_templates (role, module_permissions, updated_at)
VALUES
  (
    'user',
    '{
      "tickets":["view","create","edit"],
      "tasks":["view","edit"],
      "room-bookings":["view","create","edit","delete"],
      "cham-cong":["view","create","edit"],
      "cham-cong-checkin":["view","create"],
      "cham-cong-lookup":["view"],
      "tra-cuu":["view"],
      "tra-cuu-dau-moi":["view"],
      "tra-cuu-tai-san":["view"],
      "tra-cuu-van-ban":["view"],
      "tra-cuu-thong-bao":["view"],
      "tra-cuu-lich-su":["view"],
      "my-hr":["view","create"],
      "email-signature":["view","edit"],
      "solace":["view"],
      "settings":["view","edit"]
    }'::jsonb,
    NOW()
  ),
  (
    'admin',
    '{
      "tickets":["view","create","edit"],
      "tasks":["view","edit"],
      "room-bookings":["view","create","edit","delete"],
      "cham-cong":["view","create","edit"],
      "cham-cong-checkin":["view","create"],
      "cham-cong-lookup":["view"],
      "tra-cuu":["view"],
      "tra-cuu-dau-moi":["view"],
      "tra-cuu-tai-san":["view"],
      "tra-cuu-van-ban":["view"],
      "tra-cuu-thong-bao":["view"],
      "tra-cuu-lich-su":["view"],
      "my-hr":["view","create"],
      "email-signature":["view","edit"],
      "solace":["view"],
      "settings":["view","edit"]
    }'::jsonb,
    NOW()
  ),
  (
    'manager',
    '{
      "dashboard":["view"],
      "tickets":["view","create","edit"],
      "tasks":["view","create","edit"],
      "room-bookings":["view","create","edit","delete"],
      "duyet-yeu-cau":["view","approve"],
      "recruitment-order":["view","create","edit","delete","notify"],
      "cham-cong":["view","create","edit","approve"],
      "cham-cong-checkin":["view","create"],
      "cham-cong-lookup":["view"],
      "tra-cuu":["view"],
      "tra-cuu-dau-moi":["view"],
      "tra-cuu-tai-san":["view"],
      "tra-cuu-van-ban":["view"],
      "tra-cuu-thong-bao":["view"],
      "tra-cuu-lich-su":["view"],
      "my-hr":["view","create"],
      "email-signature":["view","edit"],
      "solace":["view"],
      "settings":["view","edit"]
    }'::jsonb,
    NOW()
  )
ON CONFLICT (role) DO UPDATE
  SET module_permissions = EXCLUDED.module_permissions,
      updated_at = NOW();

COMMIT;
