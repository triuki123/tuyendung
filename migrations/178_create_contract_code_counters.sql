-- Migration 178: Bộ đếm số thứ tự (STT) sinh mã hợp đồng — nguyên tử, reset theo ngày
-- scope = "{TYPE}|{COMPANY}|{YYYY-MM-DD}" (giờ VN). Mỗi scope đếm tăng dần độc lập.
CREATE TABLE IF NOT EXISTS public.contract_code_counters (
  scope      TEXT PRIMARY KEY,
  last_seq   INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
