ALTER TABLE ticket_attachments ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE ticket_attachments ADD COLUMN IF NOT EXISTS is_internal BOOLEAN DEFAULT false;
ALTER TABLE ticket_attachments ADD COLUMN IF NOT EXISTS file_type TEXT;
ALTER TABLE ticket_attachments ADD COLUMN IF NOT EXISTS download_count INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_ticket_attachments_created_at ON ticket_attachments(created_at DESC);
