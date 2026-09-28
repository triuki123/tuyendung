-- Migration: Add archived_at column to tasks table
-- Purpose: Support task archiving after completion
-- Run in Supabase SQL Editor

ALTER TABLE tasks ADD COLUMN archived_at TIMESTAMP NULL;

-- Create index for faster archived_at queries
CREATE INDEX tasks_archived_at_idx ON tasks(archived_at) WHERE archived_at IS NOT NULL;

-- Optional: Create index for finding tasks to auto-archive
CREATE INDEX tasks_archived_status_updated_idx ON tasks(status, updated_at) WHERE archived_at IS NULL AND status = 'done';

-- Verify the column was added
SELECT column_name, data_type FROM information_schema.columns WHERE table_name='tasks' ORDER BY ordinal_position;
