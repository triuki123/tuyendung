-- Migration 213: Khóa độc quyền ở TẦNG DB (chống race condition)
-- Quy tắc: mỗi CV chỉ được ở 1 giai đoạn "cam kết" (interviewed/offered/hired) tại 1 vị trí.
-- App đã kiểm tra ở tầng logic, nhưng 2 request đồng thời có thể lách qua — partial unique
-- index đảm bảo cứng, Postgres tự chối cái thứ 2.

-- Dọn trùng (nếu có) trước khi tạo unique index: giữ bản cam kết mới nhất, hạ các bản còn
-- lại về 'screening' (an toàn — không mất liên kết, chỉ đổi trạng thái).
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (
           PARTITION BY cv_id ORDER BY updated_at DESC NULLS LAST, created_at DESC
         ) AS rn
    FROM hr_applications
   WHERE status IN ('interviewed','offered','hired')
)
UPDATE hr_applications a
   SET status = 'screening', updated_at = NOW()
  FROM ranked r
 WHERE a.id = r.id AND r.rn > 1;

-- Mỗi cv_id chỉ xuất hiện tối đa 1 lần trong tập giai đoạn cam kết.
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_app_committed_per_cv
  ON hr_applications (cv_id)
  WHERE status IN ('interviewed','offered','hired');
