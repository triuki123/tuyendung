-- Migration 290: Module Pháp Chế (legal) — pháp lý doanh nghiệp Việt Nam
--
-- 4 mảng: (1) sổ giấy phép & văn bản pháp lý, (2) lịch tuân thủ định kỳ,
-- (3) hợp đồng thương mại, (4) ủy quyền + sổ con dấu.
--
-- Nguyên tắc: KHÔNG hardcode luật — danh mục loại văn bản + chu kỳ là DỮ LIỆU
-- (bảng legal_document_types / legal_compliance_items), seed mặc định theo luật
-- hiện hành, admin sửa qua UI khi luật đổi.
--
-- Quyền: RBAC module 'legal', mô hình TẬP TRUNG (không cách ly công ty) —
-- mọi bản ghi vẫn gắn company_id để lọc/báo cáo.

-- ===== 1. Danh mục loại văn bản (cấu hình được) =====
CREATE TABLE IF NOT EXISTS legal_document_types (
  id                       TEXT PRIMARY KEY,
  name                     TEXT NOT NULL,
  -- dang_ky_dn: hồ sơ đăng ký doanh nghiệp | giay_phep_con: giấy phép ngành nghề
  -- có điều kiện | noi_bo: văn bản quản trị nội bộ
  group_key                TEXT NOT NULL CHECK (group_key IN ('dang_ky_dn', 'giay_phep_con', 'noi_bo')),
  -- Gợi ý thời hạn khi tạo văn bản (tháng). NULL = vô thời hạn / không gợi ý.
  default_validity_months  INTEGER,
  sort                     INTEGER NOT NULL DEFAULT 0,
  active                   BOOLEAN NOT NULL DEFAULT TRUE
);

-- Seed mặc định theo luật hiện hành — chỉ chèn khi bảng trống (idempotent).
INSERT INTO legal_document_types (id, name, group_key, default_validity_months, sort)
SELECT * FROM (VALUES
  ('ldt_gcndkdn',   'Giấy chứng nhận đăng ký doanh nghiệp', 'dang_ky_dn',    NULL, 1),
  ('ldt_dieule',    'Điều lệ công ty',                       'dang_ky_dn',    NULL, 2),
  ('ldt_gcndautu',  'Giấy chứng nhận đăng ký đầu tư',        'dang_ky_dn',    NULL, 3),
  ('ldt_maudau',    'Thông báo mẫu con dấu',                 'dang_ky_dn',    NULL, 4),
  ('ldt_pccc',      'Giấy chứng nhận PCCC',                  'giay_phep_con', 60,   10),
  ('ldt_attp',      'Giấy chứng nhận An toàn thực phẩm',     'giay_phep_con', 36,   11),
  ('ldt_moitruong', 'Giấy phép môi trường',                  'giay_phep_con', 120,  12),
  ('ldt_gpld_nn',   'Giấy phép lao động người nước ngoài',   'giay_phep_con', 24,   13),
  ('ldt_banle',     'Giấy phép bán lẻ / kinh doanh có điều kiện', 'giay_phep_con', NULL, 14),
  ('ldt_socodong',  'Sổ đăng ký cổ đông / thành viên',       'noi_bo',        NULL, 20),
  ('ldt_bienban',   'Biên bản họp HĐQT / HĐTV / ĐHĐCĐ',      'noi_bo',        NULL, 21),
  ('ldt_nghiquyet', 'Nghị quyết / Quyết định',               'noi_bo',        NULL, 22)
) AS seed(id, name, group_key, default_validity_months, sort)
WHERE NOT EXISTS (SELECT 1 FROM legal_document_types);

-- ===== 2. Sổ văn bản pháp lý =====
CREATE TABLE IF NOT EXISTS legal_documents (
  id            TEXT PRIMARY KEY,
  company_id    TEXT NOT NULL,
  type_id       TEXT REFERENCES legal_document_types(id) ON DELETE SET NULL,
  title         TEXT NOT NULL,
  doc_number    TEXT,
  issued_by     TEXT,                -- cơ quan cấp
  issued_date   DATE,
  expiry_date   DATE,                -- NULL = vô thời hạn
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'expired', 'replaced', 'revoked')),
  holder        TEXT,                -- ai/đơn vị nào giữ bản gốc
  note          TEXT,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_legal_docs_company ON legal_documents(company_id, status);
