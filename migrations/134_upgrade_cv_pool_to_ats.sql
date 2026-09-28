-- Migration 134: Nâng cấp Kho Ứng Viên (hr_cv_pool) thành ATS thu nhỏ
-- + nền dữ liệu cho tìm kiếm thông minh & Phase 2 AI/Telegram.
--
-- Chiến lược tìm kiếm: chuẩn hoá không dấu ở TẦNG APP vào cột search_text
-- (không phụ thuộc extension unaccent) + index trigram để ILIKE nhanh.

-- pg_trgm: tăng tốc ILIKE/similarity (contrib chuẩn). Best-effort.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── 1. Mở rộng hr_cv_pool với các trường có cấu trúc ────────────────────────
ALTER TABLE hr_cv_pool
  ADD COLUMN IF NOT EXISTS content_text     TEXT,            -- nội dung CV trích xuất (PDF/DOCX)
  ADD COLUMN IF NOT EXISTS search_text      TEXT,            -- chuẩn hoá không dấu, lowercase (app điền)
  ADD COLUMN IF NOT EXISTS skills           TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS years_experience NUMERIC(4,1),    -- số năm kinh nghiệm
  ADD COLUMN IF NOT EXISTS current_title    TEXT,            -- chức danh / vị trí hiện tại
  ADD COLUMN IF NOT EXISTS education_level  TEXT,
  ADD COLUMN IF NOT EXISTS expected_salary  BIGINT,          -- mức lương mong muốn (VND)
  ADD COLUMN IF NOT EXISTS location         TEXT,            -- nơi ở / khu vực làm việc
  ADD COLUMN IF NOT EXISTS languages        TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS rating           SMALLINT,        -- đánh giá 1..5
  ADD COLUMN IF NOT EXISTS tags             TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS extracted_at     TIMESTAMPTZ;     -- thời điểm trích xuất text

-- rating chỉ 1..5 (thêm constraint nếu chưa có)
DO $$ BEGIN
  ALTER TABLE hr_cv_pool ADD CONSTRAINT chk_hr_cv_rating CHECK (rating IS NULL OR rating BETWEEN 1 AND 5);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Index trigram cho tìm kiếm full-text không dấu + lọc theo skills/tags
CREATE INDEX IF NOT EXISTS idx_hr_cv_pool_search_trgm ON hr_cv_pool USING gin (search_text gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_hr_cv_pool_skills      ON hr_cv_pool USING gin (skills);
CREATE INDEX IF NOT EXISTS idx_hr_cv_pool_tags        ON hr_cv_pool USING gin (tags);
CREATE INDEX IF NOT EXISTS idx_hr_cv_pool_years_exp   ON hr_cv_pool (years_experience) WHERE deleted_at IS NULL;

-- ── 2. Lịch sử chuyển giai đoạn pipeline ────────────────────────────────────
CREATE TABLE IF NOT EXISTS hr_cv_stage_history (
  id          TEXT PRIMARY KEY,
  cv_id       TEXT NOT NULL REFERENCES hr_cv_pool(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status   TEXT NOT NULL,
  note        TEXT,
  changed_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hr_cv_stage_history_cv ON hr_cv_stage_history(cv_id, created_at DESC);

-- ── 3. Liên kết CV ↔ Yêu cầu tuyển dụng (applications) ──────────────────────
CREATE TABLE IF NOT EXISTS hr_applications (
  id             TEXT PRIMARY KEY,
  cv_id          TEXT NOT NULL REFERENCES hr_cv_pool(id) ON DELETE CASCADE,
  requisition_id TEXT NOT NULL REFERENCES requisitions(id) ON DELETE CASCADE,
  status         TEXT,
  note           TEXT,
  created_by     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cv_id, requisition_id)
);
CREATE INDEX IF NOT EXISTS idx_hr_applications_cv  ON hr_applications(cv_id);
CREATE INDEX IF NOT EXISTS idx_hr_applications_req ON hr_applications(requisition_id);

-- ── 4. Ghi chú / đánh giá phỏng vấn ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hr_cv_notes (
  id          TEXT PRIMARY KEY,
  cv_id       TEXT NOT NULL REFERENCES hr_cv_pool(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL DEFAULT 'note',   -- note | interview | evaluation
  rating      SMALLINT,
  body        TEXT,
  author_id   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hr_cv_notes_cv ON hr_cv_notes(cv_id, created_at DESC);

-- Ghi chú: cột embedding vector (pgvector) cho semantic search Phase 2 sẽ thêm
-- bằng migration riêng khi bật extension vector trên server.
