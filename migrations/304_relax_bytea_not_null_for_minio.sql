-- Migration 304: nới NOT NULL trên các cột BYTEA nguồn — từ nay upload mới đẩy sang MinIO
-- (media_id trỏ bảng media, cột BYTEA để NULL). Dữ liệu cũ giữ nguyên, dual-read ở tầng route.
-- ALTER COLUMN ... DROP NOT NULL vốn idempotent (chạy lại không lỗi khi đã nullable).

DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('ticket_attachments',           'content'),
      ('document_attachments',         'content'),
      ('announcement_attachments',     'content'),
      ('attendance_records',           'photo'),
      ('contract_attachments',         'content'),
      ('hr_documents',                 'content'),
      ('hr_document_replace_requests', 'new_content'),
      ('evaluation_attachments',       'content'),
      ('hr_cv_pool',                   'content'),
      ('hr_jd_pool',                   'content'),
      ('requisition_attachments',      'content'),
      ('user_avatars',                 'content'),
      ('company_logos',                'content'),
      ('signature_images',             'content'),
      ('solace_product_images',        'content'),
      ('ecard_images',                 'content'),
      ('email_attachments',            'content'),
      ('expense_attachments',          'content'),
      ('warehouse_photos',             'content'),
      ('legal_document_files',         'content'),
      ('legal_contract_files',         'content')
    ) AS v(tbl, col)
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t.tbl AND column_name = t.col
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I DROP NOT NULL', t.tbl, t.col);
    END IF;
  END LOOP;
END $$;
