-- Migration 286: Dashboard tuỳ biến per-user — cột lưu cấu hình widget
-- NULL = dùng bố cục mặc định theo role. Shape: {"hidden": string[], "order": string[]}
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS dashboard_layout JSONB;
