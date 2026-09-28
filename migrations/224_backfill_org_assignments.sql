-- Migration 224: backfill org_assignments từ dữ liệu hiện có. Idempotent
-- (chỉ chèn khi user chưa có phân công chính active ở công ty đó).
--
-- 1) Công ty CHÍNH: từ users (mỗi user active có company hợp lệ → 1 phân công primary).
--    org_role suy MỘT LẦN từ dữ liệu head hiện có (sau này chỉnh qua UI, không suy nữa):
--    - head của sub_department mình thuộc → 'head'
--    - head của department mình thuộc     → 'head'
--    - head của company (companies.head_id là TEXT) → 'head'
--    - còn lại → 'member'
INSERT INTO org_assignments
  (id, user_id, company_id, department_id, sub_department_id, job_title_id,
   org_role, manager_id, is_primary, is_active, note)
SELECT
  'bf1-' || u.id::text || '-' || u.company_id::text,
  u.id, u.company_id, u.department_id, u.sub_department_id, u.job_title_id,
  CASE
    WHEN sd.head_id = u.id THEN 'head'
    WHEN d.head_id  = u.id THEN 'head'
    WHEN c.head_id  = u.id::text THEN 'head'
    ELSE 'member'
  END,
  u.manager_id,
  true, true, 'backfill migration 224 (users)'
FROM users u
JOIN companies c ON c.id = u.company_id
LEFT JOIN departments d      ON d.id  = u.department_id
LEFT JOIN sub_departments sd ON sd.id = u.sub_department_id
WHERE u.status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM org_assignments oa
    WHERE oa.user_id = u.id AND oa.company_id = u.company_id
      AND oa.is_primary AND oa.is_active
  );

-- 2) Công ty PHỤ: từ user_company_memberships (mỗi membership active → 1 phân công
--    primary tại công ty phụ đó — trước nay mỗi user chỉ có 1 vai trò/công ty phụ).
INSERT INTO org_assignments
  (id, user_id, company_id, department_id, sub_department_id, job_title_id,
   org_role, manager_id, is_primary, is_active, note)
SELECT
  'bf2-' || m.user_id::text || '-' || m.company_id::text,
  m.user_id, m.company_id, m.department_id, m.sub_department_id, m.job_title_id,
  CASE
    WHEN sd.head_id = m.user_id THEN 'head'
    WHEN d.head_id  = m.user_id THEN 'head'
    WHEN c.head_id  = m.user_id::text THEN 'head'
    ELSE 'member'
  END,
  m.manager_id,
  true, true, 'backfill migration 224 (memberships)'
FROM user_company_memberships m
JOIN users u ON u.id = m.user_id AND u.status = 'active'
JOIN companies c ON c.id = m.company_id
LEFT JOIN departments d      ON d.id  = m.department_id
LEFT JOIN sub_departments sd ON sd.id = m.sub_department_id
WHERE m.is_active
  AND NOT EXISTS (
    SELECT 1 FROM org_assignments oa
    WHERE oa.user_id = m.user_id AND oa.company_id = m.company_id
      AND oa.is_primary AND oa.is_active
  );
