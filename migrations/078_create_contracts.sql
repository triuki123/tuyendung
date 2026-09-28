-- Migration 078: contracts — hợp đồng nhân sự
-- end_date NULL = vô thời hạn (không nhắc gia hạn).
-- previous_contract_id: liên kết bản gia hạn trước → giữ lịch sử (HRIS).
-- status: draft | active | renewed | terminated. "Sắp hết hạn / đã hết hạn"
--         suy ra từ end_date + ngày hiện tại, KHÔNG lưu để khỏi cần job lật.
CREATE TABLE IF NOT EXISTS public.contracts (
  id                   TEXT PRIMARY KEY,
  -- employee_id lưu users.id dạng chuỗi; KHÔNG FK cứng vì users.id có thể là
  -- UUID hoặc TEXT tùy deploy (join bằng ::text như các service hiện có).
  employee_id          TEXT NOT NULL,
  contract_type_id     TEXT REFERENCES public.contract_types(id) ON DELETE SET NULL,
  contract_number      VARCHAR(100) NOT NULL UNIQUE,
  sign_date            DATE,
  start_date           DATE,
  end_date             DATE,
  salary_info          TEXT,
  notes                TEXT,
  status               TEXT NOT NULL DEFAULT 'active',
  previous_contract_id TEXT REFERENCES public.contracts(id) ON DELETE SET NULL,
  created_by           TEXT,
  created_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contracts_employee_id ON public.contracts(employee_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status      ON public.contracts(status);
CREATE INDEX IF NOT EXISTS idx_contracts_end_date    ON public.contracts(end_date);
CREATE INDEX IF NOT EXISTS idx_contracts_type        ON public.contracts(contract_type_id);
