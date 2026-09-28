CREATE TABLE IF NOT EXISTS ticket_watchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  watch_type TEXT DEFAULT 'all' CHECK (watch_type IN ('all', 'comments', 'status')),
  muted BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT ticket_watchers_unique UNIQUE(ticket_id, user_id)
);

CREATE INDEX idx_ticket_watchers_ticket_id ON ticket_watchers(ticket_id);
CREATE INDEX idx_ticket_watchers_user_id ON ticket_watchers(user_id);
CREATE INDEX idx_ticket_watchers_unmuted ON ticket_watchers(ticket_id) WHERE muted = false;
