-- Migration: Add Ticket Comments Feature
-- Description: Create ticket_comments table for ticket discussion
-- Purpose: Enable inline ticket collaboration and @mention notifications

-- Create ticket_comments table
CREATE TABLE IF NOT EXISTS ticket_comments (
  id TEXT PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  user_name VARCHAR(255),
  user_avatar TEXT,
  content TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE,
  deleted_at TIMESTAMP WITH TIME ZONE NULL
);

-- PostgreSQL-style column comments
COMMENT ON COLUMN ticket_comments.is_internal IS 'Only visible to assignee, creator, and managers';
COMMENT ON COLUMN ticket_comments.deleted_at IS 'Soft delete for audit trail';

-- Create indexes for comment queries
CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket_id ON ticket_comments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket_created ON ticket_comments(ticket_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ticket_comments_user_id ON ticket_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_ticket_comments_created_at ON ticket_comments(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ticket_comments_not_deleted ON ticket_comments(ticket_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ticket_comments_internal ON ticket_comments(is_internal) WHERE is_internal = true;

-- Create ticket_comment_mentions table (for @mentions)
CREATE TABLE IF NOT EXISTS ticket_comment_mentions (
  comment_id TEXT NOT NULL REFERENCES ticket_comments(id) ON DELETE CASCADE,
  mentioned_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (comment_id, mentioned_user_id)
);

-- Create index for mention queries
CREATE INDEX IF NOT EXISTS idx_ticket_comment_mentions_user ON ticket_comment_mentions(mentioned_user_id);
CREATE INDEX IF NOT EXISTS idx_ticket_comment_mentions_comment ON ticket_comment_mentions(comment_id);

-- Log successful migration
SELECT 'Ticket comments feature created successfully' AS migration_status;
