-- Migration 120: thêm trạng thái pending_approval vào constraint requisitions_status_check
ALTER TABLE requisitions
  DROP CONSTRAINT IF EXISTS requisitions_status_check;

ALTER TABLE requisitions
  ADD CONSTRAINT requisitions_status_check
    CHECK (status IN (
      'pending_approval',
      'pending',
      'open',
      'on_hold',
      'filled',
      'cancelled',
      'rejected'
    ));
