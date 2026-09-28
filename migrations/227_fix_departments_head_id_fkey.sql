-- Migration 227: sửa FK head_id trỏ nhầm bảng legacy.
-- Phát hiện trên DB dev: departments.head_id có FK → organization_users (bảng cũ không dùng)
-- khiến MỌI lần gán trưởng phòng đều fail FK. Chuẩn hoá: cả departments lẫn
-- sub_departments head_id đều FK → users(id) ON DELETE SET NULL. Idempotent.
DO $$
BEGIN
  -- Gỡ FK sai/thiếu chuẩn nếu có
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'departments_head_id_fkey') THEN
    ALTER TABLE departments DROP CONSTRAINT departments_head_id_fkey;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sub_departments_head_id_fkey') THEN
    ALTER TABLE sub_departments DROP CONSTRAINT sub_departments_head_id_fkey;
  END IF;

  -- Dọn giá trị mồ côi trước khi thêm FK (head trỏ user không tồn tại → NULL)
  UPDATE departments d SET head_id = NULL
   WHERE head_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = d.head_id);
  UPDATE sub_departments sd SET head_id = NULL
   WHERE head_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = sd.head_id);

  -- Bọc EXCEPTION: FK là ràng buộc bảo vệ thêm, KHÔNG được phép làm sập deploy
  -- nếu schema prod có biến thể chưa lường (bài học migration 225 — lỗi 42830).
  BEGIN
    ALTER TABLE departments
      ADD CONSTRAINT departments_head_id_fkey
      FOREIGN KEY (head_id) REFERENCES users(id) ON DELETE SET NULL;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'departments: không thêm được FK head_id (%) — bỏ qua', SQLERRM;
  END;
  BEGIN
    ALTER TABLE sub_departments
      ADD CONSTRAINT sub_departments_head_id_fkey
      FOREIGN KEY (head_id) REFERENCES users(id) ON DELETE SET NULL;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'sub_departments: không thêm được FK head_id (%) — bỏ qua', SQLERRM;
  END;
END $$;
