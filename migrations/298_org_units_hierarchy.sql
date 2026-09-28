-- Migration 298: Cấu trúc tổ chức NHIỀU TẦNG tuỳ ý + cấp bậc chức vụ cấu hình được.
-- GIAI ĐOẠN 1 — CHỈ THÊM, không phá. Cây org_units mirror 1:1 hiện trạng (Cty/Phòng/Bộ phận);
-- vận hành cũ giữ nguyên trên các cột legacy. Idempotent (chạy lại vô hại).
--
-- AN TOÀN BOOT: mọi câu BACKFILL (đụng bảng companies/departments/sub_departments/users) được
-- bọc DO...EXCEPTION → nếu schema prod lệch (thiếu cột) thì chỉ RAISE WARNING, KHÔNG làm hỏng
-- migration/khởi động app. DDL tạo bảng để trần (IF NOT EXISTS, gần như không thể lỗi).

-- ── DDL an toàn ──────────────────────────────────────────────────────────────
ALTER TABLE departments ADD COLUMN IF NOT EXISTS parent_department_id UUID;
ALTER TABLE users       ADD COLUMN IF NOT EXISTS org_unit_id TEXT;

CREATE TABLE IF NOT EXISTS org_unit_levels (
  id          TEXT PRIMARY KEY,
  company_id  UUID,
  rank        INT  NOT NULL,
  name        TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS org_units (
  id            TEXT PRIMARY KEY,
  company_id    UUID NOT NULL,
  parent_id     TEXT,
  level_rank    INT  NOT NULL DEFAULT 1,
  name          TEXT NOT NULL,
  code          TEXT,
  manager_id    UUID,
  display_order INT  NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  legacy_kind   TEXT,
  legacy_id     UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_org_units_company ON org_units(company_id);
CREATE INDEX IF NOT EXISTS idx_org_units_parent  ON org_units(parent_id);
CREATE INDEX IF NOT EXISTS idx_org_units_legacy  ON org_units(legacy_kind, legacy_id);

CREATE TABLE IF NOT EXISTS position_ranks (
  id            TEXT PRIMARY KEY,
  company_id    UUID,
  rank          INT  NOT NULL,
  label         TEXT NOT NULL,
  description   TEXT,
  color         TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  display_order INT  NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Seed cấu hình (chỉ đụng bảng MỚI → an toàn) ─────────────────────────────────
INSERT INTO org_unit_levels (id, company_id, rank, name) VALUES
  ('oul_g1', NULL, 1, 'Công ty'), ('oul_g2', NULL, 2, 'Phòng ban'), ('oul_g3', NULL, 3, 'Bộ phận')
ON CONFLICT (id) DO NOTHING;

INSERT INTO position_ranks (id, company_id, rank, label, description, color, display_order) VALUES
  ('prk_g1', NULL, 1, 'Ban lãnh đạo',      'Giám đốc, Phó GĐ, Cố vấn...', 'indigo', 1),
  ('prk_g2', NULL, 2, 'Quản lý cấp phòng', 'Trưởng/Phó phòng',            'sky',    2),
  ('prk_g3', NULL, 3, 'Quản lý bộ phận',   'Trưởng/Phó bộ phận',          'amber',  3),
  ('prk_g4', NULL, 4, 'Nhân viên',         NULL,                          'muted',  4),
  ('prk_g5', NULL, 5, 'Thực tập sinh',     NULL,                          'muted',  5)
ON CONFLICT (id) DO NOTHING;

-- ── Backfill (đụng bảng cũ → BỌC GUARD, lỗi chỉ cảnh báo, không sập boot) ────────
DO $$ BEGIN
  INSERT INTO org_units (id, company_id, parent_id, level_rank, name, code, manager_id, is_active, legacy_kind, legacy_id)
  SELECT 'ou_c_'||c.id, c.id, NULL, 1, c.name, c.code, NULL, COALESCE(c.is_active, true), 'company', c.id
    FROM companies c
  ON CONFLICT (id) DO NOTHING;
EXCEPTION WHEN OTHERS THEN RAISE WARNING '[298] backfill companies bỏ qua: %', SQLERRM; END $$;

DO $$ BEGIN
  INSERT INTO org_units (id, company_id, parent_id, level_rank, name, code, manager_id, is_active, legacy_kind, legacy_id)
  SELECT 'ou_d_'||d.id, d.company_id,
         COALESCE('ou_d_'||d.parent_department_id::text, 'ou_c_'||d.company_id::text),
         2, d.name, d.code, d.manager_id, COALESCE(d.is_active, true), 'department', d.id
    FROM departments d
  ON CONFLICT (id) DO NOTHING;
EXCEPTION WHEN OTHERS THEN RAISE WARNING '[298] backfill departments bỏ qua: %', SQLERRM; END $$;

DO $$ BEGIN
  INSERT INTO org_units (id, company_id, parent_id, level_rank, name, code, manager_id, is_active, legacy_kind, legacy_id)
  SELECT 'ou_s_'||s.id, d.company_id, 'ou_d_'||s.department_id::text, 3, s.name, s.code, s.manager_id,
         COALESCE(s.is_active, true), 'sub', s.id
    FROM sub_departments s JOIN departments d ON d.id = s.department_id
  ON CONFLICT (id) DO NOTHING;
EXCEPTION WHEN OTHERS THEN RAISE WARNING '[298] backfill sub_departments bỏ qua: %', SQLERRM; END $$;

DO $$ BEGIN
  UPDATE users SET org_unit_id = CASE
      WHEN sub_department_id IS NOT NULL THEN 'ou_s_'||sub_department_id::text
      WHEN department_id     IS NOT NULL THEN 'ou_d_'||department_id::text
      WHEN company_id        IS NOT NULL THEN 'ou_c_'||company_id::text
      ELSE NULL END
    WHERE org_unit_id IS NULL;
EXCEPTION WHEN OTHERS THEN RAISE WARNING '[298] backfill users.org_unit_id bỏ qua: %', SQLERRM; END $$;
