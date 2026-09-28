-- Migration: Add Real-Time Notification Triggers
-- Purpose: Automatically notify clients of data changes via PostgreSQL LISTEN/NOTIFY
-- Created: 2026-05-28

-- ============================================================================
-- FUNCTION: notify_table_change
-- ============================================================================
-- This function is called by triggers to send NOTIFY events when data changes
CREATE OR REPLACE FUNCTION notify_table_change()
RETURNS TRIGGER AS $$
DECLARE
  payload JSONB;
  entity_id TEXT;
  change_type TEXT;
  changed_data JSONB;
BEGIN
  -- Determine the operation type
  change_type := TG_OP;

  -- Get the entity ID (assumes all tables have 'id' column)
  IF TG_OP = 'DELETE' THEN
    entity_id := OLD.id::TEXT;
    changed_data := row_to_json(OLD)::JSONB;
  ELSE
    entity_id := NEW.id::TEXT;
    changed_data := row_to_json(NEW)::JSONB;
  END IF;

  -- Build the notification payload
  payload := jsonb_build_object(
    'type', LOWER(change_type),
    'entity', TG_TABLE_NAME,
    'entityId', entity_id,
    'data', changed_data,
    'timestamp', EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
  );

  -- Send the notification
  PERFORM pg_notify(
    'entity_changed',
    payload::TEXT
  );

  -- Return the appropriate row
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGERS FOR MAJOR TABLES
-- ============================================================================

-- Users table
DROP TRIGGER IF EXISTS tr_users_notify ON users;
CREATE TRIGGER tr_users_notify
AFTER INSERT OR UPDATE OR DELETE ON users
FOR EACH ROW EXECUTE FUNCTION notify_table_change();

-- Assets table
DROP TRIGGER IF EXISTS tr_assets_notify ON assets;
CREATE TRIGGER tr_assets_notify
AFTER INSERT OR UPDATE OR DELETE ON assets
FOR EACH ROW EXECUTE FUNCTION notify_table_change();

-- Tickets table
DROP TRIGGER IF EXISTS tr_tickets_notify ON tickets;
CREATE TRIGGER tr_tickets_notify
AFTER INSERT OR UPDATE OR DELETE ON tickets
FOR EACH ROW EXECUTE FUNCTION notify_table_change();

-- Tasks table
DROP TRIGGER IF EXISTS tr_tasks_notify ON tasks;
CREATE TRIGGER tr_tasks_notify
AFTER INSERT OR UPDATE OR DELETE ON tasks
FOR EACH ROW EXECUTE FUNCTION notify_table_change();

-- Rooms table
DROP TRIGGER IF EXISTS tr_rooms_notify ON rooms;
CREATE TRIGGER tr_rooms_notify
AFTER INSERT OR UPDATE OR DELETE ON rooms
FOR EACH ROW EXECUTE FUNCTION notify_table_change();

-- Room Bookings table
DROP TRIGGER IF EXISTS tr_room_bookings_notify ON room_bookings;
CREATE TRIGGER tr_room_bookings_notify
AFTER INSERT OR UPDATE OR DELETE ON room_bookings
FOR EACH ROW EXECUTE FUNCTION notify_table_change();

-- Organizations/Companies table
DROP TRIGGER IF EXISTS tr_companies_notify ON companies;
CREATE TRIGGER tr_companies_notify
AFTER INSERT OR UPDATE OR DELETE ON companies
FOR EACH ROW EXECUTE FUNCTION notify_table_change();

-- Departments table
DROP TRIGGER IF EXISTS tr_departments_notify ON departments;
CREATE TRIGGER tr_departments_notify
AFTER INSERT OR UPDATE OR DELETE ON departments
FOR EACH ROW EXECUTE FUNCTION notify_table_change();

-- Sub Departments table
DROP TRIGGER IF EXISTS tr_sub_departments_notify ON sub_departments;
CREATE TRIGGER tr_sub_departments_notify
AFTER INSERT OR UPDATE OR DELETE ON sub_departments
FOR EACH ROW EXECUTE FUNCTION notify_table_change();

-- Asset Categories table
DROP TRIGGER IF EXISTS tr_asset_categories_notify ON asset_categories;
CREATE TRIGGER tr_asset_categories_notify
AFTER INSERT OR UPDATE OR DELETE ON asset_categories
FOR EACH ROW EXECUTE FUNCTION notify_table_change();


-- Software table (if exists)
DROP TRIGGER IF EXISTS tr_software_notify ON software;
CREATE TRIGGER tr_software_notify
AFTER INSERT OR UPDATE OR DELETE ON software
FOR EACH ROW EXECUTE FUNCTION notify_table_change();

-- Positions table
DROP TRIGGER IF EXISTS tr_positions_notify ON positions;
CREATE TRIGGER tr_positions_notify
AFTER INSERT OR UPDATE OR DELETE ON positions
FOR EACH ROW EXECUTE FUNCTION notify_table_change();

-- Job Titles table (if exists)
DROP TRIGGER IF EXISTS tr_job_titles_notify ON job_titles;
CREATE TRIGGER tr_job_titles_notify
AFTER INSERT OR UPDATE OR DELETE ON job_titles
FOR EACH ROW EXECUTE FUNCTION notify_table_change();

-- Tags table (if exists)
DROP TRIGGER IF EXISTS tr_tags_notify ON tags;
CREATE TRIGGER tr_tags_notify
AFTER INSERT OR UPDATE OR DELETE ON tags
FOR EACH ROW EXECUTE FUNCTION notify_table_change();

-- Domains table (if exists)
DROP TRIGGER IF EXISTS tr_domains_notify ON domains;
CREATE TRIGGER tr_domains_notify
AFTER INSERT OR UPDATE OR DELETE ON domains
FOR EACH ROW EXECUTE FUNCTION notify_table_change();

-- Email Accounts table (if exists)
DROP TRIGGER IF EXISTS tr_email_accounts_notify ON email_accounts;
CREATE TRIGGER tr_email_accounts_notify
AFTER INSERT OR UPDATE OR DELETE ON email_accounts
FOR EACH ROW EXECUTE FUNCTION notify_table_change();

-- Notifications table
DROP TRIGGER IF EXISTS tr_notifications_notify ON notifications;
CREATE TRIGGER tr_notifications_notify
AFTER INSERT OR UPDATE OR DELETE ON notifications
FOR EACH ROW EXECUTE FUNCTION notify_table_change();

-- Admin Audit Logs table
DROP TRIGGER IF EXISTS tr_admin_audit_logs_notify ON admin_audit_logs;
CREATE TRIGGER tr_admin_audit_logs_notify
AFTER INSERT OR UPDATE OR DELETE ON admin_audit_logs
FOR EACH ROW EXECUTE FUNCTION notify_table_change();

-- Delete Requests table
DROP TRIGGER IF EXISTS tr_delete_requests_notify ON delete_requests;
CREATE TRIGGER tr_delete_requests_notify
AFTER INSERT OR UPDATE OR DELETE ON delete_requests
FOR EACH ROW EXECUTE FUNCTION notify_table_change();

-- ============================================================================
-- INDEX FOR PERFORMANCE (optional, but recommended)
-- ============================================================================
-- If you have frequent lookups by entity type and ID:
-- CREATE INDEX IF NOT EXISTS idx_entity_changes ON entity_changes(entity, entity_id, created_at DESC);

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================
-- Use these to verify triggers are installed:
-- SELECT trigger_name FROM information_schema.triggers
-- WHERE trigger_schema = 'public' AND trigger_name LIKE 'tr_%_notify'
-- ORDER BY trigger_name;
