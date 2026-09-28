-- Migration 212: Trạng thái tuyển dụng theo TỪNG VỊ TRÍ (per-application)
-- Dời quyết định Loại/Offer/... từ cấp CV (hr_cv_pool.status) xuống cấp liên kết
-- (hr_applications = cv × requisition). Một CV có thể "Loại" ở vị trí này nhưng
-- vẫn ứng tuyển vị trí/công ty khác.

-- ── 1. Mở rộng hr_applications ──────────────────────────────────────────────
ALTER TABLE hr_applications
  ADD COLUMN IF NOT EXISTS decided_by    TEXT,          -- người ra quyết định gần nhất
  ADD COLUMN IF NOT EXISTS decided_at    TIMESTAMPTZ,   -- thời điểm quyết định gần nhất
  ADD COLUMN IF NOT EXISTS reject_reason TEXT,          -- lý do loại (chỉ cho vị trí này)
  ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Backfill: liên kết cũ chưa có trạng thái → coi như đang Sàng lọc cho vị trí đó.
UPDATE hr_applications SET status = 'screening' WHERE status IS NULL OR status = '';

-- Giá trị hợp lệ (khớp 7 giai đoạn của candidateShared: new/screening/interviewed/
-- offered/hired/rejected/pool). Idempotent.
DO $$ BEGIN
  ALTER TABLE hr_applications ADD CONSTRAINT chk_hr_app_status
    CHECK (status IN ('new','screening','interviewed','offered','hired','rejected','pool'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 2. Lịch sử chuyển trạng thái theo vị trí ────────────────────────────────
-- Gộp theo cv_id (qua application) → "Ai loại hồ sơ cho vị trí nào, ngày nào".
CREATE TABLE IF NOT EXISTS hr_application_history (
  id             TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES hr_applications(id) ON DELETE CASCADE,
  cv_id          TEXT NOT NULL,          -- denormalize để gộp lịch sử theo CV nhanh
  requisition_id TEXT NOT NULL,
  from_status    TEXT,
  to_status      TEXT NOT NULL,
  actor_role     TEXT,                    -- requester | recruiter
  note           TEXT,
  changed_by     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hr_app_history_app ON hr_application_history(application_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hr_app_history_cv  ON hr_application_history(cv_id, created_at DESC);
