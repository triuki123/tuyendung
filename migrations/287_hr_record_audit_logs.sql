-- Migration 287: lịch sử xử lý tác vụ THEO TỪNG BẢN GHI cho module Quản Lý Hồ Sơ
-- (Hợp đồng / Đánh giá / Hồ sơ nhân sự).
--
-- Vì sao KHÔNG dùng audit_logs sẵn có: bảng đó gắn chặt với Tài Sản — cột asset_id là UUID,
-- trong khi contracts.id / evaluations.id / hr_documents.id đều là TEXT ('ctr_…','eval_…','hrd_…')
-- nên không thể lưu vào. Bảng này generic theo (entity_type, entity_id).
CREATE TABLE IF NOT EXISTS hr_record_audit_logs (
  id           TEXT PRIMARY KEY,
  entity_type  TEXT NOT NULL CHECK (entity_type IN ('contract', 'evaluation', 'hr_document')),
  entity_id    TEXT NOT NULL,
  action       TEXT NOT NULL,   -- create|update|delete|conclude|renew|attach|detach|replace_approve|replace_reject
  details      TEXT,            -- câu mô tả tiếng Việt, hiển thị thẳng lên UI
  changes      JSONB,           -- diff: { field: { label, from, to } } — "đổi gì → thành gì"
  performed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hr_audit_entity
  ON hr_record_audit_logs(entity_type, entity_id, created_at DESC);
