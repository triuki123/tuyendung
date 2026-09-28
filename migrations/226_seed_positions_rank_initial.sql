-- Migration 226: seed MỘT LẦN cấp bậc ban đầu cho positions (đang toàn default 4)
-- theo cùng luật tên như migration 035 từng seed job_titles — để khi Phase 4 chuyển
-- hệ quyền sang positions.rank thì hành vi GIỮ NGUYÊN (Giám đốc vẫn rank 1...).
-- Sau seed này, cấp bậc CHỈ chỉnh qua UI Chức Vụ — không suy đoán theo tên nữa.
-- Chỉ đụng dòng còn rank mặc định 4 (không ghi đè giá trị HR đã chỉnh).

UPDATE positions SET "rank" = 1
 WHERE COALESCE("rank", 4) = 4 AND (
   name ILIKE '%giám đốc%' OR name ILIKE '%giam doc%' OR name ILIKE '%director%'
   OR name ILIKE '%ceo%' OR name ILIKE '%chủ tịch%' OR name ILIKE '%chu tich%'
   OR name ILIKE '%tổng giám đốc%' OR name ILIKE '%cố vấn%' OR name ILIKE '%co van%'
 );

UPDATE positions SET "rank" = 2
 WHERE COALESCE("rank", 4) = 4 AND (
   name ILIKE '%trưởng phòng%' OR name ILIKE '%truong phong%' OR name ILIKE '%phó phòng%'
   OR name ILIKE '%pho phong%' OR name ILIKE '%manager%' OR name ILIKE '%quản lý%'
   OR name ILIKE '%quan ly%' OR name ILIKE '%trưởng kho%'
 );

UPDATE positions SET "rank" = 3
 WHERE COALESCE("rank", 4) = 4 AND (
   name ILIKE '%trưởng bộ phận%' OR name ILIKE '%truong bo phan%'
   OR name ILIKE '%phó bộ phận%' OR name ILIKE '%team lead%' OR name ILIKE '%supervisor%'
   OR name ILIKE '%trưởng nhóm%'
 );

UPDATE positions SET "rank" = 5
 WHERE COALESCE("rank", 4) = 4 AND (
   name ILIKE '%thực tập%' OR name ILIKE '%thuc tap%' OR name ILIKE '%intern%'
 );
