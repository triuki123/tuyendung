-- Migration: Add Task Followers Feature
-- Description: Create task_followers table to enable users to follow tasks and receive notifications
-- Purpose: Increase task visibility and enable real-time collaboration notifications

-- Create task_followers table (many-to-many relationship)
CREATE TABLE IF NOT EXISTS task_followers (
  task_id VARCHAR(255) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (task_id, user_id)
);

-- Create index for efficient follower queries
CREATE INDEX IF NOT EXISTS idx_task_followers_user_id ON task_followers(user_id);
CREATE INDEX IF NOT EXISTS idx_task_followers_created_at ON task_followers(created_at DESC);

-- Log successful migration
SELECT 'Task followers feature created successfully' AS migration_status;
