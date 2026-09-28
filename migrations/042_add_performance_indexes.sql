-- Migration: 042_add_performance_indexes.sql
-- Purpose: Add indexes for performance optimization on frequently queried columns
-- Created: 2026-06-01

-- Indexes for task_followers table
CREATE INDEX IF NOT EXISTS idx_task_followers_task_id
  ON task_followers(task_id);

CREATE INDEX IF NOT EXISTS idx_task_followers_user_id
  ON task_followers(user_id);

CREATE INDEX IF NOT EXISTS idx_task_followers_task_user
  ON task_followers(task_id, user_id);

-- Indexes for task_comments table
CREATE INDEX IF NOT EXISTS idx_task_comments_task_id
  ON task_comments(task_id);

CREATE INDEX IF NOT EXISTS idx_task_comments_user_id
  ON task_comments(user_id);

CREATE INDEX IF NOT EXISTS idx_task_comments_created_at
  ON task_comments(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_task_comments_deleted_at
  ON task_comments(deleted_at)
  WHERE deleted_at IS NULL;

-- Indexes for task_comment_mentions table
CREATE INDEX IF NOT EXISTS idx_task_comment_mentions_comment_id
  ON task_comment_mentions(comment_id);

CREATE INDEX IF NOT EXISTS idx_task_comment_mentions_user_id
  ON task_comment_mentions(user_id);

-- Indexes for task_subtasks table
CREATE INDEX IF NOT EXISTS idx_task_subtasks_task_id
  ON task_subtasks(task_id);

CREATE INDEX IF NOT EXISTS idx_task_subtasks_status
  ON task_subtasks(status);

CREATE INDEX IF NOT EXISTS idx_task_subtasks_assigned_to
  ON task_subtasks(assigned_to);

-- Indexes for task_time_entries table
CREATE INDEX IF NOT EXISTS idx_task_time_entries_task_id
  ON task_time_entries(task_id);

CREATE INDEX IF NOT EXISTS idx_task_time_entries_user_id
  ON task_time_entries(user_id);

CREATE INDEX IF NOT EXISTS idx_task_time_entries_date_worked
  ON task_time_entries(date_worked);

CREATE INDEX IF NOT EXISTS idx_task_time_entries_deleted_at
  ON task_time_entries(deleted_at)
  WHERE deleted_at IS NULL;

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_task_comments_task_deleted
  ON task_comments(task_id, deleted_at DESC);

CREATE INDEX IF NOT EXISTS idx_task_time_entries_task_date
  ON task_time_entries(task_id, date_worked DESC);

-- Index for fast follower count checks
CREATE INDEX IF NOT EXISTS idx_task_followers_created_at
  ON task_followers(created_at DESC);
