-- Migration 121: Chế Độ & Đãi Ngộ — thêm cột phụ cấp + BHXH vào users
-- Dùng cho xuất bảng công (DETAIL_fill): phụ cấp cơm/xe/công tác phí, BHXH, đơn vị trả lương.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS meal_allowance_enabled     BOOLEAN DEFAULT false,  -- có hưởng phụ cấp cơm
  ADD COLUMN IF NOT EXISTS meal_allowance_rate        INTEGER DEFAULT 25000,  -- mức/ngày (đ)
  ADD COLUMN IF NOT EXISTS parking_allowance_enabled  BOOLEAN DEFAULT false,  -- có hưởng phụ cấp gửi xe
  ADD COLUMN IF NOT EXISTS parking_allowance_rate     INTEGER DEFAULT 10000,  -- mức/ngày (đ)
  ADD COLUMN IF NOT EXISTS travel_allowance_rate      INTEGER DEFAULT 0,      -- công tác phí /ngày (đ)
  ADD COLUMN IF NOT EXISTS social_insurance_unit      TEXT,                   -- đơn vị tham gia BHXH (FADO GLOBAL...)
  ADD COLUMN IF NOT EXISTS social_insurance_base      INTEGER,                -- mức đóng BHXH (đ)
  ADD COLUMN IF NOT EXISTS social_insurance_deduction INTEGER,                -- trích trừ BHXH (đ) — auto 10.5% hoặc nhập tay
  ADD COLUMN IF NOT EXISTS salary_entity              TEXT,                   -- đơn vị trực thuộc trả lương (FADO GROUP...)
  ADD COLUMN IF NOT EXISTS cost_center_code           TEXT;                   -- Mã CC (mã chấm công đối chiếu)
