-- Migration: 043_add_world_standard_task_form_schema.sql
-- Purpose: Add world-standard task form schema with projects, milestones, dependencies, and multi-assignee support
-- Created: 2026-06-01

-- ============================================================================
-- NEW TABLES
-- ============================================================================

-- Projects table: Container for related tasks
CREATE TABLE IF NOT EXISTS public.projects (
  id TEXT PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  owner_id TEXT REFERENCES public.users(id) ON DELETE SET NULL,
  start_date DATE,
  end_date DATE,
  budget_amount DECIMAL(14,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived', 'cancelled')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_company_project_name UNIQUE(company_id, name)
);

-- Milestones table: Project-specific milestones
CREATE TABLE IF NOT EXISTS public.milestones (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  target_date DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Task dependencies table: Blocks/blocked_by relationships
CREATE TABLE IF NOT EXISTS public.task_dependencies (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  depends_on_task_id TEXT NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  dependency_type VARCHAR(20) DEFAULT 'blocks' CHECK (dependency_type IN ('blocks', 'blocked_by', 'related')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_task_dependency UNIQUE(task_id, depends_on_task_id),
  CONSTRAINT no_self_dependency CHECK (task_id != depends_on_task_id)
);

-- Task assignees table: Additional assignees beyond primary assigned_to
CREATE TABLE IF NOT EXISTS public.task_assignees (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role VARCHAR(20) DEFAULT 'assignee' CHECK (role IN ('assignee', 'reviewer', 'approver')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_task_assignee UNIQUE(task_id, user_id)
);

-- ============================================================================
-- EXTEND EXISTING TASKS TABLE
-- ============================================================================

ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS task_type VARCHAR(20) DEFAULT 'Task' CHECK (task_type IN ('Task', 'Subtask', 'Milestone', 'Issue'));
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS complexity VARCHAR(20) DEFAULT 'Medium' CHECK (complexity IN ('Low', 'Medium', 'High', 'Critical'));
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS parent_task_id TEXT REFERENCES public.tasks(id) ON DELETE SET NULL;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS project_id TEXT REFERENCES public.projects(id) ON DELETE SET NULL;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS milestone_id TEXT REFERENCES public.milestones(id) ON DELETE SET NULL;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS budget_amount DECIMAL(14,2) DEFAULT 0;

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Projects indexes
CREATE INDEX IF NOT EXISTS idx_projects_company_id
  ON public.projects(company_id);

CREATE INDEX IF NOT EXISTS idx_projects_owner_id
  ON public.projects(owner_id);

CREATE INDEX IF NOT EXISTS idx_projects_status
  ON public.projects(status);

CREATE INDEX IF NOT EXISTS idx_projects_created_at
  ON public.projects(created_at DESC);

-- Milestones indexes
CREATE INDEX IF NOT EXISTS idx_milestones_project_id
  ON public.milestones(project_id);

CREATE INDEX IF NOT EXISTS idx_milestones_target_date
  ON public.milestones(target_date);

CREATE INDEX IF NOT EXISTS idx_milestones_status
  ON public.milestones(status);

-- Task dependencies indexes
CREATE INDEX IF NOT EXISTS idx_task_dependencies_task_id
  ON public.task_dependencies(task_id);

CREATE INDEX IF NOT EXISTS idx_task_dependencies_depends_on_task_id
  ON public.task_dependencies(depends_on_task_id);

CREATE INDEX IF NOT EXISTS idx_task_dependencies_dependency_type
  ON public.task_dependencies(dependency_type);

-- Task assignees indexes
CREATE INDEX IF NOT EXISTS idx_task_assignees_task_id
  ON public.task_assignees(task_id);

CREATE INDEX IF NOT EXISTS idx_task_assignees_user_id
  ON public.task_assignees(user_id);

CREATE INDEX IF NOT EXISTS idx_task_assignees_role
  ON public.task_assignees(role);

-- Extended tasks table indexes
CREATE INDEX IF NOT EXISTS idx_tasks_task_type
  ON public.tasks(task_type);

CREATE INDEX IF NOT EXISTS idx_tasks_complexity
  ON public.tasks(complexity);

CREATE INDEX IF NOT EXISTS idx_tasks_parent_task_id
  ON public.tasks(parent_task_id);

CREATE INDEX IF NOT EXISTS idx_tasks_project_id
  ON public.tasks(project_id);

CREATE INDEX IF NOT EXISTS idx_tasks_milestone_id
  ON public.tasks(milestone_id);

CREATE INDEX IF NOT EXISTS idx_tasks_start_date
  ON public.tasks(start_date DESC);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_projects_company_status
  ON public.projects(company_id, status);

CREATE INDEX IF NOT EXISTS idx_milestones_project_status
  ON public.milestones(project_id, status);

CREATE INDEX IF NOT EXISTS idx_tasks_project_status
  ON public.tasks(project_id, status)
  WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_parent_status
  ON public.tasks(parent_task_id, status)
  WHERE parent_task_id IS NOT NULL;
