-- Migration 115: Module Offboarding (Quy Trình Nghỉ Việc) — Nguồn Nhân Lực
-- 3 bảng: templates (cấu hình đầu mục), processes (quy trình per nhân sự), checklist_items (snapshot + auto tài sản)

-- 1. Cấu hình đầu mục checklist (template)
CREATE TABLE IF NOT EXISTS offboarding_checklist_templates (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT,
  category    TEXT NOT NULL DEFAULT 'hcns',   -- hcns | it | asset | finance | other
  sort_order  INTEGER NOT NULL DEFAULT 0,
  enabled     BOOLEAN NOT NULL DEFAULT true,
  required    BOOLEAN NOT NULL DEFAULT true,  -- bắt buộc check trước khi hoàn tất
  auto_type   TEXT,                           -- NULL = thủ công; 'assets' = tự bung từng tài sản đang gán
  is_system   BOOLEAN NOT NULL DEFAULT false, -- đầu mục hệ thống: không xóa được (chỉ tắt)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Quy trình nghỉ việc
CREATE TABLE IF NOT EXISTS offboarding_processes (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL,            -- nhân sự nghỉ việc (users.id)
  reason            TEXT NOT NULL DEFAULT 'resignation', -- resignation | termination | contract_end | retirement | other
  reason_note       TEXT,
  last_working_date DATE,                     -- ngày làm việc cuối cùng
  source_ticket_id  TEXT,                     -- ticket gốc (nếu nhân sự tạo ticket xin nghỉ)
  status            TEXT NOT NULL DEFAULT 'in_progress', -- in_progress | completed | cancelled
  created_by        TEXT,
  completed_by      TEXT,
  completed_at      TIMESTAMPTZ,
  cancelled_by      TEXT,
  cancelled_at      TIMESTAMPTZ,
  cancel_reason     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Mỗi nhân sự chỉ có 1 quy trình đang xử lý
CREATE UNIQUE INDEX IF NOT EXISTS uq_offboarding_active_per_user
  ON offboarding_processes (user_id) WHERE status = 'in_progress';
CREATE INDEX IF NOT EXISTS idx_offboarding_processes_status ON offboarding_processes (status);

-- 3. Đầu mục checklist của từng quy trình (snapshot từ template lúc tạo)
CREATE TABLE IF NOT EXISTS offboarding_checklist_items (
  id          TEXT PRIMARY KEY,
  process_id  TEXT NOT NULL REFERENCES offboarding_processes(id) ON DELETE CASCADE,
  template_id TEXT,                           -- NULL với item tự sinh (vd từng tài sản)
  title       TEXT NOT NULL,
  description TEXT,
  category    TEXT NOT NULL DEFAULT 'hcns',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  required    BOOLEAN NOT NULL DEFAULT true,
  asset_id    TEXT,                           -- item thu hồi tài sản → assets.id
  is_done     BOOLEAN NOT NULL DEFAULT false,
  done_by     TEXT,
  done_at     TIMESTAMPTZ,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_offboarding_items_process ON offboarding_checklist_items (process_id);

-- Seed đầu mục mặc định (idempotent qua ON CONFLICT)
INSERT INTO offboarding_checklist_templates (id, title, description, category, sort_order, required, auto_type, is_system) VALUES
  ('obt_don_nghi_viec',  'Tiếp nhận đơn xin nghỉ việc / quyết định thôi việc', 'Lưu bản cứng hoặc bản scan vào hồ sơ nhân sự', 'hcns', 10, true, NULL, true),
  ('obt_ban_giao_cv',    'Bàn giao công việc cho người tiếp nhận', 'Lập biên bản bàn giao công việc, tài liệu, dữ liệu đang phụ trách', 'hcns', 20, true, NULL, true),
  ('obt_thu_hoi_ts',     'Thu hồi tài sản được cấp phát', 'Hệ thống tự liệt kê từng tài sản đang gán cho nhân sự', 'asset', 30, true, 'assets', true),
  ('obt_khoa_tai_khoan', 'Khóa email & tài khoản hệ thống nội bộ', 'Email Zimbra, VPN, phần mềm nội bộ, quyền truy cập khác', 'it', 40, true, NULL, true),
  ('obt_quyet_toan',     'Quyết toán lương, phép tồn & các khoản phải thu', 'Lương tháng cuối, phép năm chưa nghỉ, tạm ứng, bồi hoàn (nếu có)', 'finance', 50, true, NULL, true),
  ('obt_bhxh',           'Chốt sổ BHXH & trả hồ sơ giấy tờ cá nhân', 'Chốt và trả sổ BHXH, giấy tờ gốc nhân sự đã nộp', 'hcns', 60, true, NULL, true),
  ('obt_thanh_ly_hd',    'Ký biên bản thanh lý hợp đồng lao động', 'Hai bên ký xác nhận chấm dứt hợp đồng theo quy định', 'hcns', 70, true, NULL, true)
ON CONFLICT (id) DO NOTHING;
