-- Migration: Add Task Comments & Mentions Feature
-- Description: Create task_comments and task_comment_mentions tables for task discussion
-- Purpose: Enable inline task collaboration, discussions, and @mention notifications

-- Create task_comments table
CREATE TABLE IF NOT EXISTS task_comments (
  id TEXT PRIMARY KEY,
  task_id VARCHAR(255) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id VARCHAR(255) REFERENCES users(id) ON DELETE SET NULL,
  user_name VARCHAR(255),
  user_avatar TEXT,
  content TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT false COMMENT 'Only visible to assignee, creator, and managers',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP,
  deleted_at TIMESTAMP NULL COMMENT 'Soft delete for audit trail'
);

-- Create indexes for comment queries
CREATE INDEX IF NOT EXISTS idx_comments_task_id ON task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_comments_task_created ON task_comments(task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON task_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_created_at ON task_comments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_not_deleted ON task_comments(task_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_comments_internal ON task_comments(is_internal) WHERE is_internal = true;

-- Create task_comment_mentions table (for @mentions)
CREATE TABLE IF NOT EXISTS task_comment_mentions (
  comment_id TEXT NOT NULL REFERENCES task_comments(id) ON DELETE CASCADE,
  mentioned_user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (comment_id, mentioned_user_id)
);

-- Create index for mention queries
CREATE INDEX IF NOT EXISTS idx_comment_mentions_user ON task_comment_mentions(mentioned_user_id);
CREATE INDEX IF NOT EXISTS idx_comment_mentions_comment ON task_comment_mentions(comment_id);

-- Log successful migration
SELECT 'Task comments and mentions feature created successfully' AS migration_status;
