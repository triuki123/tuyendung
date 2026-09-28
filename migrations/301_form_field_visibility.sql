-- Migration 301: Logic điều kiện hiển thị trường biểu mẫu (kiểu Tally.so).
-- visible_if: { mode: 'all'|'any', conditions: [{ field, op, value }] }. NULL = luôn hiện.
-- op ∈ equals|not_equals|includes|not_empty|empty. Chỉ-thêm, idempotent.
ALTER TABLE onboarding_form_fields ADD COLUMN IF NOT EXISTS visible_if JSONB;
