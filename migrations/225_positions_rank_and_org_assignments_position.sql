-- Migration 225: chốt bảng positions là CHỨC DANH canonical của cơ cấu tổ chức.
-- Khảo sát dữ liệu thật: 65/66 user active dùng users.position_id (bảng positions, 63 chức danh
-- thật: Giám Đốc, Chủ Tịch HĐQT, Cố Vấn HĐQT...), trong khi job_titles chỉ có 5 dòng seed.
-- → rank (cấp bậc) đặt trên positions; org_assignments tham chiếu positions.
-- job_titles giữ nguyên làm legacy (taskPermissionService cũ còn đọc, sẽ gỡ ở Phase 6).
--
-- ⚠️ TỰ THÍCH ỨNG cho prod: bảng positions trên DB prod KHÔNG có PRIMARY KEY
-- (lỗi 42830 khi ADD COLUMN ... REFERENCES làm sập deploy 2026-07-03). Vì vậy:
--   - thêm cột KHÔNG inline REFERENCES,
--   - cố gắng bổ sung PK cho positions (bọc EXCEPTION — trùng id thì bỏ qua),
--   - chỉ ADD CONSTRAINT FK khi positions đã có unique/PK trên id.

-- 1) Cấp bậc trên positions: 1=Ban lãnh đạo, 2=Trưởng phòng, 3=Trưởng bộ phận, 4=Nhân viên, 5=Thực tập
ALTER TABLE positions
  ADD COLUMN IF NOT EXISTS "rank" INT DEFAULT 4;
CREATE INDEX IF NOT EXISTS idx_positions_rank ON positions("rank");

-- 2) Đảm bảo positions.id có PK/unique (prod thiếu)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
     WHERE t.relname = 'positions' AND c.contype IN ('p', 'u')
       AND (
         SELECT array_agg(a.attname ORDER BY a.attnum)
           FROM pg_attribute a
          WHERE a.attrelid = t.oid AND a.attnum = ANY (c.conkey)
       ) = ARRAY['id']::name[]
  ) THEN
    BEGIN
      ALTER TABLE positions ADD CONSTRAINT positions_pkey PRIMARY KEY (id);
      RAISE NOTICE 'positions: đã bổ sung PRIMARY KEY (id)';
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'positions: không thêm được PK (%) — bỏ qua, FK sẽ không được tạo', SQLERRM;
    END;
  END IF;
END $$;

-- 3) org_assignments trỏ chức danh thật (KHÔNG inline REFERENCES — xem chú thích trên)
ALTER TABLE org_assignments
  ADD COLUMN IF NOT EXISTS position_id UUID;
CREATE INDEX IF NOT EXISTS idx_org_assign_position ON org_assignments(position_id) WHERE is_active;

-- 4) Thêm FK riêng, CHỈ khi positions có unique/PK trên id và FK chưa tồn tại
DO $$
BEGIN
  IF EXISTS (
       SELECT 1 FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
        WHERE t.relname = 'positions' AND c.contype IN ('p', 'u')
     )
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint WHERE conname = 'org_assignments_position_id_fkey'
     ) THEN
    BEGIN
      ALTER TABLE org_assignments
        ADD CONSTRAINT org_assignments_position_id_fkey
        FOREIGN KEY (position_id) REFERENCES positions(id) ON DELETE SET NULL;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'org_assignments: không thêm được FK position_id (%) — bỏ qua', SQLERRM;
    END;
  END IF;
END $$;

-- 5) Backfill position_id cho các phân công đã có (idempotent — chỉ điền chỗ trống)
UPDATE org_assignments oa
   SET position_id = u.position_id
  FROM users u
 WHERE oa.user_id = u.id
   AND oa.position_id IS NULL
   AND u.position_id IS NOT NULL
   AND oa.company_id = u.company_id;

UPDATE org_assignments oa
   SET position_id = m.position_id
  FROM user_company_memberships m
 WHERE oa.user_id = m.user_id
   AND oa.company_id = m.company_id
   AND oa.position_id IS NULL
   AND m.position_id IS NOT NULL;
