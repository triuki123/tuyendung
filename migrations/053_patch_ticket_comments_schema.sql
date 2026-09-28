-- Migration: Patch ticket_comments schema
-- Description: Add missing user_avatar column (idempotent)
-- Needed because table may have been created without this column

ALTER TABLE ticket_comments ADD COLUMN IF NOT EXISTS user_avatar TEXT;

SELECT 'Ticket comments schema patch applied' AS migration_status;
