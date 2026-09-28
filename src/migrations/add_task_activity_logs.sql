-- Migration: Add task activity logs and task code system
-- Purpose: Track task history and auto-generate task codes

-- 1. Add task_code column to tasks table
ALTER TABLE tasks ADD COLUMN task_code VARCHAR(20) UNIQUE;

-- 2. Create task_activities table for logging
CREATE TABLE task_activities (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  task_id VARCHAR(255) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id VARCHAR(255),
  action VARCHAR(50) NOT NULL, -- 'created', 'status_changed', 'archived', 'restored', 'commented', 'assigned'
  old_value TEXT,
  new_value TEXT,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  created_by_user_id VARCHAR(255),
  created_by_user_name VARCHAR(255),

  CONSTRAINT valid_action CHECK (action IN ('created', 'status_changed', 'archived', 'restored', 'commented', 'assigned', 'title_changed', 'description_changed'))
);

-- 3. Create indexes for faster queries
CREATE INDEX idx_task_activities_task_id ON task_activities(task_id);
CREATE INDEX idx_task_activities_created_at ON task_activities(created_at);
CREATE INDEX idx_task_activities_action ON task_activities(action);
CREATE INDEX idx_tasks_task_code ON tasks(task_code);
CREATE INDEX idx_tasks_created_at ON tasks(created_at);

-- 4. Create view for task code counter (helps with auto-increment)
-- This helps find the next sequence number for a given date
CREATE OR REPLACE VIEW task_code_counter AS
SELECT
  DATE(created_at) as task_date,
  COUNT(*) as count_today
FROM tasks
WHERE task_code IS NOT NULL
GROUP BY DATE(created_at);

-- 5. Verify migration
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name='tasks' AND column_name='task_code';

SELECT table_name FROM information_schema.tables
WHERE table_name='task_activities';
