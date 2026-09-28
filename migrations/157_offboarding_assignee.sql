-- Migration 157: thêm assignee_id (người phụ trách) vào checklist offboarding
ALTER TABLE offboarding_checklist_templates
  ADD COLUMN IF NOT EXISTS assignee_id UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE offboarding_checklist_items
  ADD COLUMN IF NOT EXISTS assignee_id UUID REFERENCES users(id) ON DELETE SET NULL;
