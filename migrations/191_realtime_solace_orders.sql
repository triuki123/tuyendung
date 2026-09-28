-- Migration 191: bật realtime (LISTEN/NOTIFY) cho solace_orders
-- Để màn Hàng đợi POS nhận đơn mới / đổi trạng thái TỨC THÌ (thay vì poll).
--
-- TỰ CHỨA: hàm notify_table_change() gốc nằm ở add-realtime-triggers.sql (KHÔNG đánh số
-- → KHÔNG được run-migrations.js chạy). Nên tạo lại hàm ở đây (CREATE OR REPLACE) để
-- migration chạy được trên MỌI DB kể cả nơi chưa từng áp realtime triggers. Idempotent.

CREATE OR REPLACE FUNCTION notify_table_change()
RETURNS TRIGGER AS $$
DECLARE
  payload JSONB;
  entity_id TEXT;
  change_type TEXT;
  changed_data JSONB;
BEGIN
  change_type := TG_OP;
  IF TG_OP = 'DELETE' THEN
    entity_id := OLD.id::TEXT;
    changed_data := row_to_json(OLD)::JSONB;
  ELSE
    entity_id := NEW.id::TEXT;
    changed_data := row_to_json(NEW)::JSONB;
  END IF;
  payload := jsonb_build_object(
    'type', LOWER(change_type),
    'entity', TG_TABLE_NAME,
    'entityId', entity_id,
    'data', changed_data,
    'timestamp', EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
  );
  PERFORM pg_notify('entity_changed', payload::TEXT);
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_solace_orders_notify ON solace_orders;
CREATE TRIGGER tr_solace_orders_notify
AFTER INSERT OR UPDATE OR DELETE ON solace_orders
FOR EACH ROW EXECUTE FUNCTION notify_table_change();
