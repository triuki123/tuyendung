-- Migration 293: ủy quyền duyệt phép VƯỢT CÂY SƠ ĐỒ.
--
-- Mặc định người duyệt phép = quản lý trực tiếp theo cây org_assignments. Giám Đốc bận
-- có thể GIAO cho một người khác (kể cả khác nhánh cây) quyền duyệt phép cho một số nhân sự.
-- Mỗi dòng = "approver_user_id được duyệt phép cho target_user_id".
--
-- BỔ SUNG, không thay thế: quản lý theo cây VẪN duyệt & nhận thông báo; người được ủy quyền
-- duyệt THÊM. Ai không nằm trong bảng này thì đi hoàn toàn theo cây như cũ.
CREATE TABLE IF NOT EXISTS leave_approver_delegations (
  id                TEXT PRIMARY KEY,
  approver_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Công ty ngữ cảnh (đa công ty): NULL = áp cho mọi công ty của target.
  company_id        UUID REFERENCES companies(id) ON DELETE CASCADE,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  note              TEXT,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Không tự duyệt đơn của chính mình qua cơ chế ủy quyền
  CONSTRAINT chk_leave_deleg_not_self CHECK (approver_user_id <> target_user_id)
);

-- Mỗi cặp (người duyệt, người được duyệt cho) chỉ 1 dòng active
CREATE UNIQUE INDEX IF NOT EXISTS uq_leave_deleg_pair
  ON leave_approver_delegations (approver_user_id, target_user_id) WHERE is_active;

-- Tra "ai được duyệt cho user X" (lúc user X nộp đơn → thông báo + cho phép duyệt)
CREATE INDEX IF NOT EXISTS idx_leave_deleg_target
  ON leave_approver_delegations (target_user_id) WHERE is_active;

-- Tra "user A được duyệt cho những ai" (thẻ Cần Tôi Xử Lý của A)
CREATE INDEX IF NOT EXISTS idx_leave_deleg_approver
  ON leave_approver_delegations (approver_user_id) WHERE is_active;
