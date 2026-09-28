CREATE TABLE IF NOT EXISTS ticket_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_name TEXT,
  old_value JSONB,
  new_value JSONB,
  related_entity_id UUID,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ticket_audit_events_ticket_id_created ON ticket_audit_events(ticket_id, created_at DESC);
CREATE INDEX idx_ticket_audit_events_event_type ON ticket_audit_events(event_type);
CREATE INDEX idx_ticket_audit_events_actor_id ON ticket_audit_events(actor_id);
