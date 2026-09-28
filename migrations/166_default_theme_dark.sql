-- Migration 166: Giao diện TỐI là mặc định.
-- Trước đây cột preferred_theme default 'light' nhưng CSS chưa từng render light
-- ⇒ mọi người luôn thấy tối. Đổi default sang 'dark' và dọn các giá trị 'light'/NULL
-- cũ (chưa từng có hiệu lực) về 'dark' để tránh bất ngờ khi light mode bật thật.
-- Đảm bảo cột tồn tại (một số DB chưa chạy migration 043)
ALTER TABLE users ADD COLUMN IF NOT EXISTS "preferred_theme" TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "preferred_language" TEXT DEFAULT 'vi';

ALTER TABLE users ALTER COLUMN "preferred_theme" SET DEFAULT 'dark';

UPDATE users
   SET "preferred_theme" = 'dark'
 WHERE "preferred_theme" IS NULL
    OR "preferred_theme" = 'light';
