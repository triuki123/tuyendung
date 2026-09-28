-- Migration: Add Subtasks Feature
-- Description: Create task_subtasks table to support breaking down tasks into smaller steps
-- Purpose: Enable enterprise task management with hierarchical task structure

-- Create task_subtasks table
CREATE TABLE IF NOT EXISTS task_subtasks (
  id TEXT PRIMARY KEY,
  task_id VARCHAR(255) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(20) DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done', 'cancelled')),
  assigned_to VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
  assigned_to_name VARCHAR(255),
  due_date DATE,
  completion_percentage SMALLINT DEFAULT 0 CHECK (completion_percentage >= 0 AND completion_percentage <= 100),
  "order_index" SMALLINT DEFAULT 0,
  created_by VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  archived_at TIMESTAMP NULL,
  CONSTRAINT task_subtasks_order_unique UNIQUE (task_id, "order_index")
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_subtasks_task_id ON task_subtasks(task_id);
CREATE INDEX IF NOT EXISTS idx_subtasks_task_id_status ON task_subtasks(task_id, status);
CREATE INDEX IF NOT EXISTS idx_subtasks_assigned_to ON task_subtasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_subtasks_status ON task_subtasks(status);
CREATE INDEX IF NOT EXISTS idx_subtasks_created_at ON task_subtasks(created_at DESC);

-- Add new columns to tasks table for subtask management
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS estimated_hours DECIMAL(10,2) NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS actual_hours DECIMAL(10,2) DEFAULT 0;

-- Create index for tasks queries with hours
CREATE INDEX IF NOT EXISTS idx_tasks_actual_hours ON tasks(actual_hours DESC) WHERE archived_at IS NULL;

-- Log successful migration
SELECT 'Subtasks feature created successfully' AS migration_status;
