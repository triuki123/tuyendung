-- Migration 200: phân vai trò người gắn vào hợp đồng
-- role = 'watcher' (theo dõi, mặc định cũ) | 'co_handler' (Người Đồng Phụ Trách)
-- Người Đồng Phụ Trách dùng để escalate lên quản lý khi HĐ chưa ký quá số lần nhắc.
ALTER TABLE public.contract_watchers
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'watcher';
