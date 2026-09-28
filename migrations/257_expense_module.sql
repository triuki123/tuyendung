-- Migration 257: Module CHI PHÍ — khung dữ liệu v1 (lõi + duyệt 2 tầng + hook tạm ứng/Kế toán).
-- Thiết kế: docs/technical/expense-module-roadmap.md (§2, §11). Tiền = BIGINT đồng VND.

-- ── Danh mục loại chi phí (flow_type = hành vi dòng chảy, cơ chế MỞ) ─────────
CREATE TABLE IF NOT EXISTS expense_categories (
  id          TEXT PRIMARY KEY,
  code        TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  flow_type   TEXT NOT NULL DEFAULT 'operational',  -- asset_purchase|operational|reimbursement|service|advance|...
  company_id  UUID REFERENCES companies(id) ON DELETE CASCADE,  -- null = mọi công ty
  color       TEXT NOT NULL DEFAULT '#6366f1',
  active      BOOLEAN NOT NULL DEFAULT true,
  sort_order  INT NOT NULL DEFAULT 99,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Quy tắc số phiếu — MỖI CÔNG TY TỰ QUY ĐỊNH ──────────────────────────────
-- pattern placeholder: {YYYY} {YY} {MM} {SEQ:n} {COMPANY}. Chưa cấu hình → CP-{YYYY}-{SEQ:5}.
CREATE TABLE IF NOT EXISTS expense_code_rules (
  company_id      UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  pattern         TEXT NOT NULL DEFAULT 'CP-{YYYY}-{SEQ:5}',
  next_seq        BIGINT NOT NULL DEFAULT 1,
  reset_yearly    BOOLEAN NOT NULL DEFAULT true,
  last_reset_year INT
);

-- ── Phiếu chi phí ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expenses (
  id                TEXT PRIMARY KEY,               -- exp_xxx (app sinh)
  code              TEXT UNIQUE,                    -- số phiếu theo quy tắc công ty (sinh lúc submit)
  title             TEXT NOT NULL,
  expense_date      DATE,
  category_id       TEXT REFERENCES expense_categories(id) ON DELETE SET NULL,
  -- Tiền (BIGINT đồng VND)
  amount            BIGINT NOT NULL DEFAULT 0,      -- TỔNG CỘNG (sau thuế)
  amount_before_tax BIGINT,
  vat_enabled       BOOLEAN NOT NULL DEFAULT false,
  vat_rate          NUMERIC(5,2),
  vat_amount        BIGINT,
  currency          TEXT NOT NULL DEFAULT 'VND',
  -- Đa công ty: 1 danh tính người tạo + CÔNG TY CHỊU CHI (11.0)
  company_id        UUID NOT NULL REFERENCES companies(id),
  department_id     UUID,
  cost_center       TEXT,
  project_code      TEXT,
  requested_by      UUID NOT NULL,                  -- users.id (UUID) — MỘT danh tính duy nhất
  -- Hoá đơn / Nhà cung cấp
  invoice_number    TEXT,
  invoice_date      DATE,
  supplier_name     TEXT,
  supplier_tax_code TEXT,
  -- Thanh toán
  payee_name          TEXT,
  payment_method      TEXT NOT NULL DEFAULT 'bank_transfer',  -- bank_transfer | cash
  bank_account_name   TEXT,
  bank_account_number TEXT,
  bank_name           TEXT,
  -- Liên kết toàn trình (ticket/asset/contract/task…)
  related_type      TEXT,
  related_id        TEXT,
  -- Tạm ứng → quyết toán (v1.1 — schema chừa sẵn)
  advance_id        TEXT REFERENCES expenses(id) ON DELETE SET NULL,  -- phiếu QUYẾT TOÁN trỏ về phiếu tạm ứng
  settlement_status TEXT NOT NULL DEFAULT 'none',   -- none | pending | settled (chỉ có nghĩa với phiếu tạm ứng)
  -- Vòng đời (§2 đặc tả + thu hồi/hủy 11.5)
  status            TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','pending_approval','approved','cancelled',
                                      'sent_to_accounting','posted','paid','rejected')),
  reject_reason     TEXT,
  cancel_reason     TEXT,
  cancelled_by      UUID,
  cancelled_at      TIMESTAMPTZ,
  -- Đồng bộ Kế toán (P2)
  accounting_ref    TEXT,
  external_status   TEXT,
  idempotency_key   TEXT UNIQUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_expenses_company   ON expenses(company_id, status);
