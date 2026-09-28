-- Migration 196: BACKFILL — cut biên bản của các thẻ đánh giá ĐÃ ĐẠT (luồng cũ) vào hồ sơ nhân sự.
-- Trước đây luồng cũ không chuyển biên bản vào hồ sơ → làm 1 lần cho đồng nhất.
-- Idempotent: chạy lại không nhân bản vì nguồn (evaluation_attachments) đã bị xoá sau khi cut.

-- 1) Sao nội dung biên bản của thẻ status='passed' sang hr_documents.
INSERT INTO public.hr_documents
  (id, employee_id, doc_type_id, title, file_name, mime_type, size_bytes, content, uploaded_by)
SELECT 'hrd_' || (extract(epoch FROM now())*1000)::bigint || '_' || substr(md5(random()::text), 1, 8),
       e.employee_id, 'hdoc_probation_eval', 'Biên bản đánh giá thử việc',
       a.file_name, a.mime_type, a.size_bytes::int, a.content, e.concluded_by
  FROM public.evaluation_attachments a
  JOIN public.evaluations e ON e.id = a.evaluation_id
 WHERE e.status = 'passed' AND a.deleted_at IS NULL;

-- 2) Xoá hẳn bản gốc khỏi thẻ đánh giá (đúng semantics CUT — file chỉ còn ở hồ sơ).
DELETE FROM public.evaluation_attachments a
 USING public.evaluations e
 WHERE a.evaluation_id = e.id AND e.status = 'passed' AND a.deleted_at IS NULL;
