-- Migration 261: sửa lỗi "invalid input syntax for type json" khi CẤP PHÁT tài sản.
-- Một số DB legacy có cột trên bảng assets bị tạo dưới dạng json/jsonb (assigned_to,
-- assigned_to_name, company_id, department_id, sub_department_id). Route kiểm kê ghi
-- UUID/tên trơn (không phải JSON hợp lệ) → lỗi khi assign; recover ghi NULL nên không lộ.
-- ADD COLUMN IF NOT EXISTS ở các migration trước KHÔNG đổi kiểu cột đã tồn tại → phải ép ở đây.
-- Idempotent: chỉ ép khi cột đang là json/jsonb; đã đúng kiểu thì bỏ qua.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT column_name, data_type
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'assets'
       AND column_name IN ('assigned_to','assigned_to_name','company_id','department_id','sub_department_id')
       AND data_type IN ('json','jsonb')
  LOOP
    IF r.column_name IN ('assigned_to','assigned_to_name') THEN
      EXECUTE format('ALTER TABLE public.assets ALTER COLUMN %I TYPE TEXT USING (%I #>> ''{}'')', r.column_name, r.column_name);
    ELSE
      EXECUTE format('ALTER TABLE public.assets ALTER COLUMN %I TYPE UUID USING NULLIF(%I #>> ''{}'', '''')::uuid', r.column_name, r.column_name);
    END IF;
    RAISE NOTICE '[261] Ép assets.% từ % về kiểu chuẩn', r.column_name, r.data_type;
  END LOOP;
END $$;
