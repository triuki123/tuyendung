-- =============================================================================
-- Migration: 035_add_permissions_support_to_tasks.sql
-- Purpose: Add organizational context and hierarchy support for Tasks module
--          to implement Odoo-style permission system based on:
--          1. Direct manager relationship (manager_id)
--          2. Job title rank/level (1=Director, 2=Manager, 3=Lead, 4=Employee)
--          3. Organizational scope (company/department/sub_department)
-- =============================================================================

-- ============================================================================
-- PART 1: Add rank/level to job_titles table
-- Defines hierarchy level for permission calculation
-- ============================================================================
ALTER TABLE public.job_titles
ADD COLUMN IF NOT EXISTS rank INT DEFAULT 4;

COMMENT ON COLUMN public.job_titles.rank IS
  'Hierarchical rank for permission system. Lower number = higher rank.
   1 = Director/CEO (can assign to anyone in company)
   2 = Manager (can assign to anyone in department)
   3 = Team Lead (can assign to anyone in sub_department)
   4 = Employee/User (can only self-assign or be assigned by manager)
   5 = Intern (lowest level)';

-- Create index for rank lookups
CREATE INDEX IF NOT EXISTS idx_job_titles_rank ON public.job_titles(rank);

-- ============================================================================
-- PART 2: Add department_id to users table
-- Links user directly to their department (in addition to sub_department_id)
-- ============================================================================
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.users.department_id IS
  'Reference to the department this user belongs to.
   Complements sub_department_id for organizational hierarchy.
   Used with manager_id for permission scope calculation.';

CREATE INDEX IF NOT EXISTS idx_users_department_id ON public.users(department_id);

-- ============================================================================
-- PART 3: Add organizational context to tasks table
-- Tracks which company/department/sub_department owns each task
-- Essential for permission filtering (can only see/edit tasks in your org unit)
-- ============================================================================
ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS sub_department_id UUID REFERENCES public.sub_departments(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.tasks.company_id IS
  'Company that owns this task. Used for Director-level permission scope.
   Set when task is created or assigned to someone in a specific company.';

COMMENT ON COLUMN public.tasks.department_id IS
  'Department that owns this task. Used for Manager-level permission scope.
   Set when task is created or assigned to someone in a specific department.';

COMMENT ON COLUMN public.tasks.sub_department_id IS
  'Sub-department that owns this task. Used for Team-Lead-level permission scope.
   Set when task is created or assigned to someone in a specific sub_department.';

-- ============================================================================
-- PART 4: Create indexes for performance
-- These indexes speed up permission filtering queries
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_tasks_company_id
  ON public.tasks(company_id) WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_department_id
  ON public.tasks(department_id) WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_sub_department_id
  ON public.tasks(sub_department_id) WHERE archived_at IS NULL;

-- Combined index for typical permission queries
CREATE INDEX IF NOT EXISTS idx_tasks_org_context
  ON public.tasks(company_id, department_id, sub_department_id, status)
  WHERE archived_at IS NULL;

-- ============================================================================
-- PART 5: Seed rank values into existing job_titles
-- Automatically assign rank based on job title name patterns
-- ============================================================================

-- Director/CEO level
UPDATE public.job_titles
SET rank = 1
WHERE LOWER(title) IN (
  'giám đốc', 'director', 'ceo', 'chủ tịch', 'phó chủ tịch',
  'giám đốc điều hành', 'executive director'
)
AND rank IS NULL OR rank = 4;

-- Manager level
UPDATE public.job_titles
SET rank = 2
WHERE LOWER(title) IN (
  'quản lý', 'manager', 'trưởng phòng', 'phó trưởng phòng',
  'senior manager', 'trưởng ban'
)
AND rank IS NULL OR rank = 4;

-- Team Lead level
UPDATE public.job_titles
SET rank = 3
WHERE LOWER(title) IN (
  'trưởng bộ phận', 'team lead', 'lead', 'phó trưởng bộ phận',
  'supervisor', 'trưởng tổ'
)
AND rank IS NULL OR rank = 4;

-- Keep remaining as Employee (rank 4) - default is already 4

-- ============================================================================
-- PART 6: Backfill tasks with organizational context
-- For existing tasks, derive org context from assigned_to user
-- ============================================================================

-- Update tasks with org context from assigned_to user
UPDATE public.tasks t
SET
  company_id = u.company_id::UUID,
  department_id = u.department_id,
  sub_department_id = u.sub_department_id
FROM public.users u
WHERE t.assigned_to = u.id
  AND t.company_id IS NULL
  AND u.company_id IS NOT NULL;

-- Update tasks with org context from created_by user (if no assigned_to)
UPDATE public.tasks t
SET
  company_id = u.company_id::UUID,
  department_id = u.department_id,
  sub_department_id = u.sub_department_id
FROM public.users u
WHERE t.created_by = u.id
  AND t.company_id IS NULL
  AND u.company_id IS NOT NULL;

-- ============================================================================
-- PART 7: Verification
-- Check that migration ran successfully
-- ============================================================================

-- Verify rank column exists and has values
SELECT
  COUNT(*) as job_titles_with_rank,
  MIN(rank) as min_rank,
  MAX(rank) as max_rank
FROM public.job_titles
WHERE rank IS NOT NULL;

-- Verify tasks have org context
SELECT
  COUNT(*) as total_tasks,
  COUNT(CASE WHEN company_id IS NOT NULL THEN 1 END) as tasks_with_company,
  COUNT(CASE WHEN department_id IS NOT NULL THEN 1 END) as tasks_with_department,
  COUNT(CASE WHEN sub_department_id IS NOT NULL THEN 1 END) as tasks_with_subdept
FROM public.tasks;

-- Verify users have department_id
SELECT
  COUNT(*) as total_users,
  COUNT(CASE WHEN department_id IS NOT NULL THEN 1 END) as users_with_department,
  COUNT(CASE WHEN manager_id IS NOT NULL THEN 1 END) as users_with_manager
FROM public.users
WHERE status = 'active';