CREATE INDEX IF NOT EXISTS idx_expenses_requester ON expenses(requested_by);
CREATE INDEX IF NOT EXISTS idx_expenses_related   ON expenses(related_type, related_id);
CREATE INDEX IF NOT EXISTS idx_expenses_advance   ON expenses(advance_id);
-- Cảnh báo nghi trùng (11.5): tra nhanh cùng NCC + số hoá đơn
CREATE INDEX IF NOT EXISTS idx_expenses_dup ON expenses(supplier_tax_code, invoice_number);

-- ── Dòng chi tiết (bảng động + công thức, tái dùng pattern Email Center) ────
CREATE TABLE IF NOT EXISTS expense_lines (
  id          TEXT PRIMARY KEY,
  expense_id  TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  noi_dung    TEXT NOT NULL DEFAULT '',
  sl          NUMERIC(12,2) NOT NULL DEFAULT 1,
  dvt         TEXT,
  don_gia     BIGINT NOT NULL DEFAULT 0,
  thanh_tien  BIGINT NOT NULL DEFAULT 0,
  sort_order  INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_expense_lines_expense ON expense_lines(expense_id);

-- ── Chứng từ đính kèm (BYTEA v1; signed-URL ở P2) ────────────────────────────
CREATE TABLE IF NOT EXISTS expense_attachments (
  id          TEXT PRIMARY KEY,
  expense_id  TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  file_name   TEXT NOT NULL,
  mime_type   TEXT NOT NULL DEFAULT 'application/octet-stream',
  size_bytes  BIGINT NOT NULL DEFAULT 0,
  content     BYTEA NOT NULL,
  uploaded_by UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_expense_attachments_expense ON expense_attachments(expense_id);

-- ── Thread trao đổi per-expense (immutable; P2 nhận cả tin từ Kế toán) ───────
CREATE TABLE IF NOT EXISTS expense_messages (
  id            TEXT PRIMARY KEY,
  expense_id    TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  source        TEXT NOT NULL DEFAULT 'assetflow',   -- assetflow | accounting
  author_ref    TEXT,                                -- id hệ nguồn (opaque, KHÔNG map user)
  author_name   TEXT NOT NULL,
  body          TEXT NOT NULL,
  attachments   JSONB NOT NULL DEFAULT '[]'::jsonb,
  client_msg_id TEXT,                                -- idempotency chống trùng khi retry
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (expense_id, client_msg_id)
);
CREATE INDEX IF NOT EXISTS idx_expense_messages_expense ON expense_messages(expense_id, created_at);

-- ── DUYỆT tầng 1: chuỗi ráp tay per-NGƯỜI-TẠO per-company (Tab "Quyền Chi Phí") ─
CREATE TABLE IF NOT EXISTS expense_approval_chains (
  id          TEXT PRIMARY KEY,
  user_id     UUID NOT NULL,                         -- NGƯỜI TẠO đơn
  company_id  UUID REFERENCES companies(id) ON DELETE CASCADE,  -- null = mọi công ty
  steps       JSONB NOT NULL DEFAULT '[]'::jsonb,    -- [{order, approver_user_id, label?}]
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- NULL company là distinct trong UNIQUE thường → dùng partial unique index (pattern user_ecard_variants)
CREATE UNIQUE INDEX IF NOT EXISTS uq_eac_global  ON expense_approval_chains(user_id) WHERE company_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_eac_company ON expense_approval_chains(user_id, company_id) WHERE company_id IS NOT NULL;

-- ── DUYỆT tầng 2: hạn mức thẩm quyền per-NGƯỜI-DUYỆT (Limit of Authority) ────
CREATE TABLE IF NOT EXISTS expense_approver_limits (
  id          TEXT PRIMARY KEY,
  user_id     UUID NOT NULL,                         -- NGƯỜI DUYỆT
  company_id  UUID REFERENCES companies(id) ON DELETE CASCADE,  -- null = mọi công ty
  max_amount  BIGINT,                                -- null = VÔ HẠN (chốt mọi đơn)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_eal_global  ON expense_approver_limits(user_id) WHERE company_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_eal_company ON expense_approver_limits(user_id, company_id) WHERE company_id IS NOT NULL;

-- ── DUYỆT tầng fallback: rule hạn mức per-CÔNG-TY (lưới an toàn) ─────────────
CREATE TABLE IF NOT EXISTS expense_approval_rules (
  id          TEXT PRIMARY KEY,
  company_id  UUID REFERENCES companies(id) ON DELETE CASCADE,  -- null = global
  min_amount  BIGINT NOT NULL DEFAULT 0,
  max_amount  BIGINT,                                -- null = không trần
  steps       JSONB NOT NULL DEFAULT '[]'::jsonb,    -- [{order, approver_type, approver_value, label}]
  active      BOOLEAN NOT NULL DEFAULT true,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Bước duyệt thực tế (đóng băng lúc submit) ────────────────────────────────
CREATE TABLE IF NOT EXISTS expense_approvals (
  id                TEXT PRIMARY KEY,
  expense_id        TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  step_order        INT NOT NULL,
  approver_user_id  UUID NOT NULL,                   -- đã resolve cụ thể
  limit_amount      BIGINT,                          -- hạn mức của người duyệt tại thời điểm submit (đóng băng)
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected','skipped')),
  approved_by       UUID,
  approved_at       TIMESTAMPTZ,
  note              TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (expense_id, step_order)
);
CREATE INDEX IF NOT EXISTS idx_expense_approvals_approver ON expense_approvals(approver_user_id, status);

-- ── Assets: liên kết ngược từ dòng chảy mua tài sản (flow_type=asset_purchase) ─
ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS expense_id       TEXT,   -- phiếu chi sinh ra tài sản này
  ADD COLUMN IF NOT EXISTS source_ticket_id TEXT;   -- ticket khởi nguồn (nếu có)
CREATE INDEX IF NOT EXISTS idx_assets_expense ON assets(expense_id);

-- ── Seed danh mục mặc định (đổi/tắt được qua UI) ─────────────────────────────
INSERT INTO expense_categories (id, code, name, description, flow_type, color, sort_order) VALUES
  ('ecat_asset',   'mua_tai_san', 'Mua tài sản / thiết bị', 'Tự tạo tài sản trạng thái Chờ mua, nhận hàng thì đưa vào sử dụng', 'asset_purchase', '#10b981', 1),
  ('ecat_oper',    'van_hanh',    'Chi phí vận hành',        'Điện nước, thuê mặt bằng, văn phòng phẩm…',                        'operational',    '#6366f1', 2),
  ('ecat_service', 'dich_vu',     'Dịch vụ / thuê ngoài',    'Phần mềm, tư vấn, quảng cáo, vận chuyển…',                          'service',        '#0ea5e9', 3),
  ('ecat_reimb',   'hoan_ung',    'Hoàn ứng nhân viên',      'Nhân viên chi trước, công ty hoàn lại',                             'reimbursement',  '#f59e0b', 4),
  ('ecat_advance', 'tam_ung',     'Tạm ứng',                 'Ứng tiền trước, quyết toán sau (v1.1)',                             'advance',        '#8b5cf6', 5)
ON CONFLICT (code) DO NOTHING;
