-- Migration 110: Hệ thống Nghỉ Phép (leave management)
-- 4 bảng: leave_types (danh mục loại phép), leave_requests (đơn nghỉ),
-- leave_transactions (sổ quỹ phép năm dạng ledger), leave_accrual_policies (chính sách cộng phép).
-- Ngày lễ dùng bảng public_holidays có sẵn. Tuần làm việc: T2–T7 (chỉ bỏ Chủ Nhật).

-- ── 1. Danh mục loại phép ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_types (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  code            TEXT UNIQUE NOT NULL,
  name            TEXT NOT NULL,
  description     TEXT,
  -- Ai chi trả: company = công ty trả lương, insurance = BHXH, unpaid = không lương
  paid_by         TEXT NOT NULL DEFAULT 'company' CHECK (paid_by IN ('company','insurance','unpaid')),
  -- true = trừ vào quỹ phép năm (chỉ loại Phép năm)
  deducts_balance BOOLEAN NOT NULL DEFAULT false,
  -- Giới hạn số ngày theo luật (NULL = không giới hạn)
  max_days        NUMERIC(5,2),
  max_days_scope  TEXT NOT NULL DEFAULT 'per_year' CHECK (max_days_scope IN ('per_year','per_occurrence')),
  allow_hourly    BOOLEAN NOT NULL DEFAULT true,
  color           TEXT NOT NULL DEFAULT '#6366f1',
  -- Loại theo luật lao động: không xóa được, chỉ được tắt
  is_system       BOOLEAN NOT NULL DEFAULT false,
  active          BOOLEAN NOT NULL DEFAULT true,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── 2. Đơn nghỉ phép ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_requests (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id         TEXT NOT NULL,
  leave_type_id   TEXT NOT NULL REFERENCES leave_types(id),
  -- day = nghỉ theo ngày (start_date..end_date), hour = nghỉ theo giờ trong 1 ngày
  mode            TEXT NOT NULL DEFAULT 'day' CHECK (mode IN ('day','hour')),
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  start_time      TEXT,             -- HH:MM, chỉ dùng khi mode='hour'
  end_time        TEXT,             -- HH:MM, chỉ dùng khi mode='hour'
  -- Số ngày công bị trừ đã quy đổi (hour: giờ/8, day: số ngày làm việc trừ CN + lễ)
  total_days      NUMERIC(5,2) NOT NULL,
  total_hours     NUMERIC(5,2),
  reason          TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected','cancelled')),
  reviewed_by     TEXT,
  reviewed_at     TIMESTAMPTZ,
  review_note     TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_leave_requests_user   ON leave_requests(user_id, start_date);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON leave_requests(status);

-- ── 3. Sổ quỹ phép năm (ledger) ────────────────────────────────────
-- Số dư = SUM(amount). Không bao giờ sửa đè — mỗi biến động là 1 dòng mới.
CREATE TABLE IF NOT EXISTS leave_transactions (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id     TEXT NOT NULL,
  year        INTEGER NOT NULL,
  amount      NUMERIC(6,2) NOT NULL,   -- dương = cộng, âm = trừ
  source      TEXT NOT NULL CHECK (source IN
                ('accrual','seniority','opening','manual','usage','usage_revert','carryover_in','carryover_expire')),
  -- Khóa chu kỳ chống cộng trùng khi scheduler chạy lại, vd 'accrual:2026-06'
  period_key  TEXT,
  request_id  TEXT,
  note        TEXT,
  created_by  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_leave_tx_period
  ON leave_transactions(user_id, source, period_key) WHERE period_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leave_tx_user_year ON leave_transactions(user_id, year);

-- ── 4. Chính sách cộng phép năm ────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_accrual_policies (
  id                    TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name                  TEXT NOT NULL,
  -- NULL = chính sách mặc định toàn công ty; có giá trị = áp riêng cho hình thức lao động đó
  employment_type_id    TEXT REFERENCES employment_types(id),
  base_days_per_year    NUMERIC(4,1) NOT NULL DEFAULT 12,
  -- monthly = cộng dần mỗi tháng (base/12), yearly_upfront = cấp đủ đầu năm
  accrual_frequency     TEXT NOT NULL DEFAULT 'monthly'
                          CHECK (accrual_frequency IN ('monthly','yearly_upfront')),
  prorate_new_hires     BOOLEAN NOT NULL DEFAULT true,
  -- Điều 114 BLLĐ: +1 ngày cho mỗi 5 năm thâm niên
  seniority_bonus_days  NUMERIC(3,1) NOT NULL DEFAULT 1,
  seniority_every_years INTEGER NOT NULL DEFAULT 5,
  -- Phép năm cũ được mang sang năm mới tối đa bao nhiêu ngày, hết hạn vào MM-DD
  carryover_max_days    NUMERIC(4,1) NOT NULL DEFAULT 0,
  carryover_expiry_mmdd TEXT NOT NULL DEFAULT '03-31',
  allow_negative        BOOLEAN NOT NULL DEFAULT false,
  active                BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_leave_policies_etype ON leave_accrual_policies(employment_type_id);

-- ── Seed loại phép theo Bộ luật Lao động 2019 ─────────────────────
INSERT INTO leave_types
  (id, code, name, description, paid_by, deducts_balance, max_days, max_days_scope, allow_hourly, color, is_system, sort_order)
VALUES
  ('ltype_annual',          'annual',            'Phép năm',
   'Nghỉ phép hằng năm hưởng nguyên lương (Điều 113 BLLĐ 2019) — trừ vào quỹ phép năm',
   'company',   true,  NULL, 'per_year',       true,  '#14B8A6', true, 1),
  ('ltype_sick',            'sick_bhxh',         'Nghỉ ốm (BHXH)',
   'Nghỉ ốm đau hưởng trợ cấp BHXH, cần giấy tờ y tế',
   'insurance', false, NULL, 'per_year',       true,  '#F59E0B', true, 2),
  ('ltype_marriage_self',   'marriage_self',     'Bản thân kết hôn',
   'Nghỉ việc riêng hưởng nguyên lương: 3 ngày (Điều 115 BLLĐ 2019)',
   'company',   false, 3,    'per_occurrence', false, '#EC4899', true, 3),
  ('ltype_marriage_child',  'marriage_child',    'Con kết hôn',
   'Nghỉ việc riêng hưởng nguyên lương: 1 ngày (Điều 115 BLLĐ 2019)',
   'company',   false, 1,    'per_occurrence', false, '#EC4899', true, 4),
  ('ltype_bereavement_3d',  'bereavement_direct','Tang chế (cha mẹ, vợ/chồng, con)',
   'Nghỉ việc riêng hưởng nguyên lương: 3 ngày (Điều 115 BLLĐ 2019)',
   'company',   false, 3,    'per_occurrence', false, '#64748B', true, 5),
  ('ltype_bereavement_1d',  'bereavement_other', 'Tang chế (ông bà, anh chị em ruột)',
   'Nghỉ không hưởng lương: 1 ngày, báo trước cho công ty (Điều 115 BLLĐ 2019)',
   'unpaid',    false, 1,    'per_occurrence', false, '#64748B', true, 6),
  ('ltype_maternity',       'maternity',         'Thai sản',
   'Nghỉ thai sản 6 tháng hưởng chế độ BHXH (Điều 139 BLLĐ 2019)',
   'insurance', false, 180,  'per_occurrence', false, '#8B5CF6', true, 7),
  ('ltype_prenatal',        'prenatal_checkup',  'Khám thai',
   'Nghỉ khám thai 5 lần, mỗi lần 1 ngày, hưởng BHXH (Luật BHXH)',
   'insurance', false, 5,    'per_year',       true,  '#8B5CF6', true, 8),
  ('ltype_paternity',       'paternity',         'Vợ sinh con',
   'Lao động nam nghỉ 5–14 ngày làm việc khi vợ sinh con, hưởng BHXH',
   'insurance', false, 14,   'per_occurrence', false, '#3B82F6', true, 9),
  ('ltype_child_sick',      'child_sick',        'Chăm con ốm (dưới 7 tuổi)',
   'Nghỉ chăm con ốm hưởng BHXH: con dưới 3 tuổi tối đa 20 ngày/năm, 3–7 tuổi tối đa 15 ngày/năm',
   'insurance', false, 20,   'per_year',       true,  '#F59E0B', true, 10),
  ('ltype_unpaid',          'unpaid',            'Nghỉ không lương',
   'Nghỉ không hưởng lương theo thỏa thuận với công ty (Điều 115 khoản 3)',
   'unpaid',    false, NULL, 'per_year',       true,  '#6B7280', true, 11)
ON CONFLICT (id) DO NOTHING;

-- ── Seed chính sách phép năm ───────────────────────────────────────
-- Mặc định toàn công ty: 12 ngày/năm, cộng dần 1 ngày/tháng, +1 ngày mỗi 5 năm thâm niên,
-- phép cũ mang sang được 12 ngày và hết hạn 31/03 năm sau.
INSERT INTO leave_accrual_policies
  (id, name, employment_type_id, base_days_per_year, accrual_frequency, prorate_new_hires,
   seniority_bonus_days, seniority_every_years, carryover_max_days, carryover_expiry_mmdd)
VALUES
  ('lpolicy_default',   'Mặc định toàn công ty', NULL,               12, 'monthly', true, 1, 5, 12, '03-31'),
  ('lpolicy_probation', 'Thử việc — chưa cộng phép',  'etype_probation',  0, 'monthly', true, 0, 5, 0,  '03-31'),
  ('lpolicy_apprentice','Học việc — chưa cộng phép',  'etype_apprentice', 0, 'monthly', true, 0, 5, 0,  '03-31'),
  ('lpolicy_intern',    'Thực tập — chưa cộng phép',  'etype_intern',     0, 'monthly', true, 0, 5, 0,  '03-31')
ON CONFLICT (id) DO NOTHING;
