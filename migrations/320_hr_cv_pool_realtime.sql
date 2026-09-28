-- Phát sự kiện SSE khi hồ sơ ứng viên được thêm/sửa/xóa.
CREATE OR REPLACE FUNCTION notify_hr_cv_pool_change()
RETURNS TRIGGER AS $$
DECLARE
  row_id TEXT;
BEGIN
  row_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id::TEXT ELSE NEW.id::TEXT END;
  PERFORM pg_notify('entity_changed', json_build_object(
    'type', lower(TG_OP),
    'entity', 'hr_cv_pool',
    'entityId', row_id
  )::TEXT);
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_hr_cv_pool_notify ON hr_cv_pool;
CREATE TRIGGER tr_hr_cv_pool_notify
AFTER INSERT OR UPDATE OR DELETE ON hr_cv_pool
FOR EACH ROW EXECUTE FUNCTION notify_hr_cv_pool_change();

SELECT 'Migration 320: hr_cv_pool realtime ready' AS migration_status;
