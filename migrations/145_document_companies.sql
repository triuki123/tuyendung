-- Migration 145: Văn bản - Quyết định áp dụng cho NHIỀU công ty (bảng nối)
-- Quy ước: KHÔNG có dòng nào trong bảng nối = áp dụng cho TẤT CẢ công ty (toàn hệ thống).
-- documents.id và companies.id đều là UUID.
CREATE TABLE IF NOT EXISTS document_companies (
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  PRIMARY KEY (document_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_document_companies_doc     ON document_companies(document_id);
CREATE INDEX IF NOT EXISTS idx_document_companies_company ON document_companies(company_id);
