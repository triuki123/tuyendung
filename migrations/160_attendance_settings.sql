-- Migration 160: cấu hình chấm công theo công ty + hiệu lực theo ngày
-- company_id NULL = cấu hình mặc định toàn hệ thống (fallback khi công ty chưa có riêng).
-- Mỗi (company_id, effective_from) là 1 phiên bản; tra cứu lấy phiên bản mới nhất <= ngày cần tính.
CREATE TABLE IF NOT EXISTS attendance_settings (
  id              TEXT PRIMARY KEY,
  company_id      UUID REFERENCES companies(id) ON DELETE CASCADE,
  effective_from  DATE NOT NULL,
  config          JSONB NOT NULL,
  note            TEXT,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- company_id NULL không bị UNIQUE bắt buộc → dùng 2 unique index riêng cho 2 trường hợp.
CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_settings_company
  ON attendance_settings (company_id, effective_from) WHERE company_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_attendance_settings_default
  ON attendance_settings (effective_from) WHERE company_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_attendance_settings_lookup
  ON attendance_settings (company_id, effective_from DESC);
