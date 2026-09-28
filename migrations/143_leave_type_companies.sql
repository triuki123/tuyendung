-- Migration 143: loại phép áp dụng cho NHIỀU công ty (bảng nối)
-- Quy ước: KHÔNG có dòng nào trong bảng nối = áp dụng cho TẤT CẢ công ty (dùng chung).
-- leave_types.id là TEXT; companies.id là UUID.
CREATE TABLE IF NOT EXISTS leave_type_companies (
  leave_type_id TEXT NOT NULL REFERENCES leave_types(id) ON DELETE CASCADE,
  company_id    UUID NOT NULL REFERENCES companies(id)   ON DELETE CASCADE,
  PRIMARY KEY (leave_type_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_leave_type_companies_type    ON leave_type_companies(leave_type_id);
CREATE INDEX IF NOT EXISTS idx_leave_type_companies_company ON leave_type_companies(company_id);

-- Chuyển dữ liệu company_id đơn (cột cũ) sang bảng nối
INSERT INTO leave_type_companies (leave_type_id, company_id)
SELECT id, company_id FROM leave_types WHERE company_id IS NOT NULL
ON CONFLICT DO NOTHING;
