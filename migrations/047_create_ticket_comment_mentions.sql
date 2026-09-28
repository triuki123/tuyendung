CREATE TABLE IF NOT EXISTS ticket_comment_mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID NOT NULL REFERENCES ticket_comments(id) ON DELETE CASCADE,
  mentioned_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT ticket_comment_mentions_unique UNIQUE(comment_id, mentioned_user_id)
);

CREATE INDEX idx_ticket_comment_mentions_mentioned_user_id ON ticket_comment_mentions(mentioned_user_id);
CREATE INDEX idx_ticket_comment_mentions_comment_id ON ticket_comment_mentions(comment_id);
CREATE INDEX idx_ticket_comment_mentions_unread ON ticket_comment_mentions(mentioned_user_id, read_at) WHERE read_at IS NULL;
