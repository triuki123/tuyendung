-- Migration 281: cờ bật/tắt tính năng Ứng Lương per-kho (mặc định TẮT, chờ chỉ đạo)
ALTER TABLE warehouses
  ADD COLUMN IF NOT EXISTS advance_enabled BOOLEAN NOT NULL DEFAULT FALSE;
