-- Migration 316: Giai đoạn 2 workflow Social Design — phiên bản thiết kế +
-- feedback theo yêu cầu. File lưu qua bảng media dùng chung (MinIO), bảng
-- này chỉ giữ tham chiếu media_id — không lưu BYTEA (bảng mới, không có dữ
-- liệu cũ cần fallback).
CREATE TABLE IF NOT EXISTS design_request_versions (
  id TEXT PRIMARY KEY DEFAULT ('drv_' || replace(gen_random_uuid()::text, '-', '')),
  design_request_id TEXT NOT NULL REFERENCES design_requests(id) ON DELETE CASCADE,
  version_no INTEGER NOT NULL,
  media_id TEXT REFERENCES media(id) ON DELETE SET NULL,
  file_name TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  uploaded_by TEXT,
  uploaded_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT design_request_versions_status CHECK (status IN ('pending','approved'))
);
CREATE INDEX IF NOT EXISTS idx_design_request_versions_req ON design_request_versions(design_request_id, version_no DESC);

CREATE TABLE IF NOT EXISTS design_request_feedback (
  id TEXT PRIMARY KEY DEFAULT ('drf_' || replace(gen_random_uuid()::text, '-', '')),
  design_request_id TEXT NOT NULL REFERENCES design_requests(id) ON DELETE CASCADE,
  version_id TEXT REFERENCES design_request_versions(id) ON DELETE SET NULL,
  author_id TEXT,
  author_name TEXT,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT design_request_feedback_status CHECK (status IN ('open','resolved'))
);
CREATE INDEX IF NOT EXISTS idx_design_request_feedback_req ON design_request_feedback(design_request_id, created_at);