CREATE INDEX IF NOT EXISTS idx_legal_docs_expiry  ON legal_documents(expiry_date) WHERE expiry_date IS NOT NULL;

-- File scan đính kèm (khuôn contract_attachments: BYTEA, xóa mềm)
CREATE TABLE IF NOT EXISTS legal_document_files (
  id           TEXT PRIMARY KEY,
  document_id  TEXT NOT NULL REFERENCES legal_documents(id) ON DELETE CASCADE,
  file_name    TEXT NOT NULL,
  mime_type    TEXT NOT NULL,
  size_bytes   INTEGER NOT NULL,
  content      BYTEA NOT NULL,
  uploaded_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_legal_doc_files ON legal_document_files(document_id) WHERE deleted_at IS NULL;

-- ===== 3. Lịch tuân thủ định kỳ =====
CREATE TABLE IF NOT EXISTS legal_compliance_items (
  id          TEXT PRIMARY KEY,
  company_id  TEXT,                  -- NULL = áp dụng cho MỌI công ty
  name        TEXT NOT NULL,
  agency      TEXT,                  -- nơi nộp / cơ quan tiếp nhận
  frequency   TEXT NOT NULL CHECK (frequency IN ('yearly', 'quarterly', 'monthly', 'once')),
  due_month   INTEGER CHECK (due_month BETWEEN 1 AND 12),   -- yearly: tháng đến hạn
  due_day     INTEGER CHECK (due_day BETWEEN 1 AND 31),     -- ngày đến hạn trong tháng/kỳ
  link_url    TEXT,                  -- vd trỏ trang Mẫu 01/PLI nội bộ
  note        TEXT,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed vài nghĩa vụ phổ biến (chỉ khi bảng trống; admin sửa/thêm qua UI)
INSERT INTO legal_compliance_items (id, company_id, name, agency, frequency, due_month, due_day, note)
SELECT * FROM (VALUES
  ('lci_laodong_6t', NULL, 'Báo cáo tình hình sử dụng lao động (Mẫu 01/PLI) — 6 tháng', 'Sở LĐ-TB&XH',  'yearly', 6,  5,  'NĐ 145/2020/NĐ-CP — trước 05/06'),
  ('lci_laodong_nam', NULL, 'Báo cáo tình hình sử dụng lao động (Mẫu 01/PLI) — cả năm',  'Sở LĐ-TB&XH',  'yearly', 12, 5,  'NĐ 145/2020/NĐ-CP — trước 05/12'),
  ('lci_monbai',     NULL, 'Lệ phí môn bài',                                             'Cơ quan thuế', 'yearly', 1,  30, 'Hạn nộp 30/01 hằng năm'),
  ('lci_bhxh',       NULL, 'Đối chiếu & nộp BHXH/BHYT/BHTN',                             'Cơ quan BHXH', 'monthly', NULL, 25, NULL)
) AS seed(id, company_id, name, agency, frequency, due_month, due_day, note)
WHERE NOT EXISTS (SELECT 1 FROM legal_compliance_items);

-- Trạng thái từng kỳ (1 dòng = 1 kỳ đã hoàn thành)
CREATE TABLE IF NOT EXISTS legal_compliance_logs (
  id         TEXT PRIMARY KEY,
  item_id    TEXT NOT NULL REFERENCES legal_compliance_items(id) ON DELETE CASCADE,
  -- Kỳ chuẩn hoá chuỗi: yearly '2026' | quarterly '2026-Q1' | monthly '2026-01' | once 'once'
  period     TEXT NOT NULL,
  done_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  done_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  note       TEXT,
  UNIQUE (item_id, period)
);

-- ===== 4. Hợp đồng thương mại =====
CREATE TABLE IF NOT EXISTS legal_contracts (
  id               TEXT PRIMARY KEY,
  company_id       TEXT NOT NULL,     -- công ty phía mình đứng tên ký
  partner_name     TEXT NOT NULL,
  partner_tax_code TEXT,
  title            TEXT NOT NULL,
  contract_number  TEXT,
  value            BIGINT,            -- đồng VND, số nguyên
  signed_date      DATE,
  effective_from   DATE,
  effective_to     DATE,              -- NULL = không thời hạn
  status           TEXT NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft', 'active', 'expired', 'liquidated', 'terminated')),
  owner_id         UUID REFERENCES users(id) ON DELETE SET NULL,  -- người phụ trách
  note             TEXT,
  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_legal_contracts_company ON legal_contracts(company_id, status);
CREATE INDEX IF NOT EXISTS idx_legal_contracts_expiry  ON legal_contracts(effective_to) WHERE effective_to IS NOT NULL;

CREATE TABLE IF NOT EXISTS legal_contract_files (
  id           TEXT PRIMARY KEY,
  contract_id  TEXT NOT NULL REFERENCES legal_contracts(id) ON DELETE CASCADE,
  file_name    TEXT NOT NULL,
  mime_type    TEXT NOT NULL,
  size_bytes   INTEGER NOT NULL,
  content      BYTEA NOT NULL,
  uploaded_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_legal_contract_files ON legal_contract_files(contract_id) WHERE deleted_at IS NULL;

-- ===== 5. Ủy quyền =====
CREATE TABLE IF NOT EXISTS legal_authorizations (
  id              TEXT PRIMARY KEY,
  company_id      TEXT NOT NULL,
  grantor         TEXT NOT NULL,      -- người ủy quyền
  grantee         TEXT NOT NULL,      -- người được ủy quyền
  scope           TEXT,               -- phạm vi ủy quyền
  doc_number      TEXT,
  effective_from  DATE,
  effective_to    DATE,               -- NULL = đến khi thu hồi
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'expired', 'revoked')),
  note            TEXT,
  created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_legal_auth_company ON legal_authorizations(company_id, status);

-- ===== 6. Sổ theo dõi sử dụng con dấu =====
CREATE TABLE IF NOT EXISTS legal_seal_logs (
  id             TEXT PRIMARY KEY,
  company_id     TEXT NOT NULL,
  used_at        DATE NOT NULL,
  document_desc  TEXT NOT NULL,       -- văn bản được đóng dấu
  used_by        TEXT NOT NULL,       -- người thực hiện (text tự do — có thể không phải user hệ thống)
  note           TEXT,
  created_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_legal_seal_company ON legal_seal_logs(company_id, used_at DESC);

-- ===== 7. Chống nhắc trùng (khuôn asset_reminder_log) =====
CREATE TABLE IF NOT EXISTS legal_reminder_log (
  id              TEXT PRIMARY KEY,
  entity_type     TEXT NOT NULL CHECK (entity_type IN ('document', 'contract', 'authorization', 'compliance')),
  entity_id       TEXT NOT NULL,
  milestone_days  INTEGER NOT NULL,   -- số ngày trước hạn; 0 = đúng hạn; -1 = quá hạn
  sent_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  UNIQUE (entity_type, entity_id, milestone_days, sent_date)
);

-- ===== 8. Audit trail riêng cho legal (KHÔNG dùng chung hr_record_audit_logs) =====
CREATE TABLE IF NOT EXISTS legal_audit_logs (
  id            TEXT PRIMARY KEY,
  entity_type   TEXT NOT NULL CHECK (entity_type IN ('document', 'contract', 'authorization', 'seal_log', 'compliance_item')),
  entity_id     TEXT NOT NULL,
  action        TEXT NOT NULL,        -- create | update | delete | status_change | attach | detach | mark_done
  details       TEXT,                 -- câu tiếng Việt hiển thị thẳng lên UI
  changes       JSONB,                -- diff { field: { label, from, to } }
  performed_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_legal_audit_entity ON legal_audit_logs(entity_type, entity_id, created_at DESC);
