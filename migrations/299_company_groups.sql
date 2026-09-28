-- Migration 299: Tầng TRÊN công ty — Nhóm/Tập đoàn/HĐQT (company_groups).
-- Thuần GOM & TRÌNH BÀY: gom các công ty dưới một nhóm (lồng nhau tuỳ ý). KHÔNG chi phối vận
-- hành (chấm công/quyền vẫn theo company_id). Chỉ-thêm, idempotent.

CREATE TABLE IF NOT EXISTS company_groups (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  parent_id     TEXT,                     -- NULL = nhóm gốc; cho phép Tập đoàn → HĐQT → ...
  description   TEXT,
  display_order INT  NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_company_groups_parent ON company_groups(parent_id);

-- Công ty thuộc nhóm nào (NULL = chưa gom → hiện ở "Chưa thuộc nhóm").
ALTER TABLE companies ADD COLUMN IF NOT EXISTS group_id TEXT;
