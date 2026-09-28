-- Seed job titles for testing and assign to users
-- This ensures test users have job titles to display in dropdowns

-- First, get the default company ID (assuming there's one for testing)
WITH company AS (
  SELECT id FROM public.companies LIMIT 1
),
job_titles_to_insert AS (
  INSERT INTO public.job_titles (company_id, title, description, is_active)
  SELECT
    c.id,
    t.title,
    t.description,
    true
  FROM company c
  CROSS JOIN (
    VALUES
      ('Kỹ Sư Hệ Thống', 'Quản lý hạ tầng IT'),
      ('Nhân Viên Hỗ Trợ', 'Hỗ trợ kỹ thuật cho người dùng'),
      ('Trưởng Phòng', 'Quản lý phòng ban'),
      ('Quản Lý Dự Án', 'Quản lý và điều phối dự án'),
      ('Nhân Viên Kỹ Thuật', 'Thực hiện công việc kỹ thuật')
  ) AS t(title, description)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.job_titles jt
    WHERE jt.company_id = c.id AND jt.title = t.title
  )
  RETURNING id, title
)
-- Assign job titles to specific users based on their names
UPDATE public.users u
SET job_title_id = (
  SELECT jt.id FROM public.job_titles jt
  CROSS JOIN company c
  WHERE jt.company_id = c.id
  AND (
    (u.name = 'Trần Minh Trí' AND jt.title = 'Kỹ Sư Hệ Thống') OR
    (u.name = 'Trà Phương Nam' AND jt.title = 'Quản Lý Dự Án') OR
    (u.name = 'Hồ Mai Thy' AND jt.title = 'Trưởng Phòng')
  )
)
WHERE u.name IN ('Trần Minh Trí', 'Trà Phương Nam', 'Hồ Mai Thy')
AND u.job_title_id IS NULL;
