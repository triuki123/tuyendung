-- Thêm trường lý do từ chối và reassign cho tickets
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS rejected_by TEXT,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP WITH TIME ZONE;

-- Mở rộng CHECK constraint để chấp nhận status mới
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_status_check;
ALTER TABLE tickets ADD CONSTRAINT tickets_status_check
  CHECK (status = ANY (ARRAY[
    'open'::text, 'in_progress'::text, 'resolved'::text, 'closed'::text,
    'submitted'::text, 'completed'::text, 'rejected'::text, 'pending'::text
  ]));
