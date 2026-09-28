-- Migration 302: Bảng media trung tâm (chuẩn bị chuyển 19 bảng BYTEA sang MinIO object storage)
-- Xem kế hoạch chi tiết: docs/technical (nếu có) hoặc lịch sử trao đổi dự án.
-- KHÔNG xoá cột content BYTEA ở các bảng nguồn — chỉ thêm cột liên kết media_id (nullable),
-- dual storage cho tới khi từng bảng được xác nhận migrate xong 100% (xem migration engine
-- ở scripts/migrate-media/).

DO $$ BEGIN
  CREATE TYPE media_visibility AS ENUM ('public', 'private');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.media (
  id             TEXT PRIMARY KEY,
  bucket         VARCHAR(128) NOT NULL,
  object_key     VARCHAR(512) NOT NULL,
  mime_type      VARCHAR(128) NOT NULL,
  size_bytes     BIGINT NOT NULL,
  visibility     media_visibility NOT NULL DEFAULT 'private',
  -- users.id thực tế trên production là UUID (đã chuyển đổi qua docker/postgres/reconcile.sql,
  -- khác với khai báo gốc TEXT ở migrations/001) — dùng UUID để FK hợp lệ.
  uploader_id    UUID REFERENCES public.users(id) ON DELETE SET NULL,
  original_name  VARCHAR(255),
  source_table   VARCHAR(64),
  source_id      TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at     TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_media_object_key ON public.media(object_key);
CREATE INDEX IF NOT EXISTS idx_media_bucket           ON public.media(bucket);
CREATE INDEX IF NOT EXISTS idx_media_uploader_id       ON public.media(uploader_id);
CREATE INDEX IF NOT EXISTS idx_media_visibility        ON public.media(visibility);
CREATE INDEX IF NOT EXISTS idx_media_source            ON public.media(source_table, source_id);
CREATE INDEX IF NOT EXISTS idx_media_deleted_at        ON public.media(deleted_at) WHERE deleted_at IS NULL;

-- ── Cột liên kết trên 19 bảng nguồn đang lưu BYTEA (nullable — không phá dữ liệu/hành vi hiện tại) ──
ALTER TABLE public.ticket_attachments           ADD COLUMN IF NOT EXISTS media_id TEXT REFERENCES public.media(id) ON DELETE SET NULL;
ALTER TABLE public.document_attachments         ADD COLUMN IF NOT EXISTS media_id TEXT REFERENCES public.media(id) ON DELETE SET NULL;
ALTER TABLE public.announcement_attachments     ADD COLUMN IF NOT EXISTS media_id TEXT REFERENCES public.media(id) ON DELETE SET NULL;
ALTER TABLE public.attendance_records           ADD COLUMN IF NOT EXISTS media_id TEXT REFERENCES public.media(id) ON DELETE SET NULL;
ALTER TABLE public.contract_attachments         ADD COLUMN IF NOT EXISTS media_id TEXT REFERENCES public.media(id) ON DELETE SET NULL;
ALTER TABLE public.hr_documents                 ADD COLUMN IF NOT EXISTS media_id TEXT REFERENCES public.media(id) ON DELETE SET NULL;
ALTER TABLE public.hr_document_replace_requests ADD COLUMN IF NOT EXISTS media_id TEXT REFERENCES public.media(id) ON DELETE SET NULL;
ALTER TABLE public.evaluation_attachments       ADD COLUMN IF NOT EXISTS media_id TEXT REFERENCES public.media(id) ON DELETE SET NULL;
ALTER TABLE public.hr_cv_pool                   ADD COLUMN IF NOT EXISTS media_id TEXT REFERENCES public.media(id) ON DELETE SET NULL;
ALTER TABLE public.hr_jd_pool                   ADD COLUMN IF NOT EXISTS media_id TEXT REFERENCES public.media(id) ON DELETE SET NULL;
ALTER TABLE public.requisition_attachments      ADD COLUMN IF NOT EXISTS media_id TEXT REFERENCES public.media(id) ON DELETE SET NULL;
ALTER TABLE public.user_avatars                 ADD COLUMN IF NOT EXISTS media_id TEXT REFERENCES public.media(id) ON DELETE SET NULL;
ALTER TABLE public.company_logos                ADD COLUMN IF NOT EXISTS media_id TEXT REFERENCES public.media(id) ON DELETE SET NULL;
ALTER TABLE public.signature_images             ADD COLUMN IF NOT EXISTS media_id TEXT REFERENCES public.media(id) ON DELETE SET NULL;
ALTER TABLE public.solace_product_images        ADD COLUMN IF NOT EXISTS media_id TEXT REFERENCES public.media(id) ON DELETE SET NULL;
ALTER TABLE public.ecard_images                 ADD COLUMN IF NOT EXISTS media_id TEXT REFERENCES public.media(id) ON DELETE SET NULL;
ALTER TABLE public.email_attachments            ADD COLUMN IF NOT EXISTS media_id TEXT REFERENCES public.media(id) ON DELETE SET NULL;
ALTER TABLE public.expense_attachments          ADD COLUMN IF NOT EXISTS media_id TEXT REFERENCES public.media(id) ON DELETE SET NULL;
ALTER TABLE public.warehouse_photos             ADD COLUMN IF NOT EXISTS media_id TEXT REFERENCES public.media(id) ON DELETE SET NULL;
ALTER TABLE public.legal_document_files         ADD COLUMN IF NOT EXISTS media_id TEXT REFERENCES public.media(id) ON DELETE SET NULL;
ALTER TABLE public.legal_contract_files         ADD COLUMN IF NOT EXISTS media_id TEXT REFERENCES public.media(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ticket_attachments_media_id       ON public.ticket_attachments(media_id);
CREATE INDEX IF NOT EXISTS idx_document_attachments_media_id     ON public.document_attachments(media_id);
CREATE INDEX IF NOT EXISTS idx_announcement_attachments_media_id ON public.announcement_attachments(media_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_media_id       ON public.attendance_records(media_id);
CREATE INDEX IF NOT EXISTS idx_contract_attachments_media_id     ON public.contract_attachments(media_id);
CREATE INDEX IF NOT EXISTS idx_hr_documents_media_id             ON public.hr_documents(media_id);
CREATE INDEX IF NOT EXISTS idx_hdrr_media_id                     ON public.hr_document_replace_requests(media_id);
CREATE INDEX IF NOT EXISTS idx_evaluation_attachments_media_id   ON public.evaluation_attachments(media_id);
CREATE INDEX IF NOT EXISTS idx_hr_cv_pool_media_id               ON public.hr_cv_pool(media_id);
CREATE INDEX IF NOT EXISTS idx_hr_jd_pool_media_id               ON public.hr_jd_pool(media_id);
CREATE INDEX IF NOT EXISTS idx_requisition_attachments_media_id  ON public.requisition_attachments(media_id);
CREATE INDEX IF NOT EXISTS idx_user_avatars_media_id             ON public.user_avatars(media_id);
CREATE INDEX IF NOT EXISTS idx_company_logos_media_id            ON public.company_logos(media_id);
CREATE INDEX IF NOT EXISTS idx_signature_images_media_id         ON public.signature_images(media_id);
CREATE INDEX IF NOT EXISTS idx_solace_product_images_media_id    ON public.solace_product_images(media_id);
CREATE INDEX IF NOT EXISTS idx_ecard_images_media_id             ON public.ecard_images(media_id);
CREATE INDEX IF NOT EXISTS idx_email_attachments_media_id        ON public.email_attachments(media_id);
CREATE INDEX IF NOT EXISTS idx_expense_attachments_media_id      ON public.expense_attachments(media_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_photos_media_id         ON public.warehouse_photos(media_id);
CREATE INDEX IF NOT EXISTS idx_legal_document_files_media_id     ON public.legal_document_files(media_id);
CREATE INDEX IF NOT EXISTS idx_legal_contract_files_media_id     ON public.legal_contract_files(media_id);

SELECT 'Migration 302: media table + media_id columns created' AS migration_status;
