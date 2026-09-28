-- Migration: Add Time Tracking Feature
-- Description: Create task_time_entries table to track time spent on tasks and subtasks
-- Purpose: Enable billable hours tracking, effort estimation, and resource management

-- Create task_time_entries table
CREATE TABLE IF NOT EXISTS task_time_entries (
  id TEXT PRIMARY KEY,
  task_id VARCHAR(255) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  subtask_id TEXT REFERENCES task_subtasks(id) ON DELETE SET NULL,
  user_id VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
  user_name VARCHAR(255),
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  date_worked DATE NOT NULL,
  description VARCHAR(255),
  is_billable BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP NULL
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_time_entries_task_id ON task_time_entries(task_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_task_subtask ON task_time_entries(task_id, subtask_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_user_id ON task_time_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_user_date ON task_time_entries(user_id, date_worked DESC);
CREATE INDEX IF NOT EXISTS idx_time_entries_billable ON task_time_entries(is_billable) WHERE is_billable = true;
CREATE INDEX IF NOT EXISTS idx_time_entries_created_at ON task_time_entries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_time_entries_not_deleted ON task_time_entries(task_id) WHERE deleted_at IS NULL;

-- Add follower count column to tasks for tracking visibility
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS follower_count INTEGER DEFAULT 0;

-- Create index for tasks queries with follower count
CREATE INDEX IF NOT EXISTS idx_tasks_follower_count ON tasks(follower_count DESC) WHERE archived_at IS NULL;

-- Log successful migration
SELECT 'Time tracking feature created successfully' AS migration_status;
