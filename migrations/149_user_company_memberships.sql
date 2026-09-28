-- Migration 149: Đa Công Ty — vai trò của 1 user ở các công ty PHỤ
--
-- Công ty CHÍNH vẫn ở users (company_id/role/department_id/...): không đụng.
-- Bảng này chỉ lưu các công ty PHỤ user được bật ở tab "Đa Công Ty".
--
-- ⚠️ BẢN CHỐNG ĐẠN cho production (DB self-hosted có thể lệch schema so với dev):
--   - KHÔNG đặt FK tới departments/sub_departments/positions/job_titles/users cho
--     các cột tổ chức → tránh lỗi "foreign key cannot be implemented (42804)" khi
--     kiểu cột đích ở prod khác kỳ vọng. Các cột này vẫn là UUID, app tự đảm bảo
--     toàn vẹn (chỉ ghi id hợp lệ lấy từ chính danh mục tổ chức).
--   - KHÔNG dùng DEFAULT gen_random_uuid() → tránh phụ thuộc pgcrypto/PG13+. App
--     luôn tự sinh id (crypto.randomUUID) khi INSERT.
--   - KHÔNG CHECK role → app kiểm giá trị role.
--   - IF NOT EXISTS toàn bộ → idempotent, chạy lại không lỗi.

CREATE TABLE IF NOT EXISTS public.user_company_memberships (
  id                 UUID PRIMARY KEY,
  user_id            UUID NOT NULL,
  company_id         UUID NOT NULL,
  role               TEXT NOT NULL DEFAULT 'user',
  department_id      UUID,
  sub_department_id  UUID,
  position_id        UUID,
  job_title_id       UUID,
  manager_id         UUID,
  module_permissions JSONB,
  is_active          BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_user_company UNIQUE (user_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_ucm_user    ON public.user_company_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_ucm_company ON public.user_company_memberships(company_id);
CREATE INDEX IF NOT EXISTS idx_ucm_manager ON public.user_company_memberships(manager_id) WHERE manager_id IS NOT NULL;

COMMENT ON TABLE public.user_company_memberships IS
  'Vai trò của user tại các công ty PHỤ (Đa Công Ty). Công ty chính vẫn ở bảng users.';
