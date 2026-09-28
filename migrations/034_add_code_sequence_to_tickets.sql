-- Add code_number column for auto-increment ticket codes
-- This prevents race condition in generateTicketCode()

-- Create sequence for ticket codes
CREATE SEQUENCE IF NOT EXISTS ticket_code_seq START WITH 1;

-- Add code_number column if it doesn't exist
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS code_number BIGINT UNIQUE;

-- Update existing tickets with sequential numbers from sequence
UPDATE tickets SET code_number = nextval('ticket_code_seq')
WHERE code_number IS NULL;

-- Set sequence to start after the highest existing code_number
SELECT setval('ticket_code_seq', COALESCE(MAX(code_number), 0) + 1) FROM tickets;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_tickets_code_number ON tickets(code_number);

-- Add comment for clarity
COMMENT ON COLUMN tickets.code_number IS 'Auto-increment counter for generating unique ticket codes (TK-YYYY-NNNN)';
