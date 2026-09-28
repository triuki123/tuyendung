-- Migration 268: Dọn 5 chức danh SEED THỬ NGHIỆM lọt vào production do migration 030
-- (030_seed_job_titles_for_users.sql chọn "company đầu tiên" bằng LIMIT 1 — vô tình trúng
-- công ty thật). users.job_title_id có ON DELETE SET NULL nên xóa job_titles ở đây an toàn:
-- người dùng đang bị gán nhầm sẽ tự về "chưa có chức danh", không mất dữ liệu nào khác.
DELETE FROM public.job_titles
 WHERE title IN ('Kỹ Sư Hệ Thống', 'Nhân Viên Hỗ Trợ', 'Trưởng Phòng', 'Quản Lý Dự Án', 'Nhân Viên Kỹ Thuật');
